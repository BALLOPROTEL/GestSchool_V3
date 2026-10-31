import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import { AuditService } from '../../application/audit.service.js';
import {
  RequirePermission,
  requestContext,
  type IamRequest,
} from '../../../iam/presentation/http/security.js';

@Controller('api/v1/audit')
export class AuditController {
  constructor(@Inject(AuditService) private readonly service: AuditService) {}

  @Get()
  @RequirePermission('audit.read', ['TENANT', 'PLATFORM'])
  list(@Req() req: IamRequest, @Query() query: unknown) {
    return this.service.list(requestContext(req), query);
  }
}
