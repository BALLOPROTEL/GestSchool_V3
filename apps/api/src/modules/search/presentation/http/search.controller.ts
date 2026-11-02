import { Controller, Get, Inject, Query, Req } from '@nestjs/common';

import { academicReadScopes } from '../../../academics/domain/policy.js';
import { documentReadScopes } from '../../../documents/domain/policy.js';
import { enrollmentReadScopes } from '../../../enrollments/domain/policy.js';
import { financeReadScopes } from '../../../finance/domain/policy.js';
import {
  RequireAnyPermission,
  requestContext,
  type IamRequest,
} from '../../../iam/presentation/http/security.js';
import { readScopes } from '../../../people/domain/policy.js';
import { SearchService } from '../../application/search.service.js';

@Controller('api/v1/search')
export class SearchController {
  constructor(@Inject(SearchService) private readonly service: SearchService) {}

  @Get()
  @RequireAnyPermission([
    { permission: 'students.read', scopes: readScopes },
    { permission: 'guardians.read', scopes: readScopes },
    { permission: 'teachers.read', scopes: readScopes },
    { permission: 'classes.read', scopes: academicReadScopes },
    { permission: 'enrollments.read', scopes: enrollmentReadScopes },
    { permission: 'invoices.read', scopes: financeReadScopes },
    { permission: 'documents.read', scopes: documentReadScopes },
  ])
  search(@Req() request: IamRequest, @Query() query: unknown) {
    return this.service.search(requestContext(request), query);
  }
}
