import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import { DashboardService } from '../../application/dashboard.service.js';
import {
  RequirePermission,
  requestContext,
  type IamRequest,
} from '../../../iam/presentation/http/security.js';
const scopes = ['PLATFORM', 'TENANT', 'ASSIGNED', 'CHILDREN', 'OWN'] as const;
@Controller('api/v1/dashboard')
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly service: DashboardService) {}
  @Get('summary')
  @RequirePermission('dashboards.read', scopes)
  summary(@Req() request: IamRequest, @Query() query: unknown) {
    return this.service.summary(requestContext(request), query);
  }
}
