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
  Delete,
} from '@nestjs/common';
import { emptyCommand } from '@gestschool/contracts';
import { GuardianLinksService } from '../../application/guardian-links.service.js';
import {
  RequirePermission,
  requestContext,
  type IamRequest,
} from '../../../iam/presentation/http/security.js';
import { readScopes, writeScopes } from '../../../people/domain/policy.js';
@Controller('api/v1')
export class GuardianLinksController {
  constructor(@Inject(GuardianLinksService) private readonly service: GuardianLinksService) {}
  @Get('students/:id/guardians')
  @RequirePermission('students.read', readScopes)
  guardians(@Req() request: IamRequest, @Param('id') id: string, @Query() query: unknown) {
    return this.service.list(requestContext(request), id, 'student', query);
  }
  @Get('guardians/:id/students')
  @RequirePermission('guardians.read', readScopes)
  students(@Req() request: IamRequest, @Param('id') id: string, @Query() query: unknown) {
    return this.service.list(requestContext(request), id, 'guardian', query);
  }
  @Post('students/:id/guardians')
  @RequirePermission('students.update', writeScopes)
  link(@Req() request: IamRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.link(requestContext(request), id, body);
  }
  @Patch('students/:id/guardians/:guardianId')
  @RequirePermission('students.update', writeScopes)
  update(
    @Req() request: IamRequest,
    @Param('id') id: string,
    @Param('guardianId') guardianId: string,
    @Body() body: unknown,
  ) {
    return this.service.update(requestContext(request), id, guardianId, body);
  }
  @Delete('students/:id/guardians/:guardianId')
  @RequirePermission('students.update', writeScopes)
  unlink(
    @Req() request: IamRequest,
    @Param('id') id: string,
    @Param('guardianId') guardianId: string,
    @Body() body: unknown,
  ) {
    emptyCommand.parse(body ?? {});
    return this.service.update(requestContext(request), id, guardianId, null, true);
  }
}
