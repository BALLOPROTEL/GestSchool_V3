import { Body, Controller, Get, Inject, Put, Query, Req, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { AttendanceService } from '../../application/attendance.service.js';
import {
  attendanceExportScopes,
  attendanceReadScopes,
  attendanceWriteScopes,
} from '../../domain/policy.js';
import {
  RequirePermission,
  requestContext,
  type IamRequest,
} from '../../../iam/presentation/http/security.js';

@Controller('api/v1/attendance')
export class AttendanceController {
  constructor(@Inject(AttendanceService) private readonly service: AttendanceService) {}

  @Get('sheet')
  @RequirePermission('attendance.read', attendanceReadScopes)
  sheet(@Req() req: IamRequest, @Query() query: unknown) {
    return this.service.sheet(requestContext(req), query);
  }

  @Put('sheet')
  @RequirePermission('attendance.write', attendanceWriteScopes)
  write(@Req() req: IamRequest, @Body() input: unknown) {
    return this.service.write(requestContext(req), input);
  }

  @Get('history')
  @RequirePermission('attendance.read', attendanceReadScopes)
  history(@Req() req: IamRequest, @Query() query: unknown) {
    return this.service.history(requestContext(req), query);
  }

  @Get('export')
  @RequirePermission('attendance.export', attendanceExportScopes)
  async export(
    @Req() req: IamRequest,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.service.export(requestContext(req), query);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    return new StreamableFile(Buffer.from(file.bytes), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${file.fileName}"`,
      length: file.bytes.length,
    });
  }
}
