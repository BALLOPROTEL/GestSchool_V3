import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ResultsService } from '../../application/results.service.js';
import { resultReadScopes, resultWriteScopes, resultAdminScopes } from '../../domain/policy.js';
import {
  RequirePermission,
  requestContext,
  type IamRequest,
} from '../../../iam/presentation/http/security.js';

@Controller('api/v1')
export class ResultsController {
  constructor(@Inject(ResultsService) private readonly service: ResultsService) {}
  @Get('assessments')
  @RequirePermission('assessments.read', resultReadScopes)
  assessments(@Req() req: IamRequest, @Query() query: unknown) {
    return this.service.assessments(requestContext(req), query);
  }
  @Post('assessments')
  @RequirePermission('assessments.create', resultWriteScopes)
  create(@Req() req: IamRequest, @Body() input: unknown) {
    return this.service.create(requestContext(req), input);
  }
  @Get('assessments/:id')
  @RequirePermission('assessments.read', resultReadScopes)
  assessment(@Req() req: IamRequest, @Param('id') id: string) {
    return this.service.assessment(requestContext(req), id);
  }
  @Patch('assessments/:id')
  @RequirePermission('assessments.update', resultWriteScopes)
  update(@Req() req: IamRequest, @Param('id') id: string, @Body() input: unknown) {
    return this.service.update(requestContext(req), id, input);
  }
  @Get('assessments/:id/grades')
  @RequirePermission('grades.read', resultReadScopes)
  sheet(@Req() req: IamRequest, @Param('id') id: string) {
    return this.service.sheet(requestContext(req), id);
  }
  @Put('assessments/:id/grades')
  @RequirePermission('grades.update', resultWriteScopes)
  bulk(@Req() req: IamRequest, @Param('id') id: string, @Body() input: unknown) {
    return this.service.bulk(requestContext(req), id, input);
  }
  @Patch('grades/:id')
  @RequirePermission('grades.update', resultWriteScopes)
  patchGrade(@Req() req: IamRequest, @Param('id') id: string, @Body() input: unknown) {
    return this.service.patchGrade(requestContext(req), id, input);
  }
  @Post('grades/:id/correct')
  @HttpCode(200)
  @RequirePermission('grades.correct', resultAdminScopes)
  correct(@Req() req: IamRequest, @Param('id') id: string, @Body() input: unknown) {
    return this.service.correct(requestContext(req), id, input);
  }
  @Get('grades/:id/changes')
  @RequirePermission('grades.read', resultReadScopes)
  changes(@Req() req: IamRequest, @Param('id') id: string) {
    return this.service.changes(requestContext(req), id);
  }
  @Post('assessments/:id/submit')
  @HttpCode(200)
  @RequirePermission('grades.submit', resultWriteScopes)
  submit(@Req() req: IamRequest, @Param('id') id: string, @Body() input: unknown) {
    return this.service.action(requestContext(req), id, 'submit', input);
  }
  @Post('assessments/:id/validate')
  @HttpCode(200)
  @RequirePermission('grades.validate', resultAdminScopes)
  validate(@Req() req: IamRequest, @Param('id') id: string, @Body() input: unknown) {
    return this.service.action(requestContext(req), id, 'validate', input);
  }
  @Post('assessments/:id/publish')
  @HttpCode(200)
  @RequirePermission('grades.publish', resultAdminScopes)
  publish(@Req() req: IamRequest, @Param('id') id: string, @Body() input: unknown) {
    return this.service.action(requestContext(req), id, 'publish', input);
  }
  @Post('assessments/:id/lock')
  @HttpCode(200)
  @RequirePermission('grades.lock', resultAdminScopes)
  lock(@Req() req: IamRequest, @Param('id') id: string, @Body() input: unknown) {
    return this.service.action(requestContext(req), id, 'lock', input);
  }
  @Post('assessments/:id/reopen')
  @HttpCode(200)
  @RequirePermission('grades.validate', resultAdminScopes)
  reopen(@Req() req: IamRequest, @Param('id') id: string, @Body() input: unknown) {
    return this.service.action(requestContext(req), id, 'reopen', input);
  }
  @Post('assessments/:id/archive')
  @HttpCode(200)
  @RequirePermission('assessments.update', resultWriteScopes)
  archive(@Req() req: IamRequest, @Param('id') id: string, @Body() input: unknown) {
    return this.service.action(requestContext(req), id, 'archive', input);
  }
  @Get('results/class')
  @RequirePermission('grades.read', resultAdminScopes)
  results(@Req() req: IamRequest, @Query() input: unknown) {
    return this.service.results(requestContext(req), input);
  }
  @Get('report-cards')
  @RequirePermission('report-cards.read', [...resultAdminScopes, 'OWN', 'CHILDREN'])
  reports(@Req() req: IamRequest, @Query() input: unknown) {
    return this.service.reports(requestContext(req), input);
  }
  @Get('report-cards/:id')
  @RequirePermission('report-cards.read', [...resultAdminScopes, 'OWN', 'CHILDREN'])
  report(@Req() req: IamRequest, @Param('id') id: string) {
    return this.service.report(requestContext(req), id);
  }
  @Post('report-cards/generate')
  @HttpCode(200)
  @RequirePermission('report-cards.generate', resultAdminScopes)
  generate(@Req() req: IamRequest, @Body() input: unknown) {
    return this.service.generate(requestContext(req), input);
  }
  @Post('report-cards/publish')
  @HttpCode(200)
  @RequirePermission('report-cards.publish', resultAdminScopes)
  publishReports(@Req() req: IamRequest, @Body() input: unknown) {
    return this.service.generate(requestContext(req), input, true);
  }
  @Patch('report-cards/:id')
  @RequirePermission('report-cards.generate', resultAdminScopes)
  remark(@Req() req: IamRequest, @Param('id') id: string, @Body() input: unknown) {
    return this.service.remark(requestContext(req), id, input);
  }
  @Post('report-cards/:id/lock')
  @HttpCode(200)
  @RequirePermission('report-cards.lock', resultAdminScopes)
  lockReport(@Req() req: IamRequest, @Param('id') id: string) {
    return this.service.lockReport(requestContext(req), id);
  }
}
