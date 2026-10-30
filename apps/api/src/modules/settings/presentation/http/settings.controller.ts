import { Body, Controller, Get, Inject, Patch, Req } from '@nestjs/common';
import { SettingsService } from '../../application/settings.service.js';
import {
  RequirePermission,
  requestContext,
  type IamRequest,
} from '../../../iam/presentation/http/security.js';

@Controller('api/v1/settings')
export class SettingsController {
  constructor(@Inject(SettingsService) private readonly service: SettingsService) {}

  @Get()
  @RequirePermission('settings.read', ['TENANT', 'PLATFORM'])
  read(@Req() req: IamRequest) {
    return this.service.read(requestContext(req));
  }

  @Patch()
  @RequirePermission('settings.write', ['TENANT', 'PLATFORM'])
  update(@Req() req: IamRequest, @Body() input: unknown) {
    return this.service.update(requestContext(req), input);
  }
}
