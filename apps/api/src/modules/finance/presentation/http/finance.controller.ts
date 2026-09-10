import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { FinanceService } from '../../application/finance.service.js';
import { financeReadScopes, financeWriteScopes } from '../../domain/policy.js';
import {
  RequirePermission,
  requestContext,
  type IamRequest,
} from '../../../iam/presentation/http/security.js';
@Controller('api/v1/finance')
export class FinanceController {
  @Post('payments/:id/reject')
  @HttpCode(200)
  @RequirePermission('payments.validate', financeWriteScopes)
  payment_reject(@Req() req: IamRequest, @Param('id') id: string, @Body() input: unknown) {
    return this.service.write(requestContext(req), 'payment.reject', input, { id });
  }
  constructor(@Inject(FinanceService) private readonly service: FinanceService) {}
  @Get('summary')
  @RequirePermission('finance.read', financeReadScopes)
  summary(@Req() req: IamRequest, @Query() query: unknown) {
    return this.service.summary(requestContext(req), query);
  }

  @Get('fee-types')
  @RequirePermission('finance.read', financeWriteScopes)
  fee_typesList(@Req() req: IamRequest, @Query() query: unknown) {
    return this.service.list(requestContext(req), 'fee-types', query);
  }

  @Get('fee-types/:id')
  @RequirePermission('finance.read', financeWriteScopes)
  fee_typesGet(@Req() req: IamRequest, @Param('id') id: string) {
    return this.service.get(requestContext(req), 'fee-types', id);
  }

  @Get('fee-schedules')
  @RequirePermission('finance.read', financeWriteScopes)
  fee_schedulesList(@Req() req: IamRequest, @Query() query: unknown) {
    return this.service.list(requestContext(req), 'fee-schedules', query);
  }

  @Get('fee-schedules/:id')
  @RequirePermission('finance.read', financeWriteScopes)
  fee_schedulesGet(@Req() req: IamRequest, @Param('id') id: string) {
    return this.service.get(requestContext(req), 'fee-schedules', id);
  }

  @Get('invoices')
  @RequirePermission('invoices.read', financeReadScopes)
  invoicesList(@Req() req: IamRequest, @Query() query: unknown) {
    return this.service.list(requestContext(req), 'invoices', query);
  }

  @Get('invoices/:id')
  @RequirePermission('invoices.read', financeReadScopes)
  invoicesGet(@Req() req: IamRequest, @Param('id') id: string) {
    return this.service.get(requestContext(req), 'invoices', id);
  }

  @Get('payments')
  @RequirePermission('payments.read', financeReadScopes)
  paymentsList(@Req() req: IamRequest, @Query() query: unknown) {
    return this.service.list(requestContext(req), 'payments', query);
  }

  @Get('payments/:id')
  @RequirePermission('payments.read', financeReadScopes)
  paymentsGet(@Req() req: IamRequest, @Param('id') id: string) {
    return this.service.get(requestContext(req), 'payments', id);
  }

  @Get('receipts')
  @RequirePermission('receipts.read', financeReadScopes)
  receiptsList(@Req() req: IamRequest, @Query() query: unknown) {
    return this.service.list(requestContext(req), 'receipts', query);
  }

  @Get('receipts/:id')
  @RequirePermission('receipts.read', financeReadScopes)
  receiptsGet(@Req() req: IamRequest, @Param('id') id: string) {
    return this.service.get(requestContext(req), 'receipts', id);
  }

  @Get('cash-sessions')
  @RequirePermission('cash-sessions.read', financeWriteScopes)
  cash_sessionsList(@Req() req: IamRequest, @Query() query: unknown) {
    return this.service.list(requestContext(req), 'cash-sessions', query);
  }

  @Get('cash-sessions/:id')
  @RequirePermission('cash-sessions.read', financeWriteScopes)
  cash_sessionsGet(@Req() req: IamRequest, @Param('id') id: string) {
    return this.service.get(requestContext(req), 'cash-sessions', id);
  }

  @Post('fee-types')
  @RequirePermission('fee-types.create', financeWriteScopes)
  fee_type_create(@Req() req: IamRequest, @Body() input: unknown) {
    return this.service.write(requestContext(req), 'fee-type.create', input, {});
  }

  @Patch('fee-types/:id')
  @HttpCode(200)
  @RequirePermission('fee-types.update', financeWriteScopes)
  fee_type_update(@Req() req: IamRequest, @Body() input: unknown, @Param('id') id: string) {
    return this.service.write(requestContext(req), 'fee-type.update', input, { id });
  }

  @Post('fee-types/:id/archive')
  @HttpCode(200)
  @RequirePermission('fee-types.update', financeWriteScopes)
  fee_type_archive(@Req() req: IamRequest, @Body() input: unknown, @Param('id') id: string) {
    return this.service.write(requestContext(req), 'fee-type.archive', input, { id });
  }

