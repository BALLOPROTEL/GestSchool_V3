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

@Controller('api/v1/subjects')
export class SubjectController {
  constructor(@Inject(AcademicService) private readonly service: AcademicService) {}
  @Get()
  @RequirePermission('subjects.read', academicReadScopes)
  list(@Req() request: IamRequest, @Query() query: unknown) {
    return this.service.list(requestContext(request), 'subjects', query);
  }
  @Post()
  @RequirePermission('subjects.create', academicWriteScopes)
  create(@Req() request: IamRequest, @Body() body: unknown) {
    return this.service.create(requestContext(request), 'subjects', body);
  }
  @Patch(':id')
  @RequirePermission('subjects.update', academicWriteScopes)
  update(@Req() request: IamRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.update(requestContext(request), 'subjects', id, body);
  }
  @Get(':id')
  @RequirePermission('subjects.read', academicReadScopes)
  get(@Req() request: IamRequest, @Param('id') id: string) {
    return this.service.get(requestContext(request), 'subjects', id);
  }
  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermission('subjects.archive', academicWriteScopes)
  archive(@Req() request: IamRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.archive(requestContext(request), 'subjects', id, false, body);
  }
  @Post(':id/restore')
  @HttpCode(200)
  @RequirePermission('subjects.archive', academicWriteScopes)
  restore(@Req() request: IamRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.archive(requestContext(request), 'subjects', id, true, body);
  }
}
