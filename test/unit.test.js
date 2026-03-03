import { describe, it, expect } from 'vitest';
import {
  addDays,
  getWeekStart,
  dayNum,
  computeNextDue,
  isStale,
  isRecurringTask,
  isBlocked,
  canComplete,
  transitionStatus,
  DAY_MS,
  STALE_DAYS,
} from '../lib/core.js';

// ── addDays ────────────────────────────────────────────────────────────────

describe('addDays', () => {
  it('advances by positive n', () => {
    expect(addDays('2025-01-28', 4)).toBe('2025-02-01');
  });

  it('goes back with negative n', () => {
    expect(addDays('2025-03-01', -1)).toBe('2025-02-28');
  });

  it('handles month boundary', () => {
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
  });

  it('handles leap year', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
  });

  it('n=0 returns same date', () => {
    expect(addDays('2025-06-15', 0)).toBe('2025-06-15');
  });
});

// ── getWeekStart ───────────────────────────────────────────────────────────

describe('getWeekStart', () => {
  it('Monday returns itself', () => {
    expect(getWeekStart('2025-06-16')).toBe('2025-06-16'); // Monday
  });

  it('Wednesday returns the Monday', () => {
    expect(getWeekStart('2025-06-18')).toBe('2025-06-16');
  });

  it('Sunday returns the previous Monday', () => {
    expect(getWeekStart('2025-06-22')).toBe('2025-06-16');
  });

  it('crosses month boundary', () => {
    expect(getWeekStart('2025-06-01')).toBe('2025-05-26'); // Sunday → prev Mon
  });
});

// ── dayNum ─────────────────────────────────────────────────────────────────

describe('dayNum', () => {
  it('returns the day-of-month as a number', () => {
    expect(dayNum('2025-06-07')).toBe(7);
    expect(dayNum('2025-01-31')).toBe(31);
  });

  it('strips leading zero', () => {
    expect(dayNum('2025-06-03')).toBe(3);
  });
});

// ── computeNextDue ─────────────────────────────────────────────────────────

describe('computeNextDue', () => {
  it('daily: adds 1 day', () => {
    expect(computeNextDue('2025-06-15', 'daily')).toBe('2025-06-16');
  });

  it('weekly: adds 7 days', () => {
    expect(computeNextDue('2025-06-15', 'weekly')).toBe('2025-06-22');
  });

  it('monthly: same day next month', () => {
    expect(computeNextDue('2025-01-31', 'monthly')).toBe('2025-02-28'); // Feb clamp
    expect(computeNextDue('2025-06-15', 'monthly')).toBe('2025-07-15');
  });

  it('monthly: wraps year', () => {
    expect(computeNextDue('2025-12-15', 'monthly')).toBe('2026-01-15');
  });

  it('unknown rule falls back to daily', () => {
    expect(computeNextDue('2025-06-15', 'fortnightly')).toBe('2025-06-16');
  });
});

// ── isRecurringTask ────────────────────────────────────────────────────────

describe('isRecurringTask', () => {
  it('true for task with timeState recurring', () => {
    expect(isRecurringTask({ type: 'task', timeState: 'recurring' })).toBe(true);
  });

  it('false for open task', () => {
    expect(isRecurringTask({ type: 'task', timeState: 'open' })).toBe(false);
  });

  it('false for events', () => {
    expect(isRecurringTask({ type: 'event', timeState: 'recurring' })).toBe(false);
  });
});

// ── isStale ────────────────────────────────────────────────────────────────

