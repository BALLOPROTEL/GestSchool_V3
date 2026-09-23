import { Body, Controller, Get, Headers, Inject, Param, Post, Query, Req } from '@nestjs/common';
import {
  RequirePermission,
  requestContext,
  type IamRequest,
} from '../../../iam/presentation/http/security.js';
import { CommunicationsService } from '../../application/communications.service.js';

@Controller('api/v1/communications')
export class CommunicationsController {
  constructor(
    @Inject(CommunicationsService) private readonly communications: CommunicationsService,
  ) {}

  @Get()
  @RequirePermission('communications.read', ['TENANT', 'PLATFORM', 'ASSIGNED'])
  list(@Req() request: IamRequest, @Query() query: unknown) {
    return this.communications.list(requestContext(request), query);
  }

  @Get('summary')
  @RequirePermission('communications.read', ['TENANT', 'PLATFORM', 'ASSIGNED'])
  summary(@Req() request: IamRequest) {
    return this.communications.summary(requestContext(request));
  }

  @Get(':id')
  @RequirePermission('communications.read', ['TENANT', 'PLATFORM', 'ASSIGNED'])
  get(@Req() request: IamRequest, @Param('id') id: string) {
    return this.communications.get(requestContext(request), id);
  }

  @Post('audience-preview')
  @RequirePermission('communications.send', ['TENANT', 'PLATFORM', 'ASSIGNED'])
  preview(@Req() request: IamRequest, @Body() body: unknown) {
    return this.communications.preview(requestContext(request), body);
  }

  @Post('send')
  @RequirePermission('communications.send', ['TENANT', 'PLATFORM', 'ASSIGNED'])
  send(
    @Req() request: IamRequest,
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Body() body: unknown,
  ) {
    return this.communications.send(requestContext(request), body, idempotencyKey);
  }
}
