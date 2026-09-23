import { Body, Controller, Get, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import {
  RequirePermission,
  requestContext,
  type IamRequest,
} from '../../../iam/presentation/http/security.js';
import { TemplatesService } from '../../application/templates.service.js';

@Controller('api/v1/notification-templates')
export class TemplatesController {
  constructor(@Inject(TemplatesService) private readonly templates: TemplatesService) {}

  @Get()
  @RequirePermission('notification-templates.read', ['TENANT', 'PLATFORM'])
  list(@Req() request: IamRequest) {
    return this.templates.list(requestContext(request));
  }

  @Post()
  @RequirePermission('notification-templates.manage', ['TENANT', 'PLATFORM'])
  create(@Req() request: IamRequest, @Body() body: unknown) {
    return this.templates.create(requestContext(request), body);
  }

  @Patch(':id')
  @RequirePermission('notification-templates.manage', ['TENANT', 'PLATFORM'])
  update(@Req() request: IamRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.templates.update(requestContext(request), id, body);
  }

  @Post(':id/publish')
  @RequirePermission('notification-templates.manage', ['TENANT', 'PLATFORM'])
  publish(@Req() request: IamRequest, @Param('id') id: string) {
    return this.templates.transition(requestContext(request), id, 'PUBLISHED');
  }

  @Post(':id/archive')
  @RequirePermission('notification-templates.manage', ['TENANT', 'PLATFORM'])
  archive(@Req() request: IamRequest, @Param('id') id: string) {
    return this.templates.transition(requestContext(request), id, 'ARCHIVED');
  }
}
