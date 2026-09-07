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
import { emptyCommand } from '@gestschool/contracts';
import { TeacherService } from '../../application/teacher.service.js';
import {
  RequirePermission,
  requestContext,
  type IamRequest,
} from '../../../iam/presentation/http/security.js';
import { readScopes, writeScopes } from '../../../people/domain/policy.js';

@Controller('api/v1/teachers')
export class TeacherController {
  constructor(@Inject(TeacherService) private readonly service: TeacherService) {}
  @Get()
  @RequirePermission('teachers.read', readScopes)
  list(@Req() request: IamRequest, @Query() query: unknown) {
    return this.service.list(requestContext(request), query);
  }
  @Get(':id')
  @RequirePermission('teachers.read', readScopes)
  get(@Req() request: IamRequest, @Param('id') id: string) {
    return this.service.get(requestContext(request), id);
  }
  @Post()
  @RequirePermission('teachers.create', writeScopes)
  create(@Req() request: IamRequest, @Body() body: unknown) {
    return this.service.create(requestContext(request), body);
  }
  @Patch(':id')
  @RequirePermission('teachers.update', writeScopes)
  update(@Req() request: IamRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.update(requestContext(request), id, body);
  }
  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermission('teachers.archive', writeScopes)
  archive(@Req() request: IamRequest, @Param('id') id: string, @Body() body: unknown) {
    emptyCommand.parse(body ?? {});
    return this.service.archive(requestContext(request), id, false);
  }
  @Post(':id/restore')
  @HttpCode(200)
  @RequirePermission('teachers.archive', writeScopes)
  restore(@Req() request: IamRequest, @Param('id') id: string, @Body() body: unknown) {
    emptyCommand.parse(body ?? {});
    return this.service.archive(requestContext(request), id, true);
  }
}
