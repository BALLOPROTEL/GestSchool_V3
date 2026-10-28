export type AlertSeverity = 'critical' | 'warning';

export type MonitoringAlertCode =
  | 'API_READY_DOWN'
  | 'WORKER_READY_DOWN'
  | 'POSTGRES_DOWN'
  | 'REDIS_DOWN'
  | 'STORAGE_DOWN'
  | 'AVAILABILITY_DEGRADED'
  | 'API_LATENCY_HIGH'
  | 'API_5XX_RATE_HIGH'
  | 'QUEUE_BACKLOG_HIGH'
  | 'QUEUE_OLDEST_JOB_HIGH'
  | 'QUEUE_FAILURES_HIGH'
  | 'POSTGRES_POOL_SATURATED'
  | 'REDIS_MEMORY_HIGH'
  | 'STORAGE_ERRORS_HIGH'
  | 'AUTH_5XX_HIGH'
  | 'BACKUP_STALE';

export interface MonitoringAlert {
  code: MonitoringAlertCode;
  severity: AlertSeverity;
}

export interface MonitoringSnapshot {
  apiReady: boolean;
  workerReady: boolean;
  dependencies: {
    postgres: 'down' | 'up';
    redis: 'down' | 'up';
    storage: 'down' | 'up';
  };
  availability5mPct: number;
  apiRequests5m: number;
  apiP95Ms: number;
  api5xxRatePct: number;
  queueWaiting: number;
  queueOldestAgeSeconds: number;
  queueFailed5m: number;
  postgresPoolUsagePct: number;
  redisMemoryUsagePct: number;
  storageErrors5m: number;
  auth5xx5m: number;
  backupLastSuccessAgeHours: number;
}

const numericKeys = [
  'availability5mPct',
  'apiRequests5m',
  'apiP95Ms',
  'api5xxRatePct',
  'queueWaiting',
  'queueOldestAgeSeconds',
  'queueFailed5m',
  'postgresPoolUsagePct',
  'redisMemoryUsagePct',
  'storageErrors5m',
  'auth5xx5m',
  'backupLastSuccessAgeHours',
] as const satisfies readonly (keyof MonitoringSnapshot)[];

function assertSnapshot(snapshot: MonitoringSnapshot): void {
  for (const key of numericKeys) {
    const value = snapshot[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
      throw new Error('MONITORING_SNAPSHOT_INVALID');
  }
  if (
    snapshot.availability5mPct > 100 ||
    snapshot.api5xxRatePct > 100 ||
    snapshot.postgresPoolUsagePct > 100 ||
    snapshot.redisMemoryUsagePct > 100
  )
    throw new Error('MONITORING_SNAPSHOT_INVALID');
}

function pushThreshold(
  alerts: MonitoringAlert[],
  code: MonitoringAlertCode,
  value: number,
  warning: number,
  critical: number,
): void {
  if (value >= critical) alerts.push({ code, severity: 'critical' });
  else if (value >= warning) alerts.push({ code, severity: 'warning' });
}

export function evaluateMonitoringSnapshot(snapshot: MonitoringSnapshot): MonitoringAlert[] {
  assertSnapshot(snapshot);
  const alerts: MonitoringAlert[] = [];

  if (!snapshot.apiReady) alerts.push({ code: 'API_READY_DOWN', severity: 'critical' });
  if (!snapshot.workerReady) alerts.push({ code: 'WORKER_READY_DOWN', severity: 'critical' });
  if (snapshot.dependencies.postgres === 'down')
    alerts.push({ code: 'POSTGRES_DOWN', severity: 'critical' });
  if (snapshot.dependencies.redis === 'down')
    alerts.push({ code: 'REDIS_DOWN', severity: 'critical' });
  if (snapshot.dependencies.storage === 'down')
    alerts.push({ code: 'STORAGE_DOWN', severity: 'critical' });

  if (snapshot.availability5mPct < 95)
    alerts.push({ code: 'AVAILABILITY_DEGRADED', severity: 'critical' });
  else if (snapshot.availability5mPct < 99)
    alerts.push({ code: 'AVAILABILITY_DEGRADED', severity: 'warning' });

  pushThreshold(alerts, 'API_LATENCY_HIGH', snapshot.apiP95Ms, 1500, 3000);
  if (snapshot.apiRequests5m >= 20)
    pushThreshold(alerts, 'API_5XX_RATE_HIGH', snapshot.api5xxRatePct, 2, 5);

  pushThreshold(alerts, 'QUEUE_BACKLOG_HIGH', snapshot.queueWaiting, 100, 500);
  pushThreshold(alerts, 'QUEUE_OLDEST_JOB_HIGH', snapshot.queueOldestAgeSeconds, 60, 300);
  pushThreshold(alerts, 'QUEUE_FAILURES_HIGH', snapshot.queueFailed5m, 1, 10);
  pushThreshold(alerts, 'POSTGRES_POOL_SATURATED', snapshot.postgresPoolUsagePct, 80, 95);
  pushThreshold(alerts, 'REDIS_MEMORY_HIGH', snapshot.redisMemoryUsagePct, 75, 90);
  pushThreshold(alerts, 'STORAGE_ERRORS_HIGH', snapshot.storageErrors5m, 1, 5);
  pushThreshold(alerts, 'AUTH_5XX_HIGH', snapshot.auth5xx5m, 5, 20);
  pushThreshold(alerts, 'BACKUP_STALE', snapshot.backupLastSuccessAgeHours, 26, 36);

  return alerts;
}
