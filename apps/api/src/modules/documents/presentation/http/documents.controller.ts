import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { DocumentsService } from '../../application/documents.service.js';
import { documentReadScopes, documentWriteScopes } from '../../domain/policy.js';
import {
  Public,
  RequirePermission,
  requestContext,
  type IamRequest,
} from '../../../iam/presentation/http/security.js';

@Controller('api/v1')
export class DocumentsController {
  constructor(@Inject(DocumentsService) private readonly service: DocumentsService) {}
  @Get('documents')
  @RequirePermission('documents.read', documentReadScopes)
  list(@Req() req: IamRequest, @Query() q: unknown) {
    return this.service.list(requestContext(req), q);
  }
  @Get('documents/sources')
  @RequirePermission('documents.generate', documentWriteScopes)
  sources(@Req() req: IamRequest, @Query() q: unknown) {
    return this.service.sources(requestContext(req), q);
  }
  @Get('documents/:id')
  @RequirePermission('documents.read', documentReadScopes)
  detail(@Req() req: IamRequest, @Param('id') id: string) {
    return this.service.detail(requestContext(req), id);
  }
  @Post('documents/generate')
  @HttpCode(202)
  @RequirePermission('documents.generate', documentWriteScopes)
  generate(
    @Req() req: IamRequest,
    @Body() input: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.service.generate(requestContext(req), input, key);
  }
  @Get('documents/:id/download')
  @RequirePermission('documents.download', documentReadScopes)
  async download(
    @Req() req: IamRequest,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { bytes, fileName } = await this.service.download(requestContext(req), id);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    return new StreamableFile(Buffer.from(bytes), {
      type: 'application/pdf',
      disposition: `attachment; filename="${fileName}"`,
      length: bytes.length,
    });
  }
  @Post('documents/:id/revoke')
  @HttpCode(200)
  @RequirePermission('documents.revoke', documentWriteScopes)
  revoke(@Req() req: IamRequest, @Param('id') id: string, @Body() input: unknown) {
    return this.service.revoke(requestContext(req), id, input);
  }
  @Post('documents/:id/reissue')
  @HttpCode(202)
  @RequirePermission('documents.reissue', documentWriteScopes)
  reissue(
    @Req() req: IamRequest,
    @Param('id') id: string,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.service.reissue(requestContext(req), id, key);
  }
  @Get('document-templates')
  @RequirePermission('document-templates.read', documentWriteScopes)
  templates(@Req() req: IamRequest) {
    return this.service.templates(requestContext(req));
  }
  @Post('document-templates')
  @RequirePermission('document-templates.manage', documentWriteScopes)
  publish(@Req() req: IamRequest, @Body() input: unknown) {
    return this.service.publishTemplate(requestContext(req), input);
  }
  @Get('public/documents/verify/:token')
  @Public()
  verify(@Req() req: IamRequest, @Param('token') token: string) {
    return this.service.verify(token, req.metadata.ipAddress);
  }
}
