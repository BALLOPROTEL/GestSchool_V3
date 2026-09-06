import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { scopes } from '@gestschool/contracts';
import { IamRuntime } from '../../infrastructure/iam-runtime.js';
import type { SessionResult } from '../../application/sessions.service.js';
import {
  Public,
  RequirePermission,
  cookie,
  cookieOptions,
  csrfCookie,
  refreshCookie,
  requestContext,
  type IamRequest,
} from './security.js';

const email = z
  .email()
  .max(254)
  .transform((value) => value.trim().toLowerCase());
const password = z.string().min(1).max(256);
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const code = z.string().regex(/^\d{6}$/);
const id = z.uuid();
const complete = z.strictObject({ token, password });
const mfa = z.strictObject({ challenge: token, code });
@Controller('api/v1/auth')
export class AuthController {
  constructor(@Inject(IamRuntime) private readonly iam: IamRuntime) {}
  private session(response: Response, result: SessionResult) {
    response.cookie(refreshCookie(this.iam), result.refresh, {
      ...cookieOptions(this.iam, true),
      expires: result.expiresAt,
    });
    return result.body;
  }
  private clear(response: Response): void {
    response.clearCookie(refreshCookie(this.iam), cookieOptions(this.iam, true));
  }
  @Public()
  @Get('csrf')
  csrf(@Req() request: IamRequest, @Res({ passthrough: true }) response: Response) {
    const current = cookie(request, csrfCookie(this.iam));
    const csrfToken = this.iam.crypto.validCsrf(current) ? current : this.iam.crypto.csrf();
    response.cookie(csrfCookie(this.iam), csrfToken, cookieOptions(this.iam, false));
    return { csrfToken, hasSession: Boolean(cookie(request, refreshCookie(this.iam))) };
  }
  @Public()
  @Post('login')
  async login(
    @Body() body: unknown,
    @Req() request: IamRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = z.strictObject({ email, password }).parse(body);
    const result = await this.iam.auth.login(input.email, input.password, request.metadata);
    return 'refresh' in result ? this.session(response, result) : result.body;
  }
  @Public()
  @Post('refresh')
  async refresh(@Req() request: IamRequest, @Res({ passthrough: true }) response: Response) {
    try {
      return this.session(
        response,
        await this.iam.sessions.refresh(cookie(request, refreshCookie(this.iam)), request.metadata),
      );
    } catch (error) {
      this.clear(response);
      throw error;
    }
  }
  @RequirePermission('session.read')
  @Get('me')
  async me(@Req() request: IamRequest) {
    return this.iam.users.profile(requestContext(request));
  }
  @RequirePermission('session.read')
  @Get('sessions')
  sessions(@Req() request: IamRequest) {
    return this.iam.sessions.list(requestContext(request));
  }
  @RequirePermission('session.revoke')
  @Delete('sessions/:id')
  async revoke(
    @Param('id') sessionId: string,
    @Req() request: IamRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.iam.sessions.revoke(requestContext(request), id.parse(sessionId));
    if (sessionId === requestContext(request).sessionId) this.clear(response);
    return { ok: true };
  }
  @RequirePermission('session.revoke')
  @Post('logout')
  async logout(@Req() request: IamRequest, @Res({ passthrough: true }) response: Response) {
    await this.iam.sessions.revoke(requestContext(request), requestContext(request).sessionId);
    this.clear(response);
    return { ok: true };
  }
  @RequirePermission('session.revoke')
  @Post('logout-all')
  async logoutAll(@Req() request: IamRequest, @Res({ passthrough: true }) response: Response) {
    await this.iam.sessions.revoke(requestContext(request));
    this.clear(response);
    return { ok: true };
  }
  @RequirePermission('membership.read')
  @Get('memberships')
  memberships(@Req() request: IamRequest) {
    return this.iam.memberships.list(requestContext(request).userId);
  }
  @RequirePermission('tenant.switch')
  @Post('switch-tenant')
  async switch(
    @Body() body: unknown,
    @Req() request: IamRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = z.strictObject({ membershipId: id }).parse(body);
    return this.session(
      response,
      await this.iam.sessions.switch(requestContext(request), input.membershipId),
    );
  }
  @Public()
  @Post('forgot-password')
  async forgot(@Body() body: unknown, @Req() request: IamRequest) {
    const input = z.strictObject({ email }).parse(body);
    await this.iam.credentials.forgot(input.email, request.metadata);
    return { ok: true };
  }
  @Public()
  @Post('reset-password')
  async reset(
    @Body() body: unknown,
    @Req() request: IamRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = complete.parse(body);
    await this.iam.credentials.complete(
      input.token,
      input.password,
      'PASSWORD_RESET',
      request.metadata,
    );
    this.clear(response);
    return { ok: true };
  }
  @Public()
  @Post('activation')
  async activate(@Body() body: unknown, @Req() request: IamRequest) {
    const input = complete.parse(body);
    await this.iam.credentials.complete(
      input.token,
      input.password,
      'ACTIVATION',
      request.metadata,
    );
    return { ok: true };
  }
  @RequirePermission('mfa.manage')
  @Post('mfa/setup')
  setup(@Body() body: unknown, @Req() request: IamRequest) {
    return this.iam.mfa.setup(
      requestContext(request),
      z.strictObject({ password }).parse(body).password,
    );
  }
  @Public()
  @Post('mfa/enroll')
  enroll(@Body() body: unknown) {
    return this.iam.mfa.enroll(z.strictObject({ challenge: token }).parse(body).challenge);
  }
  @Public()
  @Post('mfa/confirm')
  async confirm(
    @Body() body: unknown,
    @Req() request: IamRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = mfa.parse(body);
    return this.session(
      response,
      await this.iam.mfa.verify(input.challenge, input.code, true, request.metadata),
    );
  }
  @Public()
  @Post('mfa/verify')
  async verify(
    @Body() body: unknown,
    @Req() request: IamRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = mfa.parse(body);
    return this.session(
      response,
      await this.iam.mfa.verify(input.challenge, input.code, false, request.metadata),
    );
  }
  @RequirePermission('mfa.manage')
  @Post('mfa/disable')
  async disable(
    @Body() body: unknown,
    @Req() request: IamRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = z.strictObject({ password, code }).parse(body);
    await this.iam.mfa.disable(requestContext(request), input.password, input.code);
    this.clear(response);
    return { ok: true };
  }
}

