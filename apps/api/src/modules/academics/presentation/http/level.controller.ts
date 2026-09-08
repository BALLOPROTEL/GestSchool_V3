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

@Controller('api/v1/levels')
export class LevelController {
  constructor(@Inject(AcademicService) private readonly service: AcademicService) {}
  @Get()
  @RequirePermission('levels.read', academicReadScopes)
  list(@Req() request: IamRequest, @Query() query: unknown) {
    return this.service.list(requestContext(request), 'levels', query);
  }
  @Post()
  @RequirePermission('levels.create', academicWriteScopes)
  create(@Req() request: IamRequest, @Body() body: unknown) {
    return this.service.create(requestContext(request), 'levels', body);
  }
  @Patch(':id')
  @RequirePermission('levels.update', academicWriteScopes)
  update(@Req() request: IamRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.update(requestContext(request), 'levels', id, body);
  }
  @Get(':id')
  @RequirePermission('levels.read', academicReadScopes)
  get(@Req() request: IamRequest, @Param('id') id: string) {
    return this.service.get(requestContext(request), 'levels', id);
  }
  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermission('levels.archive', academicWriteScopes)
  archive(@Req() request: IamRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.archive(requestContext(request), 'levels', id, false, body);
  }
  @Post(':id/restore')
  @HttpCode(200)
  @RequirePermission('levels.archive', academicWriteScopes)
  restore(@Req() request: IamRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.archive(requestContext(request), 'levels', id, true, body);
  }
}
