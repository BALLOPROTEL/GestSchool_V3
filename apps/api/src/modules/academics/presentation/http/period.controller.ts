import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  HttpCode,
} from '@nestjs/common';
import { AcademicService } from '../../application/academic.service.js';
import { academicReadScopes, academicWriteScopes } from '../../domain/policy.js';
import {
  RequirePermission,
  requestContext,
  type IamRequest,
} from '../../../iam/presentation/http/security.js';
@Controller('api/v1')
export class PeriodController {
  constructor(@Inject(AcademicService) private readonly service: AcademicService) {}
  @Get('academic-years/:yearId/periods')
  @RequirePermission('academic-periods.read', academicReadScopes)
  list(@Req() request: IamRequest, @Param('yearId') yearId: string, @Query() query: unknown) {
    return this.service.list(requestContext(request), 'academic-periods', query, yearId);
  }
  @Post('academic-years/:yearId/periods')
  @RequirePermission('academic-periods.create', academicWriteScopes)
  create(@Req() request: IamRequest, @Param('yearId') yearId: string, @Body() body: unknown) {
    return this.service.createPeriod(requestContext(request), yearId, body);
  }
  @Patch('academic-periods/:id')
  @RequirePermission('academic-periods.update', academicWriteScopes)
  update(@Req() request: IamRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.update(requestContext(request), 'academic-periods', id, body);
  }
  @Post('academic-periods/:id/archive')
  @HttpCode(200)
  @RequirePermission('academic-periods.archive', academicWriteScopes)
  archive(@Req() request: IamRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.archive(requestContext(request), 'academic-periods', id, false, body);
  }
}
