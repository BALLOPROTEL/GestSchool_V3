import { Body, Controller, Get, Inject, Put, Query, Req } from '@nestjs/common';
import { AttendanceService } from '../../application/attendance.service.js';
import {
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
}