  @Post('fee-types/:id/restore')
  @HttpCode(200)
  @RequirePermission('fee-types.update', financeWriteScopes)
  fee_type_restore(@Req() req: IamRequest, @Body() input: unknown, @Param('id') id: string) {
    return this.service.write(requestContext(req), 'fee-type.restore', input, { id });
  }

  @Post('fee-schedules')
  @RequirePermission('fee-schedules.create', financeWriteScopes)
  schedule_create(@Req() req: IamRequest, @Body() input: unknown) {
    return this.service.write(requestContext(req), 'schedule.create', input, {});
  }

  @Patch('fee-schedules/:id')
  @HttpCode(200)
  @RequirePermission('fee-schedules.update', financeWriteScopes)
  schedule_update(@Req() req: IamRequest, @Body() input: unknown, @Param('id') id: string) {
    return this.service.write(requestContext(req), 'schedule.update', input, { id });
  }

  @Post('fee-schedules/:id/items')
  @HttpCode(200)
  @RequirePermission('fee-schedules.update', financeWriteScopes)
  item_create(@Req() req: IamRequest, @Body() input: unknown, @Param('id') id: string) {
    return this.service.write(requestContext(req), 'item.create', input, { id });
  }

  @Patch('fee-schedules/:id/items/:itemId')
  @HttpCode(200)
  @RequirePermission('fee-schedules.update', financeWriteScopes)
  item_update(
    @Req() req: IamRequest,
    @Body() input: unknown,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.service.write(requestContext(req), 'item.update', input, { id, itemId });
  }

  @Delete('fee-schedules/:id/items/:itemId')
  @HttpCode(200)
  @RequirePermission('fee-schedules.update', financeWriteScopes)
  item_delete(
    @Req() req: IamRequest,
    @Body() input: unknown,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.service.write(requestContext(req), 'item.delete', input, { id, itemId });
  }

  @Post('invoices')
  @RequirePermission('invoices.create', financeWriteScopes)
  invoice_create(@Req() req: IamRequest, @Body() input: unknown) {
    return this.service.write(requestContext(req), 'invoice.create', input, {});
  }

  @Post('invoices/:id/adjustments')
  @HttpCode(200)
  @RequirePermission('invoices.adjust', financeWriteScopes)
  invoice_adjust(@Req() req: IamRequest, @Body() input: unknown, @Param('id') id: string) {
    return this.service.write(requestContext(req), 'invoice.adjust', input, { id });
  }

  @Post('invoices/:id/void')
  @HttpCode(200)
  @RequirePermission('invoices.adjust', financeWriteScopes)
  invoice_void(@Req() req: IamRequest, @Body() input: unknown, @Param('id') id: string) {
    return this.service.write(requestContext(req), 'invoice.void', input, { id });
  }

  @Post('payments')
  @RequirePermission('payments.create', financeWriteScopes)
  payment_create(@Req() req: IamRequest, @Body() input: unknown) {
    return this.service.write(requestContext(req), 'payment.create', input, {
      key: req.get('idempotency-key') ?? '',
    });
  }

  @Post('payments/:id/validate')
  @HttpCode(200)
  @RequirePermission('payments.validate', financeWriteScopes)
  payment_validate(@Req() req: IamRequest, @Body() input: unknown, @Param('id') id: string) {
    return this.service.write(requestContext(req), 'payment.validate', input, { id });
  }

  @Post('payments/:id/request-cancellation')
  @HttpCode(200)
  @RequirePermission('payments.cancel', financeWriteScopes)
  payment_request_cancellation(
    @Req() req: IamRequest,
    @Body() input: unknown,
    @Param('id') id: string,
  ) {
    return this.service.write(requestContext(req), 'payment.request-cancellation', input, { id });
  }

  @Post('payments/:id/cancel')
  @HttpCode(200)
  @RequirePermission('payments.cancel', financeWriteScopes)
  payment_cancel(@Req() req: IamRequest, @Body() input: unknown, @Param('id') id: string) {
    return this.service.write(requestContext(req), 'payment.cancel', input, { id });
  }

  @Post('cash-sessions/open')
  @RequirePermission('cash-sessions.open', financeWriteScopes)
  cash_open(@Req() req: IamRequest, @Body() input: unknown) {
    return this.service.write(requestContext(req), 'cash.open', input, {});
  }

  @Post('cash-sessions/:id/close')
  @HttpCode(200)
  @RequirePermission('cash-sessions.close', financeWriteScopes)
  cash_close(@Req() req: IamRequest, @Body() input: unknown, @Param('id') id: string) {
    return this.service.write(requestContext(req), 'cash.close', input, { id });
  }
}
