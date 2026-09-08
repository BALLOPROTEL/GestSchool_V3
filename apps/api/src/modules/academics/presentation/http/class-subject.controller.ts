import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { AcademicService } from '../../application/academic.service.js';
import { academicReadScopes, academicWriteScopes } from '../../domain/policy.js';
import {
  RequirePermission,
  requestContext,
  type IamRequest,
} from '../../../iam/presentation/http/security.js';
@Controller('api/v1/classes/:classId/subjects')
export class ClassSubjectController {
  constructor(@Inject(AcademicService) private readonly service: AcademicService) {}
  @Get()
  @RequirePermission('classes.read', academicReadScopes)
  list(@Req() request: IamRequest, @Param('classId') classId: string, @Query() query: unknown) {
    return this.service.list(requestContext(request), 'class-subjects', query, classId);
  }
  @Post()
  @RequirePermission('classes.update', academicWriteScopes)
  create(@Req() request: IamRequest, @Param('classId') classId: string, @Body() body: unknown) {
    return this.service.createLink(requestContext(request), classId, body);
  }
  @Patch(':subjectId')
  @RequirePermission('classes.update', academicWriteScopes)
  update(
    @Req() request: IamRequest,
    @Param('classId') classId: string,
    @Param('subjectId') subjectId: string,
    @Body() body: unknown,
  ) {
    return this.service.updateLink(requestContext(request), classId, subjectId, body);
  }
  @Delete(':subjectId')
  @RequirePermission('classes.update', academicWriteScopes)
  remove(
    @Req() request: IamRequest,
    @Param('classId') classId: string,
    @Param('subjectId') subjectId: string,
    @Body() body: unknown,
  ) {
    return this.service.removeLink(requestContext(request), classId, subjectId, body);
  }
}
