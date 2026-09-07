import { z } from 'zod';

export const personStatuses = ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;
export const personId = z.uuid();
const name = z.string().trim().min(1).max(100);
const reference = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[\p{L}\p{N}._-]+$/u);
const birthDate = z.iso
  .date()
  .refine((value) => value >= '1900-01-01' && value <= new Date().toISOString().slice(0, 10));
const common = {
  firstName: name,
  lastName: name,
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
};
export const studentCreate = z.strictObject({
  ...common,
  matricule: reference.optional(),
  birthDate: birthDate.nullable().optional(),
});
export const guardianCreate = z.strictObject({
  ...common,
  guardianReference: reference.optional(),
  email: z.email().max(254).toLowerCase().nullable().optional(),
  phone: z
    .string()
    .trim()
    .min(5)
    .max(30)
    .regex(/^\+?[0-9 ()\-.]+$/)
    .refine((value) => (value.match(/\d/g)?.length ?? 0) >= 5)
    .nullable()
    .optional(),
});
export const teacherCreate = z.strictObject({ ...common, employeeNumber: reference.optional() });
const notEmpty = (value: object) => Object.keys(value).length > 0;
export const studentUpdate = studentCreate.partial().refine(notEmpty);
export const guardianUpdate = guardianCreate.partial().refine(notEmpty);
export const teacherUpdate = teacherCreate.partial().refine(notEmpty);
const integer = (maximum: number) =>
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().max(maximum));
export const peopleQuery = z.strictObject({
  page: integer(10000).default(1),
  pageSize: integer(100).default(25),
  search: z.string().trim().max(100).default(''),
  status: z
    .enum([...personStatuses, 'ALL'])
    .or(z.literal(''))
    .transform((value) => value || 'ACTIVE')
    .default('ACTIVE'),
  sort: z
    .enum(['name', '-name', 'createdAt', '-createdAt', 'reference', '-reference'])
    .or(z.literal(''))
    .transform((value) => value || 'name')
    .default('name'),
});
export const emptyCommand = z.strictObject({});
const linkFields = {
  relationship: z.string().trim().min(1).max(60),
  isPrimary: z.boolean(),
  isFinancialContact: z.boolean(),
  receivesNotifications: z.boolean(),
};
export const guardianLinkCreate = z.strictObject({
  guardianId: personId,
  ...linkFields,
  isPrimary: linkFields.isPrimary.default(false),
  isFinancialContact: linkFields.isFinancialContact.default(false),
  receivesNotifications: linkFields.receivesNotifications.default(true),
});
export const guardianLinkUpdate = z.strictObject(linkFields).partial().refine(notEmpty);
export type PeopleQuery = z.infer<typeof peopleQuery>;
export type StudentCreate = z.infer<typeof studentCreate>;
export type GuardianCreate = z.infer<typeof guardianCreate>;
export type TeacherCreate = z.infer<typeof teacherCreate>;
export type StudentUpdate = z.infer<typeof studentUpdate>;
export type GuardianUpdate = z.infer<typeof guardianUpdate>;
export type TeacherUpdate = z.infer<typeof teacherUpdate>;
export type GuardianLinkCreate = z.infer<typeof guardianLinkCreate>;
export type GuardianLinkUpdate = z.infer<typeof guardianLinkUpdate>;
export type PeopleKind = 'students' | 'guardians' | 'teachers';
export interface PersonView {
  id: string;
  firstName: string;
  lastName: string;
  status: (typeof personStatuses)[number];
  matricule?: string;
  guardianReference?: string;
  employeeNumber?: string;
  birthDate?: string | null;
  email?: string | null;
  phone?: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface GuardianLinkView {
  studentId: string;
  guardianId: string;
  relationship: string;
  isPrimary: boolean;
  isFinancialContact: boolean;
  receivesNotifications: boolean;
  person: PersonView;
}
