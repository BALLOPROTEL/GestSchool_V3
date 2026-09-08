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

@Controller('api/v1/teaching-assignments')
export class AssignmentController {
  constructor(@Inject(AcademicService) private readonly service: AcademicService) {}
  @Get()
  @RequirePermission('teaching-assignments.read', academicReadScopes)
  list(@Req() request: IamRequest, @Query() query: unknown) {
    return this.service.list(requestContext(request), 'teaching-assignments', query);
  }
  @Post()
  @RequirePermission('teaching-assignments.create', academicWriteScopes)
  create(@Req() request: IamRequest, @Body() body: unknown) {
    return this.service.create(requestContext(request), 'teaching-assignments', body);
  }
  @Patch(':id')
  @RequirePermission('teaching-assignments.update', academicWriteScopes)
  update(@Req() request: IamRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.update(requestContext(request), 'teaching-assignments', id, body);
  }
  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermission('teaching-assignments.archive', academicWriteScopes)
  archive(@Req() request: IamRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.archive(requestContext(request), 'teaching-assignments', id, false, body);
  }
}

@Controller('api/v1/me/teaching-assignments')
export class MyAssignmentsController {
  constructor(@Inject(AcademicService) private readonly service: AcademicService) {}
  @Get()
  @RequirePermission('teaching-assignments.read', academicReadScopes)
  list(@Req() request: IamRequest, @Query() query: unknown) {
    return this.service.list(
      requestContext(request),
      'teaching-assignments',
      query,
      undefined,
      true,
    );
  }
}
