/* eslint-disable no-console -- This command reports explicit PASS/FAIL results to the terminal. */
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import {
  checkInfrastructure,
  closeInfrastructureChecks,
  createInfrastructureChecks,
  isInfrastructureReady,
} from '@gestschool/infrastructure';

const configuration = loadInfrastructureConfig();
const checks = createInfrastructureChecks(configuration);

try {
  const states = await checkInfrastructure(checks);

  console.log(`PostgreSQL ${states.postgres === 'up' ? 'PASS' : 'FAIL'}`);
  console.log(`Redis ${states.redis === 'up' ? 'PASS' : 'FAIL'}`);
  console.log(`S3/MinIO ${states.storage === 'up' ? 'PASS' : 'FAIL'}`);

  const bucketUrl = new URL(`/${configuration.storage.bucket}`, configuration.storage.endpoint);
  let bucketIsPrivate = false;

  try {
    const response = await fetch(bucketUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(2_000),
    });
    bucketIsPrivate = response.status === 401 || response.status === 403;
  } catch {
    bucketIsPrivate = false;
  }

  console.log(`S3 bucket private ${bucketIsPrivate ? 'PASS' : 'FAIL'}`);

  if (!isInfrastructureReady(states) || !bucketIsPrivate) {
    throw new Error('Local GestSchool infrastructure is not ready');
  }
} finally {
  await closeInfrastructureChecks(checks);
}
