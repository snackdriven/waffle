import { describe, it, expect } from 'vitest';
import { validateItem, ACTIVE_WINDOW_DAYS, addDays } from '../lib/core.js';

// ── Event validation ───────────────────────────────────────────────────────

describe('validateItem — events', () => {
  const goodEvent = {
    id: 'evt-1',
    type: 'event',
    title: 'Team standup',
    allDay: false,
    dateTime: '2025-06-15T09:00',
    location: 'Zoom',
    notes: 'Weekly sync',
    createdAt: 1000000,
  };

  it('round-trips a valid event unchanged', () => {
    const result = validateItem(goodEvent);
    expect(result).not.toBeNull();
    expect(result.title).toBe('Team standup');
    expect(result.location).toBe('Zoom');
    expect(result.notes).toBe('Weekly sync');
    expect(result.id).toBe('evt-1');
  });

  it('accepts an all-day event with YYYY-MM-DD dateTime', () => {
    const result = validateItem({ ...goodEvent, allDay: true, dateTime: '2025-06-15' });
    expect(result).not.toBeNull();
    expect(result.allDay).toBe(true);
  });

  it('rejects all-day event with datetime string', () => {
    const result = validateItem({ ...goodEvent, allDay: true, dateTime: '2025-06-15T09:00' });
    expect(result).toBeNull();
  });

  it('rejects timed event with date-only string', () => {
    const result = validateItem({ ...goodEvent, allDay: false, dateTime: '2025-06-15' });
    expect(result).toBeNull();
  });

  it('rejects missing title', () => {
    expect(validateItem({ ...goodEvent, title: '' })).toBeNull();
    expect(validateItem({ ...goodEvent, title: '   ' })).toBeNull();
  });

  it('trims and clamps title to 500 chars', () => {
    const long = 'x'.repeat(600);
    const result = validateItem({ ...goodEvent, title: `  ${long}  ` });
    expect(result.title.length).toBe(500);
  });

  it('defaults location and notes to empty string when absent', () => {
    const { location, notes, ...rest } = goodEvent;
    const result = validateItem(rest);
    expect(result.location).toBe('');
    expect(result.notes).toBe('');
  });

  it('generates a new id when id is missing', () => {
    const { id, ...rest } = goodEvent;
    const result = validateItem(rest);
    expect(typeof result.id).toBe('string');
    expect(result.id.length).toBeGreaterThan(0);
  });

  it('rejects null and non-objects', () => {
    expect(validateItem(null)).toBeNull();
    expect(validateItem('string')).toBeNull();
    expect(validateItem(42)).toBeNull();
  });

  it('returns null for unknown type', () => {
    expect(validateItem({ type: 'reminder', title: 'x' })).toBeNull();
  });
});

// ── Task validation ────────────────────────────────────────────────────────

describe('validateItem — tasks', () => {
  const goodTask = {
    id: 'task-1',
    type: 'task',
    title: 'Write tests',
    timeState: 'open',
    status: 'active',
    dueDate: null,
    activationDate: null,
    recurrenceRule: null,
    subtasks: [],
    dependsOn: [],
    linkedEvent: null,
    labels: [],
    createdAt: 1000000,
    updatedAt: 1000000,
  };

  it('round-trips a valid task', () => {
    const result = validateItem(goodTask);
    expect(result).not.toBeNull();
    expect(result.title).toBe('Write tests');
    expect(result.timeState).toBe('open');
    expect(result.status).toBe('active');
  });

  it('defaults invalid timeState to open', () => {
    const result = validateItem({ ...goodTask, timeState: 'maybe-later' });
    expect(result.timeState).toBe('open');
  });

  it('defaults invalid status to active', () => {
    const result = validateItem({ ...goodTask, status: 'blocked' });
    expect(result.status).toBe('active');
  });

  it('strips labels not in the allowed set', () => {
    const result = validateItem({ ...goodTask, labels: ['15min', 'urgent', 'browse', 'custom'] });
    expect(result.labels).toEqual(['15min', 'browse']);
  });

  it('sets dueDate to today when recurring task has no dueDate', () => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const result = validateItem({ ...goodTask, timeState: 'recurring', dueDate: null });
    expect(result.dueDate).toBe(todayStr);
  });

  it('auto-computes activationDate for due-by tasks (dueDate - 10d)', () => {
    const result = validateItem({
      ...goodTask,
      timeState: 'due-by',
      dueDate: '2099-12-31', // far future so clamp doesn't apply
      activationDate: null,
    });
    expect(result.activationDate).toBe(addDays('2099-12-31', -ACTIVE_WINDOW_DAYS));
  });

  it('clamps activationDate to dueDate when activation > due', () => {
    const result = validateItem({
      ...goodTask,
      timeState: 'due-by',
      dueDate: '2099-06-10',
      activationDate: '2099-06-15', // after dueDate
    });
    expect(result.activationDate).toBe('2099-06-10');
  });

  it('strips invalid recurrenceRule', () => {
    const result = validateItem({ ...goodTask, recurrenceRule: 'fortnightly' });
    expect(result.recurrenceRule).toBeNull();
  });

  it('normalizes subtasks — strips blank entries, trims text', () => {
    const result = validateItem({
      ...goodTask,
      subtasks: [
        { id: 's1', text: '  step one  ', done: false },
        { id: 's2', text: '', done: false }, // blank — should be stripped
        { id: 's3', text: 'step two', done: true },
      ],
    });
    expect(result.subtasks).toHaveLength(2);
    expect(result.subtasks[0].text).toBe('step one');
    expect(result.subtasks[1].done).toBe(true);
  });

  it('strips non-string entries from dependsOn', () => {
    const result = validateItem({ ...goodTask, dependsOn: ['id-1', 42, null, 'id-2'] });
    expect(result.dependsOn).toEqual(['id-1', 'id-2']);
  });

  it('rejects task with missing title', () => {
    expect(validateItem({ ...goodTask, title: '' })).toBeNull();
  });

  it('preserves createdAt and updatedAt when valid', () => {
    const result = validateItem({ ...goodTask, createdAt: 5000, updatedAt: 6000 });
    expect(result.createdAt).toBe(5000);
    expect(result.updatedAt).toBe(6000);
  });

  it('defaults updatedAt to createdAt when updatedAt is missing', () => {
    const { updatedAt, ...rest } = goodTask;
    const result = validateItem({ ...rest, createdAt: 7777 });
    expect(result.updatedAt).toBe(7777);
  });
});
