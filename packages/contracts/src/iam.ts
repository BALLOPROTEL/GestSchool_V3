import { academicPermissionCodes, academicReadPermissions } from './academics.js';
import { enrollmentPermissionCodes } from './enrollments.js';
import { financePermissionCodes, financeReadPermissions } from './finance.js';
import {
  resultPermissionCodes,
  resultTeacherPermissions,
  resultPublishedPermissions,
} from './results.js';

export const scopes = ['PLATFORM', 'TENANT', 'ASSIGNED', 'CHILDREN', 'OWN', 'NONE'] as const;
export type AccessScope = (typeof scopes)[number];
export const systemRoles = [
  'SUPER_ADMIN',
  'SCHOOL_ADMIN',
  'DIRECTOR',
  'ACADEMIC_STAFF',
  'ACCOUNTANT',
  'TEACHER',
  'PARENT',
  'STUDENT',
] as const;
export type SystemRole = (typeof systemRoles)[number];
export const privilegedRoles: readonly string[] = [
  'SUPER_ADMIN',
  'SCHOOL_ADMIN',
  'DIRECTOR',
  'ACCOUNTANT',
];
export const permissionCodes = [
  ...academicPermissionCodes,
  ...enrollmentPermissionCodes,
  ...financePermissionCodes,
  ...resultPermissionCodes,
  'session.read',
  'session.revoke',
  'membership.read',
  'tenant.switch',
  'mfa.manage',
  'users.invite',
  'roles.assign',
  'permissions.manage',
  'students.read',
  'students.create',
  'students.update',
  'students.archive',
  'guardians.read',
  'guardians.create',
  'guardians.update',
  'guardians.archive',
  'teachers.read',
  'teachers.create',
  'teachers.update',
  'teachers.archive',
] as const;
export type PermissionCode = (typeof permissionCodes)[number];
export interface Grant {
  permission: string;
  scope: AccessScope;
}
const self = [
  'session.read',
  'session.revoke',
  'membership.read',
  'tenant.switch',
  'mfa.manage',
] as const;
const grants = (permissions: readonly string[], scope: AccessScope): Grant[] =>
  permissions.map((permission) => ({ permission, scope }));
export const roleGrants: Readonly<Record<SystemRole, readonly Grant[]>> = {
  SUPER_ADMIN: grants(permissionCodes, 'PLATFORM'),
  SCHOOL_ADMIN: [
    ...grants(resultPermissionCodes, 'TENANT'),
    ...grants(financePermissionCodes, 'TENANT'),
    ...grants(enrollmentPermissionCodes, 'TENANT'),
    ...grants(academicPermissionCodes, 'TENANT'),
    ...grants(self, 'OWN'),
    ...grants(
      [
        'students.archive',
        'guardians.read',
        'guardians.create',
        'guardians.update',
        'guardians.archive',
        'teachers.read',
        'teachers.create',
        'teachers.update',
        'teachers.archive',
      ],
      'TENANT',
    ),
    ...grants(
      ['users.invite', 'roles.assign', 'students.read', 'students.create', 'students.update'],
      'TENANT',
    ),
  ],
  DIRECTOR: [
    ...grants(resultPermissionCodes, 'TENANT'),
    ...grants([...financeReadPermissions, 'cash-sessions.read', 'payments.validate'], 'TENANT'),
    ...grants(enrollmentPermissionCodes, 'TENANT'),
    ...grants(academicPermissionCodes, 'TENANT'),
    ...grants(self, 'OWN'),
    ...grants(['guardians.read', 'teachers.read'], 'TENANT'),
    ...grants(['students.read'], 'TENANT'),
  ],
  ACADEMIC_STAFF: [
    ...grants(
      resultPermissionCodes.filter(
        (permission) =>
          !['grades.correct', 'grades.lock', 'report-cards.lock'].includes(permission),
      ),
      'TENANT',
    ),
    ...grants(enrollmentPermissionCodes, 'TENANT'),
    ...grants(academicPermissionCodes, 'TENANT'),
    ...grants(['teachers.read'], 'TENANT'),
    ...grants(self, 'OWN'),
    ...grants(['students.read', 'students.create', 'students.update'], 'TENANT'),
  ],
  ACCOUNTANT: [
    ...grants(financePermissionCodes, 'TENANT'),
    ...grants(['academic-years.read', 'levels.read', 'classes.read', 'enrollments.read'], 'TENANT'),
    ...grants(self, 'OWN'),
    ...grants(['students.read'], 'TENANT'),
  ],
  TEACHER: [
    ...grants(resultTeacherPermissions, 'ASSIGNED'),
    ...grants(academicReadPermissions, 'ASSIGNED'),
    ...grants(self, 'OWN'),
    ...grants(['teachers.read'], 'OWN'),
    ...grants(['students.read'], 'ASSIGNED'),
  ],
  PARENT: [
    ...grants(resultPublishedPermissions, 'CHILDREN'),
    ...grants(financeReadPermissions, 'CHILDREN'),
    ...grants(['enrollments.read'], 'CHILDREN'),
    ...grants(self, 'OWN'),
    ...grants(['guardians.read'], 'OWN'),
    ...grants(['students.read'], 'CHILDREN'),
  ],
  STUDENT: [
    ...grants(resultPublishedPermissions, 'OWN'),
    ...grants(financeReadPermissions, 'OWN'),
    ...grants(['enrollments.read'], 'OWN'),
    ...grants(self, 'OWN'),
    ...grants(['students.read'], 'OWN'),
  ],
};
export interface SessionView {
  user: { id: string; displayName: string };
  sessionId: string;
  membershipId: string;
  tenant: { id: string; name: string };
  roles: string[];
  grants: Grant[];
}
export type LoginResult =
  | { kind: 'session'; accessToken: string; expiresIn: number; session: SessionView }
  | { kind: 'mfa'; challenge: string; enrollmentRequired: boolean };
export interface ApiError {
  code: string;
  status: number;
  requestId: string;
}
