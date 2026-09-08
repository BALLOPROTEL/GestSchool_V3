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

@Controller('api/v1/academic-years')
export class AcademicYearController {
  constructor(@Inject(AcademicService) private readonly service: AcademicService) {}
  @Get()
  @RequirePermission('academic-years.read', academicReadScopes)
  list(@Req() request: IamRequest, @Query() query: unknown) {
    return this.service.list(requestContext(request), 'academic-years', query);
  }
  @Post()
  @RequirePermission('academic-years.create', academicWriteScopes)
  create(@Req() request: IamRequest, @Body() body: unknown) {
    return this.service.create(requestContext(request), 'academic-years', body);
  }
  @Patch(':id')
  @RequirePermission('academic-years.update', academicWriteScopes)
  update(@Req() request: IamRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.update(requestContext(request), 'academic-years', id, body);
  }
  @Get(':id')
  @RequirePermission('academic-years.read', academicReadScopes)
  get(@Req() request: IamRequest, @Param('id') id: string) {
    return this.service.get(requestContext(request), 'academic-years', id);
  }
  @Post(':id/activate')
  @HttpCode(200)
  @RequirePermission('academic-years.activate', academicWriteScopes)
  activate(@Req() request: IamRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.transition(requestContext(request), id, 'activate', body);
  }
  @Post(':id/close')
  @HttpCode(200)
  @RequirePermission('academic-years.close', academicWriteScopes)
  close(@Req() request: IamRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.transition(requestContext(request), id, 'close', body);
  }
  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermission('academic-years.archive', academicWriteScopes)
  archive(@Req() request: IamRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.transition(requestContext(request), id, 'archive', body);
  }
}
