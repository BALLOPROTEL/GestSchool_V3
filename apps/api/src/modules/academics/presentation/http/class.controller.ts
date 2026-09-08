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

@Controller('api/v1/classes')
export class ClassController {
  constructor(@Inject(AcademicService) private readonly service: AcademicService) {}
  @Get()
  @RequirePermission('classes.read', academicReadScopes)
  list(@Req() request: IamRequest, @Query() query: unknown) {
    return this.service.list(requestContext(request), 'classes', query);
  }
  @Post()
  @RequirePermission('classes.create', academicWriteScopes)
  create(@Req() request: IamRequest, @Body() body: unknown) {
    return this.service.create(requestContext(request), 'classes', body);
  }
  @Patch(':id')
  @RequirePermission('classes.update', academicWriteScopes)
  update(@Req() request: IamRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.update(requestContext(request), 'classes', id, body);
  }
  @Get(':id')
  @RequirePermission('classes.read', academicReadScopes)
  get(@Req() request: IamRequest, @Param('id') id: string) {
    return this.service.get(requestContext(request), 'classes', id);
  }
  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermission('classes.archive', academicWriteScopes)
  archive(@Req() request: IamRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.archive(requestContext(request), 'classes', id, false, body);
  }
  @Post(':id/restore')
  @HttpCode(200)
  @RequirePermission('classes.archive', academicWriteScopes)
  restore(@Req() request: IamRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.archive(requestContext(request), 'classes', id, true, body);
  }
}
