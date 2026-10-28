import { describe, expect, it } from 'vitest';

import { evaluateMonitoringSnapshot, type MonitoringSnapshot } from './monitoring.js';

const healthy = (): MonitoringSnapshot => ({
  apiReady: true,
  workerReady: true,
  dependencies: { postgres: 'up', redis: 'up', storage: 'up' },
  availability5mPct: 100,
  apiRequests5m: 100,
  apiP95Ms: 200,
  api5xxRatePct: 0,
  queueWaiting: 0,
  queueOldestAgeSeconds: 0,
  queueFailed5m: 0,
  postgresPoolUsagePct: 20,
  redisMemoryUsagePct: 20,
  storageErrors5m: 0,
  auth5xx5m: 0,
  backupLastSuccessAgeHours: 1,
});

describe('LOT15 provider-neutral monitoring alert policy', () => {
  it('keeps a healthy operator snapshot quiet', () => {
    expect(evaluateMonitoringSnapshot(healthy())).toEqual([]);
  });

  it('raises critical dependency and worker alerts immediately', () => {
    expect(
      evaluateMonitoringSnapshot({
        ...healthy(),
        apiReady: false,
        workerReady: false,
        dependencies: { postgres: 'down', redis: 'down', storage: 'down' },
      }),
    ).toEqual([
      { code: 'API_READY_DOWN', severity: 'critical' },
      { code: 'WORKER_READY_DOWN', severity: 'critical' },
      { code: 'POSTGRES_DOWN', severity: 'critical' },
      { code: 'REDIS_DOWN', severity: 'critical' },
      { code: 'STORAGE_DOWN', severity: 'critical' },
    ]);
  });

  it('uses warning then critical thresholds for latency, saturation and queues', () => {
    expect(
      evaluateMonitoringSnapshot({
        ...healthy(),
        availability5mPct: 98.9,
        apiP95Ms: 1500,
        queueWaiting: 100,
        queueOldestAgeSeconds: 60,
        queueFailed5m: 1,
        postgresPoolUsagePct: 80,
        redisMemoryUsagePct: 75,
        storageErrors5m: 1,
        auth5xx5m: 5,
        backupLastSuccessAgeHours: 26,
      }).every((alert) => alert.severity === 'warning'),
    ).toBe(true);

    expect(
      evaluateMonitoringSnapshot({
        ...healthy(),
        availability5mPct: 94.9,
        apiP95Ms: 3000,
        queueWaiting: 500,
        queueOldestAgeSeconds: 300,
        queueFailed5m: 10,
        postgresPoolUsagePct: 95,
        redisMemoryUsagePct: 90,
        storageErrors5m: 5,
        auth5xx5m: 20,
        backupLastSuccessAgeHours: 36,
      }).every((alert) => alert.severity === 'critical'),
    ).toBe(true);
  });

  it('does not alert on a 5xx percentage until the sample has at least 20 requests', () => {
    expect(
      evaluateMonitoringSnapshot({
        ...healthy(),
        apiRequests5m: 19,
        api5xxRatePct: 100,
      }).some((alert) => alert.code === 'API_5XX_RATE_HIGH'),
    ).toBe(false);

    expect(
      evaluateMonitoringSnapshot({
        ...healthy(),
        apiRequests5m: 20,
        api5xxRatePct: 5,
      }),
    ).toContainEqual({ code: 'API_5XX_RATE_HIGH', severity: 'critical' });
  });

  it('rejects malformed snapshots instead of silently producing alerts', () => {
    expect(() =>
      evaluateMonitoringSnapshot({
        ...healthy(),
        redisMemoryUsagePct: 101,
      }),
    ).toThrow('MONITORING_SNAPSHOT_INVALID');
    expect(() =>
      evaluateMonitoringSnapshot({
        ...healthy(),
        queueWaiting: Number.NaN,
      }),
    ).toThrow('MONITORING_SNAPSHOT_INVALID');
  });

  it('emits only stable codes and severities, never raw diagnostic payloads', () => {
    const serialized = JSON.stringify(
      evaluateMonitoringSnapshot({
        ...healthy(),
        apiReady: false,
        apiP95Ms: 3000,
      }),
    );
    expect(serialized).toBe(
      '[{"code":"API_READY_DOWN","severity":"critical"},{"code":"API_LATENCY_HIGH","severity":"critical"}]',
    );
    expect(serialized).not.toMatch(/url|email|token|secret|requestId/i);
  });
});
