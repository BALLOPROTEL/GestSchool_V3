import { Controller, Get, Inject, Param, Post, Query, Req } from '@nestjs/common';
import {
  RequirePermission,
  requestContext,
  type IamRequest,
} from '../../../iam/presentation/http/security.js';
import { NotificationsService } from '../../application/notifications.service.js';

@Controller('api/v1/notifications')
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly notifications: NotificationsService) {}

  @Get()
  @RequirePermission('membership.read', ['OWN'])
  list(@Req() request: IamRequest, @Query() query: unknown) {
    return this.notifications.list(requestContext(request), query);
  }

  @Get('unread-count')
  @RequirePermission('membership.read', ['OWN'])
  unreadCount(@Req() request: IamRequest) {
    return this.notifications.unreadCount(requestContext(request));
  }

  @Post('read-all')
  @RequirePermission('membership.read', ['OWN'])
  readAll(@Req() request: IamRequest) {
    return this.notifications.readAll(requestContext(request));
  }

  @Post(':id/read')
  @RequirePermission('membership.read', ['OWN'])
  read(@Req() request: IamRequest, @Param('id') id: string) {
    return this.notifications.read(requestContext(request), id);
  }
}