describe('isStale', () => {
  const now = Date.now();
  const staleMs = now - (STALE_DAYS + 1) * DAY_MS;
  const freshMs = now - (STALE_DAYS - 1) * DAY_MS;

  const base = { type: 'task', timeState: 'open', status: 'active' };

  it('true when open+active and not updated in > 14 days', () => {
    expect(isStale({ ...base, updatedAt: staleMs }, now)).toBe(true);
  });

  it('false when recently updated', () => {
    expect(isStale({ ...base, updatedAt: freshMs }, now)).toBe(false);
  });

  it('false for due-by tasks', () => {
    expect(isStale({ ...base, timeState: 'due-by', updatedAt: staleMs }, now)).toBe(false);
  });

  it('false for waiting tasks', () => {
    expect(isStale({ ...base, status: 'waiting', updatedAt: staleMs }, now)).toBe(false);
  });

  it('false for done tasks', () => {
    expect(isStale({ ...base, status: 'done', updatedAt: staleMs }, now)).toBe(false);
  });
});

// ── isBlocked ──────────────────────────────────────────────────────────────

describe('isBlocked', () => {
  it('false when dependsOn is empty', () => {
    expect(isBlocked({ dependsOn: [] })).toBe(false);
  });

  it('true when a dependency is active', () => {
    const dep = { id: 'dep-1', status: 'active' };
    const task = { dependsOn: ['dep-1'] };
    expect(isBlocked(task, [dep])).toBe(true);
  });

  it('false when all dependencies are done', () => {
    const dep = { id: 'dep-1', status: 'done' };
    const task = { dependsOn: ['dep-1'] };
    expect(isBlocked(task, [dep])).toBe(false);
  });

  it('false when dependency ID not found (deleted item)', () => {
    const task = { dependsOn: ['ghost-id'] };
    expect(isBlocked(task, [])).toBe(false);
  });
});

// ── canComplete ────────────────────────────────────────────────────────────

describe('canComplete', () => {
  it('true for task with no blockers or pending subtasks', () => {
    expect(canComplete({ dependsOn: [], subtasks: [] })).toBe(true);
  });

  it('false when blocked by a dependency', () => {
    const dep = { id: 'dep-1', status: 'waiting' };
    const task = { dependsOn: ['dep-1'], subtasks: [] };
    expect(canComplete(task, [dep])).toBe(false);
  });

  it('false when a subtask is incomplete', () => {
    const task = { dependsOn: [], subtasks: [{ id: 's1', text: 'do it', done: false }] };
    expect(canComplete(task)).toBe(false);
  });

  it('true when all subtasks are done', () => {
    const task = { dependsOn: [], subtasks: [{ id: 's1', text: 'do it', done: true }] };
    expect(canComplete(task)).toBe(true);
  });
});

// ── transitionStatus ───────────────────────────────────────────────────────

describe('transitionStatus', () => {
  it('transitions active → waiting', () => {
    const task = { dependsOn: [], subtasks: [], status: 'active' };
    expect(transitionStatus(task, 'waiting')).toBe(true);
    expect(task.status).toBe('waiting');
  });

  it('transitions active → done when completable', () => {
    const task = { dependsOn: [], subtasks: [], status: 'active' };
    expect(transitionStatus(task, 'done')).toBe(true);
    expect(task.status).toBe('done');
  });

  it('blocks done when subtask is incomplete', () => {
    const task = {
      dependsOn: [],
      subtasks: [{ id: 's1', text: 'step', done: false }],
      status: 'active',
    };
    expect(transitionStatus(task, 'done')).toBe(false);
    expect(task.status).toBe('active');
  });

  it('blocks done when dependency is not done', () => {
    const dep = { id: 'dep-1', status: 'active' };
    const task = { dependsOn: ['dep-1'], subtasks: [], status: 'active' };
    expect(transitionStatus(task, 'done', [dep])).toBe(false);
  });

  it('rejects an invalid status string', () => {
    const task = { dependsOn: [], subtasks: [], status: 'active' };
    expect(transitionStatus(task, 'archived')).toBe(false);
    expect(task.status).toBe('active');
  });

  it('sets updatedAt on success', () => {
    const before = Date.now();
    const task = { dependsOn: [], subtasks: [], status: 'active', updatedAt: 0 };
    transitionStatus(task, 'waiting');
    expect(task.updatedAt).toBeGreaterThanOrEqual(before);
  });
});
