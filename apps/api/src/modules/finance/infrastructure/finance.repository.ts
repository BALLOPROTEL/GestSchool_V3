import { Inject, Injectable } from '@nestjs/common';
import type { FinanceCommand, FinanceQuery, FinanceResource } from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';
import { FinanceRepository } from '../domain/finance.repository.js';
import { FinanceDatabase } from './database.js';
import { financeDetail, financeList, financeSummary } from './reads.js';
import { writeFees } from './fees.js';
import { writeInvoice } from './invoices.js';
import { writePayment } from './payments.js';
@Injectable()
export class PrismaFinanceRepository extends FinanceRepository {
  constructor(@Inject(FinanceDatabase) private readonly database: FinanceDatabase) {
    super();
  }
  override list(context: RequestContext, resource: FinanceResource, query: FinanceQuery) {
    return this.database.client.$transaction((db) => financeList(db, context, resource, query), {
      isolationLevel: 'RepeatableRead',
    });
  }
  override get(context: RequestContext, resource: FinanceResource, id: string) {
    return this.database.client.$transaction((db) => financeDetail(db, context, resource, id), {
      isolationLevel: 'RepeatableRead',
    });
  }
  override summary(context: RequestContext, query: FinanceQuery) {
    return this.database.client.$transaction((db) => financeSummary(db, context, query), {
      isolationLevel: 'RepeatableRead',
    });
  }
  override write(context: RequestContext, command: FinanceCommand) {
    return this.database.write(context, (db) => {
      switch (command.action) {
        case 'fee-type.create':
        case 'fee-type.update':
        case 'fee-type.archive':
        case 'fee-type.restore':
        case 'schedule.create':
        case 'schedule.update':
        case 'item.create':
        case 'item.update':
        case 'item.delete':
          return writeFees(db, context, command);
        case 'invoice.create':
        case 'invoice.adjust':
        case 'invoice.void':
          return writeInvoice(db, context, command);
        default:
          return writePayment(db, context, command);
      }
    });
  }
}