@Controller('api/v1/iam')
export class IamAdminController {
  constructor(@Inject(IamRuntime) private readonly iam: IamRuntime) {}
  @RequirePermission('users.invite', ['TENANT', 'PLATFORM'])
  @Post('invitations')
  async invite(@Body() body: unknown, @Req() request: IamRequest) {
    const input = z
      .strictObject({ email, displayName: z.string().trim().min(1).max(160), roleId: id })
      .parse(body);
    await this.iam.users.invite(
      requestContext(request),
      input.email,
      input.displayName,
      input.roleId,
    );
    return { ok: true };
  }
  @RequirePermission('roles.assign', ['TENANT', 'PLATFORM'])
  @Put('memberships/:id/role')
  async assign(
    @Param('id') membershipId: string,
    @Body() body: unknown,
    @Req() request: IamRequest,
  ) {
    await this.iam.users.assign(
      requestContext(request),
      id.parse(membershipId),
      z.strictObject({ roleId: id }).parse(body).roleId,
    );
    return { ok: true };
  }
  @RequirePermission('permissions.manage', ['PLATFORM'])
  @Put('roles/:id/permissions')
  async grant(@Param('id') roleId: string, @Body() body: unknown, @Req() request: IamRequest) {
    const input = z.strictObject({ permissionId: id, scope: z.enum(scopes) }).parse(body);
    await this.iam.users.permission(
      requestContext(request),
      id.parse(roleId),
      input.permissionId,
      input.scope,
    );
    return { ok: true };
  }
}
