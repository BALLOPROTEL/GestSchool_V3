import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
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
import type { NestExpressApplication } from '@nestjs/platform-express';
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
import {
  elapsed,
  iamDiagnostic,
  iamHttpOperation,
} from '../../infrastructure/operational-diagnostics.js';

export interface IamRequest extends Request {
  iamStartedAt?: number;
  metadata: RequestMetadata;
  claims?: AccessClaims;
  context?: RequestContext;
}
const PUBLIC = 'iam:public';
const PERMISSION = 'iam:permission';
// gradeBulkInput supports 1000 rows (5003 visited nodes) with 500-character
// comments. JSON escaping can use six bytes per character, so allow 4 MiB.
const JSON_BODY_LIMIT = '4mb';
const MAX_BODY_NODES = 8192;
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
  const server = app.getHttpAdapter().getInstance() as {
    disable: (name: string) => void;
    set: (name: string, value: unknown) => void;
  };
  server.disable('x-powered-by');
  server.set('trust proxy', process.env['TRUST_PROXY'] === 'loopback' ? 'loopback' : false);
  app.use((request: IamRequest, response: Response, next: () => void) => {
    request.iamStartedAt = performance.now();
    request.metadata = {
      requestId: randomUUID(),
      ipAddress: request.ip ?? request.socket.remoteAddress ?? 'unknown',
      userAgent: (request.get('user-agent') ?? '').slice(0, 512),
    };
    response.setHeader('X-Request-ID', request.metadata.requestId);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (iam.config.secure) response.setHeader('Strict-Transport-Security', 'max-age=31536000');
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
  const express = app as NestExpressApplication;
  express.useBodyParser('json', { limit: JSON_BODY_LIMIT, inflate: false, strict: true });
  express.useBodyParser('urlencoded', {
    limit: '16kb',
    inflate: false,
    extended: false,
    parameterLimit: 50,
  });
  app.use((request: IamRequest, response: Response, next: () => void) => {
    const params = new URL(request.originalUrl, 'http://internal').searchParams;
    const keys = [...params.keys()];
    const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
    let nodes = 0;
    const unsafe = (value: unknown, depth = 0): boolean => {
      if (++nodes > MAX_BODY_NODES || depth > 12) return true;
      return (
        value !== null &&
        typeof value === 'object' &&
        Object.entries(value).some(
          ([key, nested]) => forbidden.has(key) || unsafe(nested, depth + 1),
        )
      );
    };
    if (
      keys.length > 50 ||
      new Set(keys).size !== keys.length ||
      keys.some((key) => forbidden.has(key)) ||
      unsafe(request.body)
    ) {
      response
        .status(400)
        .json({ code: 'AUTH_INVALID_REQUEST', status: 400, requestId: request.metadata.requestId });
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
    if (request.method === 'POST' && request.path === '/api/v1/webhooks/brevo') {
      // Brevo has no browser Origin or CSRF cookie. Only this exact endpoint is
      // exempt; its controller verifies a dedicated provider Bearer credential.
      if (!request.is('application/json')) deny('AUTH_INVALID_REQUEST', 400);
      await this.iam.limiter.check(request.path, request.metadata.ipAddress);
      return true;
    }
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
        : typeof fields['identifier'] === 'string'
          ? fields['identifier'].trim().toLowerCase()
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
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const endpoint = request.route?.path as string | undefined;
      if (endpoint?.includes('exports') || endpoint?.includes('communications'))
        await this.iam.limiter.checkTenantAction(
          endpoint,
          request.context.tenantId,
          request.context.userId,
        );
    }
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
            : exception &&
                typeof exception === 'object' &&
                'status' in exception &&
                [400, 413, 415].includes(Number(exception.status))
              ? Number(exception.status)
              : 500;
    const code =
      exception instanceof IamError
        ? exception.code
        : status === 400
          ? 'AUTH_INVALID_REQUEST'
          : status === 404
            ? 'NOT_FOUND'
            : status === 413
              ? 'PAYLOAD_TOO_LARGE'
              : status === 415
                ? 'UNSUPPORTED_MEDIA_TYPE'
                : 'AUTH_UNAVAILABLE';
    const requestId = request.metadata?.requestId ?? randomUUID();
    if (status >= 500) {
      let diagnostics: ReturnType<typeof iamDiagnostic> = {
        diagnostic: 'LOT14_AUTH_INTERNAL_ERROR',
        reason: 'UNKNOWN',
      };
      try {
        diagnostics = iamDiagnostic(exception);
      } catch {
        /* Diagnostics never replace the original response. */
      }
      this.logger.error(
        JSON.stringify({
          code,
          status,
          requestId,
          operation: iamHttpOperation(request.path),
          durationMs: request.iamStartedAt === undefined ? 0 : elapsed(request.iamStartedAt),
          ...diagnostics,
          // Only the static Express/Nest template, never originalUrl, params or headers.
          ...(typeof request.route?.path === 'string' &&
          request.route.path.length <= 160 &&
          /^\/(?:api\/v1|health)\/(?:[a-z-]+|:[a-zA-Z]+)(?:\/(?:[a-z-]+|:[a-zA-Z]+))*$/.test(
            request.route.path,
          )
            ? { route: request.route.path }
            : {}),
          ...(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(request.method)
            ? { method: request.method }
            : {}),
        }),
      );
    }
    if (status === 429) response.setHeader('Retry-After', '60');
    response.status(status).json({ code, status, requestId });
  }
}
