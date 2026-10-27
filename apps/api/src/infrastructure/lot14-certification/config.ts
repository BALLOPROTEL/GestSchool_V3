export const stagingOrigin = 'https://gestschool-v3-staging.vercel.app';
export const failure = () => new Error('LOT14_CERTIFICATION_FAILED');
export const roles = ['SCHOOL_ADMIN', 'TEACHER', 'PARENT', 'STUDENT'] as const;
export type Role = (typeof roles)[number];
export const scenarios = [
  'A_CANNOT_READ_B',
  'B_CANNOT_READ_A',
  'UUID_IDOR',
  'ADMIN_TENANT_SCOPE',
  'TEACHER_ASSIGNMENTS',
  'PARENT_CHILDREN',
  'STUDENT_OWN',
  'PEOPLE',
  'ACADEMIC',
  'ENROLLMENTS',
  'FINANCE',
  'RESULTS',
  'DOCUMENTS',
  'REPORTS',
] as const;
export const runBudgetMs = 480_000;
export const childBudgetMs = 540_000;

export function certificationEnabled(environment: NodeJS.ProcessEnv): boolean {
  const flag = environment.LOT14_CERTIFICATION_RUN;
  if (flag === undefined || flag === 'false') return false;
  if (
    flag !== 'true' ||
    environment.APP_ENV !== 'staging' ||
    environment.NODE_ENV !== 'production' ||
    environment.IAM_ENV !== 'staging' ||
    environment.APP_PUBLIC_ORIGIN !== stagingOrigin
  )
    throw failure();
  // Pin the same V3 database as the audited bootstrap, before any connection or HTTP write.
  try {
    const target = new URL(environment.DATABASE_URL ?? '');
    if (
      !['postgres:', 'postgresql:'].includes(target.protocol) ||
      target.hostname !== 'dpg-dbei7tqvcj2c73d1qukg-a.frankfurt-postgres.render.com' ||
      Number(target.port || 5432) !== 5432 ||
      decodeURIComponent(target.pathname) !== '/gestschool_v3_postgres_staging' ||
      !target.username ||
      !target.password ||
      target.hash ||
      [...target.searchParams.keys()].length !== 1 ||
      target.searchParams.get('sslmode') !== 'verify-full'
    )
      throw failure();
    const passwords = ['A', 'B'].flatMap((label) =>
      roles.map((role) => {
        const value = environment[`LOT14_BOOTSTRAP_${label}_${role}_PASSWORD`];
        if (!value || [...value].length < 20 || value.length > 128 || /\p{Cc}/u.test(value))
          throw failure();
        return value;
      }),
    );
    if (new Set(passwords).size !== 8) throw failure();
  } catch {
    throw failure();
  }
  return true;
}
