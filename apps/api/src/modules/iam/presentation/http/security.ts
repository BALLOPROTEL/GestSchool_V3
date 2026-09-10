import { randomUUID } from 'node:crypto';
import {
  Catch,
  HttpException,
  Inject,
  Injectable,
  Logger,
  SetMetadata,
  type ArgumentsHost,
  type CanActivate,
  type ExceptionFilter,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response, CookieOptions } from 'express';
import type { AccessScope } from '@gestschool/contracts';
import { ZodError } from 'zod';
import {
  IamError,
  deny,
  type AccessClaims,
  type RequestContext,
  type RequestMetadata,
} from '../../domain/context.js';
import { safeEqual, tokenHash } from '../../infrastructure/crypto.js';
import { IamRuntime } from '../../infrastructure/iam-runtime.js';

export interface IamRequest extends Request {
  metadata: RequestMetadata;
  claims?: AccessClaims;
  context?: RequestContext;
}
const PUBLIC = 'iam:public';
const PERMISSION = 'iam:permission';
export const Public = () => SetMetadata(PUBLIC, true);
export const RequirePermission = (
  permission: string,
  scopes: readonly AccessScope[] = ['OWN', 'TENANT', 'PLATFORM'],
) => SetMetadata(PERMISSION, { permission, scopes });
const isPublic = (reflector: Reflector, context: ExecutionContext): boolean =>
  reflector.getAllAndOverride<boolean>(PUBLIC, [context.getHandler(), context.getClass()]) === true;
export function cookie(request: Request, name: string): string {
  const values = (request.headers.cookie ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  if (values.length !== 1) return '';
  return values[0]?.slice(name.length + 1) ?? '';
}
export const csrfCookie = (iam: IamRuntime): string =>
  iam.config.secure ? '__Host-gs_csrf' : 'gs_csrf';
export const refreshCookie = (iam: IamRuntime): string =>
  iam.config.secure ? '__Secure-gs_refresh' : 'gs_refresh';
export function cookieOptions(iam: IamRuntime, refresh: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: iam.config.secure,
    sameSite: 'strict',
    path: refresh ? '/api/v1/auth' : '/',
  };
}
export function requestContext(request: IamRequest): RequestContext {
  if (!request.context) deny();
  return request.context;
}

export function configureIamHttp(app: INestApplication): void {
  const iam = app.get(IamRuntime);
  app.use((request: IamRequest, response: Response, next: () => void) => {
    request.metadata = {
      requestId: randomUUID(),
      ipAddress: request.socket.remoteAddress ?? 'unknown',
      userAgent: (request.get('user-agent') ?? '').slice(0, 512),
    };
    response.setHeader('X-Request-ID', request.metadata.requestId);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    if (!request.path.startsWith('/api/v1')) {
      next();
      return;
    }
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Vary', 'Origin');
    const origin = request.get('origin');
    if (origin && !iam.config.origins.includes(origin)) {
      response
        .status(403)
        .json({ code: 'AUTH_ORIGIN_REJECTED', status: 403, requestId: request.metadata.requestId });
      return;
    }
    if (origin) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    if (request.method === 'OPTIONS') {
      if (!origin) {
        response.status(403).json({
          code: 'AUTH_ORIGIN_REJECTED',
          status: 403,
          requestId: request.metadata.requestId,
        });
        return;
      }
      response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      response.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type,Authorization,X-CSRF-Token,Idempotency-Key',
      );
      response.setHeader('Access-Control-Max-Age', '600');
      response.status(204).end();
      return;
    }
    next();
  });
  app.enableShutdownHooks();
}

@Injectable()
export class BrowserSecurityGuard implements CanActivate {
  constructor(@Inject(IamRuntime) private readonly iam: IamRuntime) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<IamRequest>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    const origin = request.get('origin');
    const csrf = request.get('x-csrf-token') ?? '';
    if (!origin || !this.iam.config.origins.includes(origin)) deny('AUTH_ORIGIN_REJECTED', 403);
    if (!this.iam.crypto.validCsrf(csrf) || !safeEqual(csrf, cookie(request, csrfCookie(this.iam))))
      deny('AUTH_CSRF_REJECTED', 403);
    if (!request.is('application/json') && request.method !== 'DELETE')
      deny('AUTH_INVALID_REQUEST', 400);
    const body: unknown = request.body;
    const fields =
      typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    let identifier =
      typeof fields['email'] === 'string'
        ? fields['email'].trim().toLowerCase()
        : typeof fields['challenge'] === 'string'
          ? fields['challenge']
          : undefined;
    if (request.path.endsWith('/refresh')) {
      const hash = cookie(request, refreshCookie(this.iam));
      if (hash.length === 43)
        identifier = (await this.iam.repository.refresh(tokenHash(hash)))?.session.userId;
    }
    await this.iam.limiter.check(request.path, request.metadata.ipAddress, identifier);
    return true;
  }
}
@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(IamRuntime) private readonly iam: IamRuntime,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (isPublic(this.reflector, context)) return true;
    const request = context.switchToHttp().getRequest<IamRequest>();
    const header = request.get('authorization');
    if (!header?.startsWith('Bearer ')) deny('AUTH_REQUIRED', 401);
    request.claims = await this.iam.crypto.verify(header.slice(7));
    return true;
  }
}
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(IamRuntime) private readonly iam: IamRuntime,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (isPublic(this.reflector, context)) return true;
    const request = context.switchToHttp().getRequest<IamRequest>();
    if (!request.claims) deny('AUTH_REQUIRED', 401);
    request.context = await this.iam.sessions.context(request.claims, request.metadata);
    return true;
  }
}
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<IamRequest>();
    if (request.get('x-tenant-id')) deny('AUTH_TENANT_REJECTED', 403);
    if (!isPublic(this.reflector, context) && !request.context?.tenantId) deny();
    return true;
  }
}
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    if (isPublic(this.reflector, context)) return true;
    const policy = this.reflector.getAllAndOverride<
      { permission: string; scopes: readonly AccessScope[] } | undefined
    >(PERMISSION, [context.getHandler(), context.getClass()]);
    const request = context.switchToHttp().getRequest<IamRequest>();
    if (
      !policy ||
      !request.context?.grants.some(
        (grant) => grant.permission === policy.permission && policy.scopes.includes(grant.scope),
      )
    )
      deny();
    return true;
  }
}
@Catch()
export class IamExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('IAM');
  catch(exception: unknown, host: ArgumentsHost): void {
    const request = host.switchToHttp().getRequest<IamRequest>();
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof IamError
        ? exception.status
        : exception instanceof ZodError
          ? 400
          : exception instanceof HttpException
            ? exception.getStatus()
            : 500;
    const code =
      exception instanceof IamError
        ? exception.code
        : status === 400
          ? 'AUTH_INVALID_REQUEST'
          : status === 404
            ? 'NOT_FOUND'
            : 'AUTH_UNAVAILABLE';
    const requestId = request.metadata?.requestId ?? randomUUID();
    if (status >= 500) this.logger.error(JSON.stringify({ code, requestId }));
    if (status === 429) response.setHeader('Retry-After', '60');
    response.status(status).json({ code, status, requestId });
  }
}
