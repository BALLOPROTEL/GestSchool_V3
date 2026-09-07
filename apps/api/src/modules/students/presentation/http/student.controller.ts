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
import { StudentService } from '../../application/student.service.js';
import {
  RequirePermission,
  requestContext,
  type IamRequest,
} from '../../../iam/presentation/http/security.js';
import { readScopes, writeScopes } from '../../../people/domain/policy.js';

@Controller('api/v1/students')
export class StudentController {
  constructor(@Inject(StudentService) private readonly service: StudentService) {}
  @Get()
  @RequirePermission('students.read', readScopes)
  list(@Req() request: IamRequest, @Query() query: unknown) {
    return this.service.list(requestContext(request), query);
  }
  @Get(':id')
  @RequirePermission('students.read', readScopes)
  get(@Req() request: IamRequest, @Param('id') id: string) {
    return this.service.get(requestContext(request), id);
  }
  @Post()
  @RequirePermission('students.create', writeScopes)
  create(@Req() request: IamRequest, @Body() body: unknown) {
    return this.service.create(requestContext(request), body);
  }
  @Patch(':id')
  @RequirePermission('students.update', writeScopes)
  update(@Req() request: IamRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.update(requestContext(request), id, body);
  }
  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermission('students.archive', writeScopes)
  archive(@Req() request: IamRequest, @Param('id') id: string, @Body() body: unknown) {
    emptyCommand.parse(body ?? {});
    return this.service.archive(requestContext(request), id, false);
  }
  @Post(':id/restore')
  @HttpCode(200)
  @RequirePermission('students.archive', writeScopes)
  restore(@Req() request: IamRequest, @Param('id') id: string, @Body() body: unknown) {
    emptyCommand.parse(body ?? {});
    return this.service.archive(requestContext(request), id, true);
  }
}
