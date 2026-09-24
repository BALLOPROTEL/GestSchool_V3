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
import { ReportsService } from '../../application/reports.service.js';
import {
  RequirePermission,
  requestContext,
  type IamRequest,
} from '../../../iam/presentation/http/security.js';
const scopes = ['PLATFORM', 'TENANT', 'ASSIGNED', 'CHILDREN', 'OWN'] as const;
@Controller('api/v1')
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly service: ReportsService) {}
  @Get('reports/:type')
  @RequirePermission('reports.read', scopes)
  page(@Req() request: IamRequest, @Param('type') type: string, @Query() query: unknown) {
    return this.service.page(requestContext(request), type, query);
  }
  @Post('report-exports')
  @HttpCode(202)
  @RequirePermission('reports.export', scopes)
  create(
    @Req() request: IamRequest,
    @Body() input: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.service.create(requestContext(request), input, key);
  }
  @Get('report-exports')
  @RequirePermission('reports.read', scopes)
  history(@Req() request: IamRequest, @Query() query: unknown) {
    return this.service.history(requestContext(request), query);
  }
  @Get('report-exports/:id/download')
  @RequirePermission('reports.export', scopes)
  async download(
    @Req() request: IamRequest,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.service.download(requestContext(request), id);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    return new StreamableFile(Buffer.from(file.bytes), {
      type: file.mimeType,
      disposition: `attachment; filename="${file.fileName}"`,
      length: file.bytes.length,
    });
  }
}
