import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { EnrollmentService } from '../../application/enrollment.service.js';
import { enrollmentReadScopes, enrollmentWriteScopes } from '../../domain/policy.js';
import {
  RequirePermission,
  requestContext,
  type IamRequest,
} from '../../../iam/presentation/http/security.js';
@Controller('api/v1/enrollments')
export class EnrollmentController {
  constructor(@Inject(EnrollmentService) private readonly service: EnrollmentService) {}
  @Get()
  @RequirePermission('enrollments.read', enrollmentReadScopes)
  list(@Req() req: IamRequest, @Query() query: unknown) {
    return this.service.list(requestContext(req), query);
  }
  @Post()
  @RequirePermission('enrollments.create', enrollmentWriteScopes)
  create(@Req() req: IamRequest, @Body() input: unknown) {
    return this.service.create(requestContext(req), input);
  }
  @Get(':id')
  @RequirePermission('enrollments.read', enrollmentReadScopes)
  get(@Req() req: IamRequest, @Param('id') id: string) {
    return this.service.get(requestContext(req), id);
  }
  @Patch(':id')
  @RequirePermission('enrollments.update', enrollmentWriteScopes)
  update(@Req() req: IamRequest, @Param('id') id: string, @Body() input: unknown) {
    return this.service.update(requestContext(req), id, input);
  }
  @Get(':id/events')
  @RequirePermission('enrollments.read', enrollmentReadScopes)
  history(@Req() req: IamRequest, @Param('id') id: string, @Query() query: unknown) {
    return this.service.history(requestContext(req), id, query);
  }
  @Post(':id/confirm')
  @HttpCode(200)
  @RequirePermission('enrollments.confirm', enrollmentWriteScopes)
  confirm(@Req() req: IamRequest, @Param('id') id: string, @Body() input: unknown) {
    return this.service.transition(requestContext(req), 'confirm', id, input);
  }
  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('enrollments.cancel', enrollmentWriteScopes)
  cancel(@Req() req: IamRequest, @Param('id') id: string, @Body() input: unknown) {
    return this.service.transition(requestContext(req), 'cancel', id, input);
  }
  @Post(':id/transfer')
  @HttpCode(200)
  @RequirePermission('enrollments.transfer', enrollmentWriteScopes)
  transfer(@Req() req: IamRequest, @Param('id') id: string, @Body() input: unknown) {
    return this.service.transition(requestContext(req), 'transfer', id, input);
  }
  @Post(':id/complete')
  @HttpCode(200)
  @RequirePermission('enrollments.complete', enrollmentWriteScopes)
  complete(@Req() req: IamRequest, @Param('id') id: string, @Body() input: unknown) {
    return this.service.transition(requestContext(req), 'complete', id, input);
  }
}
@Controller('api/v1')
export class EnrollmentLookupController {
  constructor(@Inject(EnrollmentService) private readonly service: EnrollmentService) {}
  @Get('students/:studentId/enrollments')
  @RequirePermission('enrollments.read', enrollmentReadScopes)
  student(@Req() req: IamRequest, @Param('studentId') studentId: string, @Query() query: unknown) {
    return this.service.list(requestContext(req), query, studentId);
  }
  @Get('enrollment-classes')
  @RequirePermission('enrollments.create', enrollmentWriteScopes)
  classes(@Req() req: IamRequest, @Query() query: unknown) {
    return this.service.classes(requestContext(req), query);
  }
}
