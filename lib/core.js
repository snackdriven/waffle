// Pure utility functions extracted from app.js for testing.
// app.js retains its own copies — this module is test-only.

export const LABELS = ['15min', 'browse'];
export const STATUSES = ['active', 'waiting', 'done'];
export const TIME_STATES = ['due-by', 'open', 'recurring'];
export const RECURRENCE_RULES = ['daily', 'weekly', 'monthly'];
export const ACTIVE_WINDOW_DAYS = 10;
export const STALE_DAYS = 14;
export const DAY_MS = 86400000;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function getWeekStart(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const day = dt.getDay(); // 0=Sun
  const diff = day === 0 ? 6 : day - 1; // Mon=0
  return addDays(dateStr, -diff);
}

export function dayNum(dateStr) {
  return parseInt(dateStr.split('-')[2], 10);
}

export function computeNextDue(dueDate, rule) {
  if (!DATE_RE.test(dueDate)) return addDays(todayStr(), 1);
  const [y, m, d] = dueDate.split('-').map(Number);
  const validRule = RECURRENCE_RULES.includes(rule) ? rule : 'daily';

  if (validRule === 'daily') return addDays(dueDate, 1);
  if (validRule === 'weekly') return addDays(dueDate, 7);
  if (validRule === 'monthly') {
    let nextM = m + 1, nextY = y;
    if (nextM > 12) { nextM = 1; nextY += 1; }
    const lastDay = new Date(nextY, nextM, 0).getDate();
    const nextD = Math.min(d, lastDay);
    return `${nextY}-${String(nextM).padStart(2, '0')}-${String(nextD).padStart(2, '0')}`;
  }
  return addDays(dueDate, 1);
}

// nowMs is injectable for testing (defaults to Date.now())
export function isStale(task, nowMs = Date.now()) {
  return task.type === 'task' &&
    task.timeState === 'open' &&
    task.status === 'active' &&
    (nowMs - task.updatedAt) > STALE_DAYS * DAY_MS;
}

export function isRecurringTask(task) {
  return task.type === 'task' && task.timeState === 'recurring';
}

// items is injectable for testing (defaults to empty — no blockers)
export function isBlocked(task, items = []) {
  if (!task.dependsOn || task.dependsOn.length === 0) return false;
  return task.dependsOn.some(depId => {
    const dep = items.find(i => i.id === depId);
    return dep && dep.status !== 'done';
  });
}

export function canComplete(task, items = []) {
  if (isBlocked(task, items)) return false;
  if (task.subtasks && task.subtasks.some(s => !s.done)) return false;
  return true;
}

export function transitionStatus(task, nextStatus, items = []) {
  if (!STATUSES.includes(nextStatus)) return false;
  if (nextStatus === 'done' && !canComplete(task, items)) return false;
  task.status = nextStatus;
  task.updatedAt = Date.now();
  return true;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function validateItem(item) {
  if (!item || typeof item !== 'object') return null;

  const now = Date.now();

  if (item.type === 'event') {
    if (typeof item.title !== 'string' || !item.title.trim()) return null;
    const allDay = !!item.allDay;
    if (typeof item.dateTime !== 'string') return null;
    if (allDay) {
      if (!DATE_RE.test(item.dateTime)) return null;
    } else {
      if (!DATETIME_RE.test(item.dateTime) || isNaN(Date.parse(item.dateTime))) return null;
    }
    return {
      id: typeof item.id === 'string' ? item.id : crypto.randomUUID(),
      type: 'event',
      title: item.title.trim().slice(0, 500),
      dateTime: item.dateTime,
      allDay,
      location: typeof item.location === 'string' ? item.location.trim().slice(0, 500) : '',
      notes: typeof item.notes === 'string' ? item.notes.trim().slice(0, 2000) : '',
      createdAt: typeof item.createdAt === 'number' && item.createdAt > 0 ? item.createdAt : now,
    };
  }

  if (item.type === 'task') {
    if (typeof item.title !== 'string' || !item.title.trim()) return null;

    const timeState = TIME_STATES.includes(item.timeState) ? item.timeState : 'open';
    const status = STATUSES.includes(item.status) ? item.status : 'active';
    const createdAt = typeof item.createdAt === 'number' && item.createdAt > 0 ? item.createdAt : now;
    const updatedAt = typeof item.updatedAt === 'number' && item.updatedAt > 0 ? item.updatedAt : createdAt;

    let dueDate = (typeof item.dueDate === 'string' && DATE_RE.test(item.dueDate)) ? item.dueDate : null;
    let activationDate = (typeof item.activationDate === 'string' && DATE_RE.test(item.activationDate)) ? item.activationDate : null;

    if (timeState === 'recurring' && !dueDate) {
      dueDate = todayStr();
    }

    if (timeState === 'due-by' && dueDate && !activationDate) {
      activationDate = addDays(dueDate, -ACTIVE_WINDOW_DAYS);
      const today = todayStr();
      if (activationDate < today) activationDate = today;
    }

    if (activationDate && dueDate && activationDate > dueDate) {
      activationDate = dueDate;
    }

    const recurrenceRule = RECURRENCE_RULES.includes(item.recurrenceRule) ? item.recurrenceRule : null;
    const labels = Array.isArray(item.labels) ? item.labels.filter(l => LABELS.includes(l)) : [];
    const subtasks = Array.isArray(item.subtasks)
      ? item.subtasks
          .filter(s => s && typeof s.text === 'string' && s.text.trim())
          .map(s => ({
            id: typeof s.id === 'string' ? s.id : crypto.randomUUID(),
            text: s.text.trim().slice(0, 500),
            done: !!s.done,
          }))
      : [];
    const dependsOn = Array.isArray(item.dependsOn) ? item.dependsOn.filter(d => typeof d === 'string') : [];
    const linkedEvent = typeof item.linkedEvent === 'string' ? item.linkedEvent : null;

    return {
      id: typeof item.id === 'string' ? item.id : crypto.randomUUID(),
      type: 'task',
      title: item.title.trim().slice(0, 500),
      timeState,
      status,
      dueDate,
      activationDate,
      recurrenceRule,
      subtasks,
      dependsOn,
      linkedEvent,
      labels,
      createdAt,
      updatedAt,
    };
  }

  return null;
}
