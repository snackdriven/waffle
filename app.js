// === Constants ===
const STORAGE_KEY = 'tc-items';
const BACKUP_KEY = 'tc-items-backup';
const SCHEMA_VERSION = 1;
const LABELS = ['15min', 'browse'];
const STATUSES = ['active', 'waiting', 'done'];
const TIME_STATES = ['due-by', 'open', 'recurring'];
const RECURRENCE_RULES = ['daily', 'weekly', 'monthly'];
const ACTIVE_WINDOW_DAYS = 10;
const STALE_DAYS = 14;
const DAY_MS = 86400000;
const MAX_UNDO = 20;
const PURGE_DAYS = 90;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const AUTH_KEY = 'tc-auth';
const LOCAL_ONLY_KEY = 'tc-local-only';
const PKCE_VERIFIER_KEY = 'tc-pkce-verifier';
const SUPABASE_URL = 'https://pynmkrcbkcfxifnztnrn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_8VEm7zR0vqKjOZRwH6jimw_qIWt-RPp';

// === Date Utilities ===
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function getWeekStart(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const day = dt.getDay(); // 0=Sun
  const diff = day === 0 ? 6 : day - 1; // Mon=0
  return addDays(dateStr, -diff);
}

function dayName(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en', { weekday: 'short' });
}

function dayNum(dateStr) {
  return parseInt(dateStr.split('-')[2], 10);
}

function computeNextDue(dueDate, rule) {
  if (!DATE_RE.test(dueDate)) return addDays(todayStr(), 1);
  const [y, m, d] = dueDate.split('-').map(Number);
  const validRule = RECURRENCE_RULES.includes(rule) ? rule : 'daily';

  let nextY = y, nextM = m, nextD = d;

  if (validRule === 'daily') {
    return addDays(dueDate, 1);
  } else if (validRule === 'weekly') {
    return addDays(dueDate, 7);
  } else if (validRule === 'monthly') {
    nextM += 1;
    if (nextM > 12) { nextM = 1; nextY += 1; }
    const lastDay = new Date(nextY, nextM, 0).getDate();
    nextD = Math.min(d, lastDay);
    return `${nextY}-${String(nextM).padStart(2, '0')}-${String(nextD).padStart(2, '0')}`;
  }
  return addDays(dueDate, 1);
}

function formatCountdown(dueDate) {
  if (!dueDate) return null;
  const today = todayStr();
  // Lexicographic comparison for YYYY-MM-DD
  if (dueDate < today) {
    const [ty, tm, td] = today.split('-').map(Number);
    const [dy, dm, dd] = dueDate.split('-').map(Number);
    const todayMs = new Date(ty, tm - 1, td).getTime();
    const dueMs = new Date(dy, dm - 1, dd).getTime();
    const days = Math.round((todayMs - dueMs) / DAY_MS);
    return { text: days === 1 ? '1d overdue' : `${days}d overdue`, cls: 'overdue' };
  } else if (dueDate === today) {
    return { text: 'Due today', cls: 'due-today' };
  } else {
    const [ty, tm, td] = today.split('-').map(Number);
    const [dy, dm, dd] = dueDate.split('-').map(Number);
    const todayMs = new Date(ty, tm - 1, td).getTime();
    const dueMs = new Date(dy, dm - 1, dd).getTime();
    const days = Math.round((dueMs - todayMs) / DAY_MS);
    if (days === 1) return { text: 'Due tomorrow', cls: 'due-soon' };
    if (days <= 3) return { text: `${days}d left`, cls: 'due-soon' };
    return { text: `${days}d left`, cls: 'due-later' };
  }
}

function formatDateTime(dateTime, allDay) {
  if (!dateTime) return '';
  try {
    if (allDay) {
      const [y, m, d] = dateTime.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      if (isNaN(dt.getTime())) return dateTime;
      return dt.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' }) + ' · All day';
    }
    const dt = new Date(dateTime);
    if (isNaN(dt.getTime())) return dateTime;
    return dt.toLocaleString('en', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch { return dateTime; }
}

function formatEventCountdown(dateTime, allDay) {
  if (!dateTime) return null;
  const today = todayStr();
  const eventDate = dateTime.slice(0, 10); // YYYY-MM-DD portion

  if (eventDate < today) {
    const [ty, tm, td] = today.split('-').map(Number);
    const [ey, em, ed] = eventDate.split('-').map(Number);
    const todayMs = new Date(ty, tm - 1, td).getTime();
    const eventMs = new Date(ey, em - 1, ed).getTime();
    const days = Math.round((todayMs - eventMs) / DAY_MS);
    if (days === 1) return { text: 'Yesterday', cls: 'overdue' };
    return { text: `${days}d ago`, cls: 'overdue' };
  } else if (eventDate === today) {
    if (allDay) return { text: 'Today', cls: 'due-soon' };
    // For timed events today, show time remaining or elapsed
    const now = new Date();
    const eventTime = new Date(dateTime);
    const diffMs = eventTime - now;
    if (diffMs > 60000) {
      // More than 1 minute away
      const hours = Math.floor(diffMs / 3600000);
      const mins = Math.floor((diffMs % 3600000) / 60000);
      if (hours > 0) return { text: `In ${hours}h ${mins}m`, cls: 'due-soon' };
      return { text: `In ${mins}m`, cls: 'due-soon' };
    } else if (diffMs > -60000) {
      // Within ±1 minute of start time
      return { text: 'Now', cls: 'due-soon' };
    } else {
      // Past event today — show how long ago
      const agoMs = -diffMs;
      const hours = Math.floor(agoMs / 3600000);
      const mins = Math.floor((agoMs % 3600000) / 60000);
      if (hours > 0) return { text: `${hours}h ${mins}m ago`, cls: 'overdue' };
      return { text: `${mins}m ago`, cls: 'overdue' };
    }
  } else {
    const [ty, tm, td] = today.split('-').map(Number);
    const [ey, em, ed] = eventDate.split('-').map(Number);
    const todayMs = new Date(ty, tm - 1, td).getTime();
    const eventMs = new Date(ey, em - 1, ed).getTime();
    const days = Math.round((eventMs - todayMs) / DAY_MS);
    if (days === 1) return { text: 'Tomorrow', cls: 'due-soon' };
    if (days <= 7) return { text: `In ${days}d`, cls: 'due-soon' };
    return { text: `In ${days}d`, cls: 'due-later' };
  }
}

// === DOM Helper ===
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.dataset) Object.assign(node.dataset, props.dataset);
  if (props.text) node.textContent = props.text;
  if (props.htmlFor) node.htmlFor = props.htmlFor;
  if (props.type) node.type = props.type;
  if (props.ariaLabel) node.setAttribute('aria-label', props.ariaLabel);
  if (props.role) node.setAttribute('role', props.role);
  if (props.id) node.id = props.id;
  if (props.style) node.style.cssText = props.style;
  if (props.disabled) node.disabled = true;
  if (props.checked) node.checked = true;
  if (props.value !== undefined) node.value = props.value;
  if (props.placeholder) node.placeholder = props.placeholder;
  if (props.maxlength) node.maxLength = props.maxlength;
  if (props.autocomplete) node.autocomplete = props.autocomplete;
  if (props.required) node.required = true;
  if (props.selected) node.selected = true;
  for (const c of children) {
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

// legacy/rare — for data-* IDs/enums only, never user-typed text
function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// === Pure Utility Functions ===
function isBlocked(task) {
  if (!task.dependsOn || task.dependsOn.length === 0) return false;
  return task.dependsOn.some(depId => {
    const dep = items.find(i => i.id === depId);
    return dep && dep.status !== 'done';
  });
}

function canComplete(task) {
  if (isBlocked(task)) return false;
  if (task.subtasks && task.subtasks.some(s => !s.done)) return false;
  return true;
}

function isStale(task) {
  return task.type === 'task' &&
    task.timeState === 'open' &&
    task.status === 'active' &&
    (Date.now() - task.updatedAt) > STALE_DAYS * DAY_MS;
}

function isRecurringTask(task) {
  return task.type === 'task' && task.timeState === 'recurring';
}

// === Status Transition Gatekeeper ===
function transitionStatus(task, nextStatus) {
  if (!STATUSES.includes(nextStatus)) return false;
  if (nextStatus === 'done' && !canComplete(task)) return false;
  task.status = nextStatus;
  task.updatedAt = Date.now();
  return true;
}

// === Validation ===
function validateItem(item) {
  if (!item || typeof item !== 'object') return null;

  const now = Date.now();

  // Events
  if (item.type === 'event') {
    if (typeof item.title !== 'string' || !item.title.trim()) return null;
    const allDay = !!item.allDay;
    // All-day events use YYYY-MM-DD, timed events use YYYY-MM-DDTHH:MM
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

  // Tasks
  if (item.type === 'task') {
    if (typeof item.title !== 'string' || !item.title.trim()) return null;

    const timeState = TIME_STATES.includes(item.timeState) ? item.timeState : 'open';
    const status = STATUSES.includes(item.status) ? item.status : 'active';
    const createdAt = typeof item.createdAt === 'number' && item.createdAt > 0 ? item.createdAt : now;
    const updatedAt = typeof item.updatedAt === 'number' && item.updatedAt > 0 ? item.updatedAt : createdAt;

    // Date validation: strict format only
    let dueDate = (typeof item.dueDate === 'string' && DATE_RE.test(item.dueDate)) ? item.dueDate : null;
    let activationDate = (typeof item.activationDate === 'string' && DATE_RE.test(item.activationDate)) ? item.activationDate : null;

    // Recurring tasks require dueDate
    if (timeState === 'recurring' && !dueDate) {
      dueDate = todayStr();
    }

    // Due-by tasks: auto-set activationDate if missing
    if (timeState === 'due-by' && dueDate && !activationDate) {
      activationDate = addDays(dueDate, -ACTIVE_WINDOW_DAYS);
      const today = todayStr();
      if (activationDate < today) activationDate = today;
    }

    // Clamp: activationDate must not exceed dueDate
    if (activationDate && dueDate && activationDate > dueDate) {
      activationDate = dueDate;
    }

    const recurrenceRule = RECURRENCE_RULES.includes(item.recurrenceRule) ? item.recurrenceRule : null;
    const labels = Array.isArray(item.labels) ? item.labels.filter(l => LABELS.includes(l)) : [];
    const subtasks = Array.isArray(item.subtasks) ? item.subtasks
      .filter(s => s && typeof s.text === 'string' && s.text.trim())
      .map(s => ({
        id: typeof s.id === 'string' ? s.id : crypto.randomUUID(),
        text: s.text.trim().slice(0, 500),
        done: !!s.done,
      })) : [];
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

  return null; // Unknown type
}

// === Persistence ===
function isValidEnvelope(parsed) {
  return parsed && typeof parsed === 'object' && typeof parsed.version === 'number' && Array.isArray(parsed.items);
}

function loadItems() {
  let loadedItems = [];
  let needsToast = null;

  // 1. Try primary
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isValidEnvelope(parsed)) {
        loadedItems = parsed.items.map(validateItem).filter(Boolean);
        return { items: loadedItems, toast: needsToast };
      }
    }
  } catch { /* fall through */ }

  // 2. Try backup
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isValidEnvelope(parsed)) {
        loadedItems = parsed.items.map(validateItem).filter(Boolean);
        needsToast = 'Recovered from backup';
        return { items: loadedItems, toast: needsToast };
      }
    }
  } catch { /* fall through */ }

  // 3. Try legacy migration
  try {
    const raw = localStorage.getItem('catppuccin-todos');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        loadedItems = migrateFromV0(parsed);
        // Clean up old keys
        try { localStorage.removeItem('catppuccin-todos'); } catch { /* ok */ }
        try { localStorage.removeItem('catppuccin-categories'); } catch { /* ok */ }
        needsToast = 'Migrated your tasks to the new format';
        return { items: loadedItems, toast: needsToast };
      }
    }
  } catch { /* fall through */ }

  // 4. Check if primary key existed but was corrupted
  if (localStorage.getItem(STORAGE_KEY) !== null || localStorage.getItem(BACKUP_KEY) !== null) {
    needsToast = 'Data was corrupted — starting fresh';
  }

  return { items: [], toast: needsToast };
}

function migrateFromV0(oldTodos) {
  const today = todayStr();
  const cutoff = addDays(today, -30);

  return oldTodos
    .filter(item => item && typeof item.text === 'string' && item.text.trim())
    .map(item => {
      // Try to parse legacy date
      let dueDate = null;
      if (item.dueDate && typeof item.dueDate === 'string') {
        // Try parsing to canonical YYYY-MM-DD
        if (DATE_RE.test(item.dueDate)) {
          dueDate = item.dueDate;
        } else {
          try {
            const d = new Date(item.dueDate);
            if (!isNaN(d.getTime())) {
              dueDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            }
          } catch { /* treat as dateless */ }
        }
      }

      const hasDueDate = dueDate !== null;
      const timeState = hasDueDate ? 'due-by' : 'open';
      let status = item.completed ? 'done' : 'active';

      // Ancient overdue due-by tasks: mark done
      if (hasDueDate && status === 'active' && dueDate < cutoff) {
        status = 'done';
      }

      let activationDate = null;
      if (hasDueDate && status !== 'done') {
        activationDate = addDays(dueDate, -ACTIVE_WINDOW_DAYS);
        if (activationDate < today) activationDate = today;
      }

      const now = Date.now();
      const createdAt = typeof item.createdAt === 'number' ? item.createdAt : now;

      const migrated = {
        id: typeof item.id === 'string' ? item.id : crypto.randomUUID(),
        type: 'task',
        title: item.text.trim().slice(0, 500),
        timeState,
        status,
        dueDate,
        activationDate,
        recurrenceRule: null,
        subtasks: [],
        dependsOn: [],
        linkedEvent: null,
        labels: [],
        createdAt,
        updatedAt: createdAt,
      };

      return validateItem(migrated);
    })
    .filter(Boolean);
}

function saveItems(skipSync = false) {
  // Auto-purge: drop done items older than PURGE_DAYS
  const now = Date.now();
  items = items.filter(item =>
    item.status !== 'done' || (now - item.updatedAt) <= PURGE_DAYS * DAY_MS
  );

  const envelope = JSON.stringify({ version: SCHEMA_VERSION, items });
  try {
    const previous = localStorage.getItem(STORAGE_KEY);
    if (previous) {
      try { localStorage.setItem(BACKUP_KEY, previous); } catch { /* skip */ }
    }
    localStorage.setItem(STORAGE_KEY, envelope);
  } catch {
    showToast("Couldn't save — storage full. Edits may be lost after reload.");
  }
  if (authSession && !skipSync) debouncedPush();
}

function cleanOrphanDependencies() {
  const ids = new Set(items.map(i => i.id));
  for (const item of items) {
    if (item.dependsOn && item.dependsOn.length > 0) {
      item.dependsOn = item.dependsOn.filter(id => ids.has(id));
    }
  }
}

// === State ===
let items = [];
let currentView = 'calendar';
let selectedDate = todayStr();
let weekStart = getWeekStart(todayStr());
let editingId = null;
let createFormType = null; // null, 'event', 'task'
let undoStack = [];
let toastTimer = null;
let pendingDeleteId = null;
let searchQuery = '';
const expandedIds = new Set(); // task IDs with subtask list expanded
let authSession = null;   // { accessToken, refreshToken, expiresAt, userId, email }
let syncStatus = 'idle';  // 'idle' | 'syncing' | 'synced' | 'error' | 'pending'
let syncTimer = null;
let lastSyncedAt = 0;
let calendarMode = 'day'; // 'day' | 'agenda'
let activeViewWindow = ACTIVE_WINDOW_DAYS; // days ahead; null = no limit
let allSortOrder = 'newest'; // 'newest' | 'due'
let allTypeFilter = 'all';  // 'all' | 'task' | 'event'
let browseSortOrder = '15min'; // '15min' | 'alpha' | 'newest'

// === Composable Filter Predicates ===
const allPreds = (...preds) => (item) => preds.every(p => p(item));
const anyPred = (...preds) => (item) => preds.some(p => p(item));

const isTask      = (item) => item.type === 'task';
const isEvent     = (item) => item.type === 'event';
const isDone      = (item) => item.status === 'done';
const notDone     = (item) => item.status !== 'done';
const isActiveish = (item) => item.status === 'active' || item.status === 'waiting';
const isDueBy     = (item) => item.timeState === 'due-by';
const isOpen      = (item) => item.timeState === 'open';
const isRecurring = (item) => item.timeState === 'recurring';
const hasLabel    = (l) => (item) => (item.labels || []).includes(l);
const onDate      = (d) => (item) => item.dueDate === d || (item.dateTime || '').startsWith(d);
const inWindow    = (today, windowEnd) => (item) =>
  item.activationDate <= today && item.dueDate >= today && (!windowEnd || item.dueDate <= windowEnd);
const isOverdue   = (today) => (item) => item.dueDate && item.dueDate < today;
const recurringDue = (today) => (item) => item.dueDate && item.dueDate <= today;

function getViewItems(viewName) {
  const today = todayStr();
  const windowEnd = activeViewWindow !== null ? addDays(today, activeViewWindow) : null;

  const VIEWS = {
    calendar:  onDate(selectedDate),
    active:    allPreds(isTask, isDueBy, isActiveish, inWindow(today, windowEnd)),
    overdue:   allPreds(isTask, isDueBy, isActiveish, isOverdue(today)),
    browse:    allPreds(isTask, isActiveish, anyPred(isOpen, hasLabel('browse'), hasLabel('15min'))),
    recurring: allPreds(isTask, isRecurring, recurringDue(today), notDone),
    done:      isDone,
    all:       (item) => allTypeFilter === 'all' || item.type === allTypeFilter,
  };

  const filter = VIEWS[viewName];
  if (!filter) return [];
  let result = items.filter(filter);

  // Apply search for All view
  if (viewName === 'all' && searchQuery) {
    const q = searchQuery.toLowerCase();
    result = result.filter(item => item.title.toLowerCase().includes(q));
  }

  // Sort per view
  result = sortForView(result, viewName, today);

  // Cap Done at 50
  if (viewName === 'done') {
    result = result.slice(0, 50);
  }

  return result;
}

function sortForView(arr, viewName, today) {
  const sorted = [...arr];
  switch (viewName) {
    case 'calendar':
      sorted.sort((a, b) => {
        if (a.type === 'event' && b.type !== 'event') return -1;
        if (a.type !== 'event' && b.type === 'event') return 1;
        if (a.type === 'event' && b.type === 'event') return (a.dateTime || '').localeCompare(b.dateTime || '');
        return a.createdAt - b.createdAt;
      });
      break;
    case 'active':
      sorted.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '') || (a.activationDate || '').localeCompare(b.activationDate || '') || a.createdAt - b.createdAt);
      break;
    case 'overdue':
      sorted.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
      break;
    case 'browse':
      if (browseSortOrder === 'alpha') {
        sorted.sort((a, b) => a.title.localeCompare(b.title));
      } else if (browseSortOrder === 'newest') {
        sorted.sort((a, b) => b.createdAt - a.createdAt);
      } else {
        sorted.sort((a, b) => {
          const a15 = (a.labels || []).includes('15min') ? 0 : 1;
          const b15 = (b.labels || []).includes('15min') ? 0 : 1;
          if (a15 !== b15) return a15 - b15;
          const ad = a.dueDate || '\uffff';
          const bd = b.dueDate || '\uffff';
          if (ad !== bd) return ad.localeCompare(bd);
          return a.createdAt - b.createdAt;
        });
      }
      break;
    case 'recurring':
      sorted.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '') || a.title.localeCompare(b.title));
      break;
    case 'done':
      sorted.sort((a, b) => b.updatedAt - a.updatedAt);
      break;
    case 'all':
      if (allSortOrder === 'due') {
        const getDate = i => i.dueDate || (i.dateTime ? i.dateTime.slice(0, 10) : null);
        sorted.sort((a, b) => {
          const da = getDate(a) || '9999-99-99';
          const db = getDate(b) || '9999-99-99';
          return da.localeCompare(db) || a.title.localeCompare(b.title);
        });
      } else {
        sorted.sort((a, b) => b.createdAt - a.createdAt);
      }
      break;
  }
  return sorted;
}

// === Mutation ===
function mutate(label, fn) {
  const before = JSON.stringify(items);
  const changed = fn();
  if (!changed) return;
  undoStack.push({ label, snapshot: before });
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  saveItems();
  render();
}

function undo() {
  const last = undoStack.pop();
  if (!last) return;
  items = JSON.parse(last.snapshot);
  saveItems();
  render();
  showToast(`Undid: ${last.label}`);
}

// === Toast ===
function showToast(message, showUndoBtn = false) {
  dismissToast();
  const container = document.getElementById('toast-container');
  const toast = el('div', { className: 'toast' }, [
    el('span', { className: 'toast-message', text: message }),
  ]);
  if (showUndoBtn) {
    const undoBtn = el('button', { className: 'toast-undo-btn', text: 'Undo' });
    undoBtn.addEventListener('click', undo);
    toast.appendChild(undoBtn);
  }
  container.innerHTML = '';
  container.appendChild(toast);
  toastTimer = setTimeout(() => dismissToast(), 5000);
}

function dismissToast() {
  clearTimeout(toastTimer);
  const container = document.getElementById('toast-container');
  const toast = container.querySelector('.toast');
  if (toast) {
    toast.classList.add('toast-out');
    toast.addEventListener('animationend', () => {
      container.innerHTML = '';
    }, { once: true });
  }
}

// === CRUD: Create ===
function createEvent(formData) {
  mutate('Event created', () => {
    items.push({
      id: crypto.randomUUID(),
      type: 'event',
      title: formData.title.trim().slice(0, 500),
      dateTime: formData.dateTime,
      allDay: !!formData.allDay,
      location: (formData.location || '').trim().slice(0, 500),
      notes: (formData.notes || '').trim().slice(0, 2000),
      createdAt: Date.now(),
    });
    return true;
  });
  showToast('Event created', true);
}

function createTask(formData) {
  const today = todayStr();
  let dueDate = formData.dueDate || null;
  let activationDate = formData.activationDate || null;
  const timeState = TIME_STATES.includes(formData.timeState) ? formData.timeState : 'open';

  if (timeState === 'recurring' && !dueDate) {
    dueDate = today;
  }

  if (timeState === 'due-by' && dueDate && !activationDate) {
    activationDate = addDays(dueDate, -ACTIVE_WINDOW_DAYS);
    if (activationDate < today) activationDate = today;
  }

  if (activationDate && dueDate && activationDate > dueDate) {
    activationDate = dueDate;
  }

  const recurrenceRule = timeState === 'recurring' && RECURRENCE_RULES.includes(formData.recurrenceRule)
    ? formData.recurrenceRule : null;
  const labels = Array.isArray(formData.labels) ? formData.labels.filter(l => LABELS.includes(l)) : [];
  const subtasks = Array.isArray(formData.subtasks) ? formData.subtasks
    .filter(s => s && s.text && s.text.trim())
    .map(s => ({ id: crypto.randomUUID(), text: s.text.trim().slice(0, 500), done: false })) : [];

  const now = Date.now();
  mutate('Task created', () => {
    items.push({
      id: crypto.randomUUID(),
      type: 'task',
      title: formData.title.trim().slice(0, 500),
      timeState,
      status: 'active',
      dueDate,
      activationDate,
      recurrenceRule,
      subtasks,
      dependsOn: [],
      linkedEvent: null,
      labels,
      createdAt: now,
      updatedAt: now,
    });
    return true;
  });
  showToast('Task created', true);
}

// === CRUD: Toggle / Complete ===
function toggleSubtask(taskId, subtaskId) {
  const task = items.find(i => i.id === taskId);
  if (!task) return;
  const subtask = (task.subtasks || []).find(s => s.id === subtaskId);
  if (!subtask) return;
  mutate('Subtask toggled', () => {
    subtask.done = !subtask.done;
    task.updatedAt = Date.now();
    return true;
  });
}

function toggleItem(id) {
  const item = items.find(i => i.id === id);
  if (!item || item.type !== 'task') return;

  // Done tasks use reopenItem() via the Reopen button, not checkboxes
  if (item.status === 'done') return;

  if (isRecurringTask(item)) {
    completeRecurringInstance(item);
    return;
  }

  if (!canComplete(item)) {
    if (isBlocked(item)) {
      showToast('Can\'t complete — blocked by dependencies');
    } else {
      showToast('Can\'t complete — finish subtasks first');
    }
    return;
  }

  mutate('Task completed', () => transitionStatus(item, 'done'));
  showToast('Task completed', true);
}

function completeRecurringInstance(task) {
  mutate('Complete recurring task', () => {
    if (!transitionStatus(task, 'done')) return false;
    createNextRecurringInstance(task);
    return true;
  });
  if (task.status === 'done') {
    showToast('Recurring task completed — next occurrence created', true);
  }
}

function createNextRecurringInstance(task) {
  const nextDue = computeNextDue(task.dueDate, task.recurrenceRule);
  const now = Date.now();
  items.push({
    id: crypto.randomUUID(),
    type: 'task',
    title: task.title,
    timeState: 'recurring',
    status: 'active',
    dueDate: nextDue,
    activationDate: null,
    recurrenceRule: task.recurrenceRule,
    subtasks: (task.subtasks || []).map(s => ({ id: crypto.randomUUID(), text: s.text, done: false })),
    dependsOn: [],
    linkedEvent: null,
    labels: [...(task.labels || [])],
    createdAt: now,
    updatedAt: now,
  });
}

// === CRUD: Delete ===
function requestDelete(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  pendingDeleteId = id;
  const dialog = document.getElementById('delete-dialog');
  const text = document.getElementById('delete-dialog-text');
  const preview = item.title.length > 60 ? item.title.slice(0, 60) + '...' : item.title;
  text.textContent = `"${preview}"`;
  const mainEl = document.querySelector('main.app');
  if (mainEl) mainEl.inert = true;
  dialog.showModal();
}

function confirmDelete() {
  const id = pendingDeleteId;
  pendingDeleteId = null;
  document.getElementById('delete-dialog').close();

  const item = items.find(i => i.id === id);
  if (!item) {
    showToast('Item already deleted');
    return;
  }

  const title = item.title;
  mutate('Item deleted', () => {
    items = items.filter(i => i.id !== id);
    // If event: clear linkedEvent on tasks
    if (item.type === 'event') {
      items.forEach(i => { if (i.linkedEvent === id) i.linkedEvent = null; });
    }
    // If task: remove from dependsOn
    if (item.type === 'task') {
      items.forEach(i => {
        if (i.dependsOn) i.dependsOn = i.dependsOn.filter(d => d !== id);
      });
    }
    return true;
  });
  const preview = title.length > 30 ? title.slice(0, 30) + '...' : title;
  showToast(`Deleted "${preview}"`, true);
}

function cancelDelete() {
  pendingDeleteId = null;
  document.getElementById('delete-dialog').close();
}

// === CRUD: Edit (Save) ===
function focusEditButton(id) {
  // After render, return focus to the item's edit button
  setTimeout(() => {
    const btn = document.querySelector(`[data-id="${escapeAttr(id)}"] .edit-btn`);
    if (btn) btn.focus();
  }, 0);
}

function saveTaskEdit(id, formData) {
  const task = items.find(i => i.id === id);
  if (!task || task.type !== 'task') return;

  mutate('Task updated', () => {
    task.title = formData.title.trim().slice(0, 500);
    task.timeState = TIME_STATES.includes(formData.timeState) ? formData.timeState : task.timeState;

    // Dates
    task.dueDate = (formData.dueDate && DATE_RE.test(formData.dueDate)) ? formData.dueDate : null;
    task.activationDate = (formData.activationDate && DATE_RE.test(formData.activationDate)) ? formData.activationDate : null;

    if (task.timeState === 'recurring' && !task.dueDate) task.dueDate = todayStr();
    if (task.timeState === 'due-by' && task.dueDate && !task.activationDate) {
      task.activationDate = addDays(task.dueDate, -ACTIVE_WINDOW_DAYS);
      const today = todayStr();
      if (task.activationDate < today) task.activationDate = today;
    }
    if (task.activationDate && task.dueDate && task.activationDate > task.dueDate) {
      task.activationDate = task.dueDate;
    }

    task.recurrenceRule = (task.timeState === 'recurring' && RECURRENCE_RULES.includes(formData.recurrenceRule))
      ? formData.recurrenceRule : null;
    task.labels = Array.isArray(formData.labels) ? formData.labels.filter(l => LABELS.includes(l)) : [];

    // Subtasks
    if (Array.isArray(formData.subtasks)) {
      task.subtasks = formData.subtasks
        .filter(s => s && s.text && s.text.trim())
        .map(s => ({
          id: s.id || crypto.randomUUID(),
          text: s.text.trim().slice(0, 500),
          done: !!s.done,
        }));
    }

    task.updatedAt = Date.now();

    // Status transition (transitionStatus also sets updatedAt on success)
    if (formData.status && formData.status !== task.status) {
      if (!transitionStatus(task, formData.status)) {
        showToast('Status kept as ' + task.status + ' — other changes saved');
      }
    }

    return true;
  });
  editingId = null;
  render();
  focusEditButton(id);
}

function saveEventEdit(id, formData) {
  const event = items.find(i => i.id === id);
  if (!event || event.type !== 'event') return;

  mutate('Event updated', () => {
    event.title = formData.title.trim().slice(0, 500);
    event.dateTime = formData.dateTime || event.dateTime;
    event.allDay = !!formData.allDay;
    event.location = (formData.location || '').trim().slice(0, 500);
    event.notes = (formData.notes || '').trim().slice(0, 2000);
    return true;
  });
  editingId = null;
  render();
  focusEditButton(id);
}

// === Reopen (Done view) ===
function reopenItem(id) {
  const item = items.find(i => i.id === id);
  if (!item || item.type !== 'task') return;

  if (isRecurringTask(item)) {
    showToast("Can't reopen recurring tasks — create a new one instead");
    return;
  }

  mutate('Task reopened', () => {
    if (item.timeState === 'due-by') {
      item.activationDate = todayStr();
    }
    return transitionStatus(item, 'active');
  });
  showToast('Task reopened', true);
}

// === Rendering ===
function render() {
  if (!document.getElementById('view-nav')) return;
  renderViewNav();
  renderCreateToggle();

  const content = document.getElementById('content');
  content.innerHTML = '';
  content.setAttribute('role', 'tabpanel');

  if (currentView === 'calendar') {
    content.appendChild(renderCalendarModeToggle());
    if (calendarMode === 'day') content.appendChild(renderWeekStrip());
  }

  if (currentView === 'browse') {
    content.appendChild(renderBrowseSortToggle());
  }

  if (currentView === 'all') {
    content.appendChild(renderSearchBar());
    const allControlsRow = el('div', { className: 'all-controls-row' });
    allControlsRow.appendChild(renderAllTypeFilter());
    allControlsRow.appendChild(renderAllSortToggle());
    content.appendChild(allControlsRow);
  }

  // For Active view, render Overdue / Due Today / Upcoming sections
  if (currentView === 'active') {
    content.appendChild(renderActiveWindowToggle());
    const overdueItems = getViewItems('overdue');
    const today = todayStr();
    const activeItems = getViewItems('active');
    const todayItems = activeItems.filter(i => i.dueDate === today);
    const upcomingItems = activeItems.filter(i => i.dueDate !== today);
    const hasAny = overdueItems.length > 0 || activeItems.length > 0;

    if (overdueItems.length > 0) {
      const section = el('section', { className: 'overdue-section' }, [
        el('h2', { className: 'section-heading overdue-heading', text: 'Overdue' }),
      ]);
      const list = el('ul', { className: 'item-list' });
      overdueItems.forEach(item => list.appendChild(renderItemCard(item)));
      section.appendChild(list);
      content.appendChild(section);
    }

    if (todayItems.length > 0) {
      const section = el('section', { className: 'today-section' }, [
        el('h2', { className: 'section-heading today-heading', text: 'Due today' }),
      ]);
      const list = el('ul', { className: 'item-list' });
      todayItems.forEach(item => list.appendChild(renderItemCard(item)));
      section.appendChild(list);
      content.appendChild(section);
    }

    if (upcomingItems.length > 0) {
      if (overdueItems.length > 0 || todayItems.length > 0) {
        content.appendChild(el('h2', { className: 'section-heading', text: 'Upcoming' }));
      }
      const list = el('ul', { className: 'item-list' });
      upcomingItems.forEach(item => list.appendChild(renderItemCard(item)));
      content.appendChild(list);
    }

    if (!hasAny) {
      content.appendChild(renderEmptyState());
    }
  } else {
    if (currentView === 'calendar' && calendarMode === 'agenda') {
      content.appendChild(renderAgendaView());
    } else {
      const viewItems = getViewItems(currentView);
      if (viewItems.length === 0) {
        content.appendChild(renderEmptyState());
      } else {
        const readOnly = currentView === 'done';
        const list = el('ul', { className: 'item-list' });
        viewItems.forEach(item => list.appendChild(renderItemCard(item, { readOnly })));
        content.appendChild(list);
        if (currentView === 'done') {
          const allDoneCount = items.filter(isDone).length;
          const noteText = allDoneCount > 50
            ? `Showing 50 of ${allDoneCount} · items auto-purge 90 days after completion`
            : 'Items auto-purge 90 days after completion';
          content.appendChild(el('p', { className: 'done-cap-note', text: noteText }));
        }
      }
    }
  }

  // Only re-render the create form when the form type changes, not on every render().
  // This preserves user input (title, dates, selects) during renders triggered by
  // other actions like timeState select changes or unrelated state updates.
  const formContainer = document.getElementById('create-form-container');
  const currentFormType = formContainer.dataset.formType || null;
  if (createFormType && createFormType !== currentFormType) {
    formContainer.dataset.formType = createFormType;
    renderCreateForm();
  } else if (!createFormType) {
    formContainer.innerHTML = '';
    delete formContainer.dataset.formType;
  }

  // Item count in header
  const taskCount = document.getElementById('task-count');
  const activeCount = items.filter(i => i.type === 'task' && i.status !== 'done').length;
  taskCount.textContent = `${activeCount} active`;

  // Sign-out button in header
  const headerActions = document.getElementById('header-actions');
  if (headerActions) {
    headerActions.innerHTML = '';
    if (authSession) {
      const signOutBtn = el('button', { className: 'sign-out-btn', text: 'Sign out' });
      signOutBtn.addEventListener('click', () => clearAuthSession());
      headerActions.appendChild(signOutBtn);
    }
  }

  renderSyncIndicator();
}

function renderWithTransition() {
  if (!document.startViewTransition) { render(); return; }
  document.startViewTransition(() => render());
}

function renderViewNav() {
  const nav = document.getElementById('view-nav');
  nav.innerHTML = '';
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', 'Views');

  const views = [
    { key: 'calendar', label: 'Calendar' },
    { key: 'active', label: 'Active' },
    { key: 'browse', label: 'Anytime' },
    { key: 'recurring', label: 'Recurring' },
    { key: 'done', label: 'Done' },
    { key: 'all', label: 'All' },
  ];

  views.forEach(v => {
    const isActive = v.key === currentView;
    const btn = el('button', {
      className: `view-tab${isActive ? ' active' : ''}`,
      role: 'tab',
      ariaLabel: v.label,
    });
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    btn.setAttribute('tabindex', isActive ? '0' : '-1');
    btn.dataset.view = v.key;
    btn.appendChild(document.createTextNode(v.label));

    let count = 0;
    if (v.key === 'active') count = getViewItems('overdue').length + getViewItems('active').length;
    else if (v.key === 'recurring') count = getViewItems('recurring').length;
    if (count > 0) {
      const badge = el('span', { className: 'tab-count-badge', text: String(count) });
      badge.setAttribute('aria-label', `${count} items`);
      btn.appendChild(badge);
    }

    btn.addEventListener('click', () => {
      currentView = v.key;
      editingId = null;
      window.scrollTo(0, 0);
      renderWithTransition();
    });
    nav.appendChild(btn);
  });

  nav.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const tabs = [...nav.querySelectorAll('.view-tab')];
    const current = tabs.findIndex(t => t.classList.contains('active'));
    let next;
    if (e.key === 'ArrowRight') next = (current + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    tabs[next].click();
    tabs[next].focus();
  });
}

function renderCreateToggle() {
  const container = document.getElementById('create-toggle');
  container.innerHTML = '';

  const eventBtn = el('button', { className: `create-btn${createFormType === 'event' ? ' active' : ''}`, text: 'New Event' });
  eventBtn.addEventListener('click', () => {
    createFormType = createFormType === 'event' ? null : 'event';
    render();
  });

  const taskBtn = el('button', { className: `create-btn${createFormType === 'task' ? ' active' : ''}`, text: 'New Task' });
  taskBtn.addEventListener('click', () => {
    createFormType = createFormType === 'task' ? null : 'task';
    render();
  });

  container.appendChild(eventBtn);
  container.appendChild(taskBtn);
}

function renderCreateForm() {
  const existing = document.getElementById('create-form-container');
  existing.innerHTML = '';

  if (createFormType === 'event') {
    existing.appendChild(buildEventForm());
  } else if (createFormType === 'task') {
    existing.appendChild(buildTaskForm());
  }
}

function buildEventForm() {
  const form = el('div', { className: 'create-form' });

  const titleInput = el('input', { type: 'text', placeholder: 'Event title', maxlength: 500, required: true, autocomplete: 'off' });
  titleInput.setAttribute('aria-label', 'Event title');

  // All-day toggle
  const allDayRow = el('div', { className: 'form-row allday-row' });
  const allDayLabel = el('label', { className: 'allday-label' });
  const allDayCheck = el('input', { type: 'checkbox' });
  allDayCheck.setAttribute('aria-label', 'All day event');
  allDayLabel.append(allDayCheck, document.createTextNode(' All day'));
  allDayRow.appendChild(allDayLabel);

  // Date/time input — swaps between date and datetime-local
  const dateTimeInput = el('input', { type: 'datetime-local' });
  dateTimeInput.setAttribute('aria-label', 'Event date and time');

  allDayCheck.addEventListener('change', () => {
    const oldVal = dateTimeInput.value;
    if (allDayCheck.checked) {
      dateTimeInput.type = 'date';
      dateTimeInput.setAttribute('aria-label', 'Event date');
      // Preserve date portion if switching from datetime-local
      if (oldVal && oldVal.includes('T')) dateTimeInput.value = oldVal.slice(0, 10);
    } else {
      dateTimeInput.type = 'datetime-local';
      dateTimeInput.setAttribute('aria-label', 'Event date and time');
      // Preserve date portion if switching from date
      if (oldVal && !oldVal.includes('T')) dateTimeInput.value = oldVal + 'T12:00';
    }
  });

  const locationInput = el('input', { type: 'text', placeholder: 'Location (optional)', maxlength: 500, autocomplete: 'off' });
  locationInput.setAttribute('aria-label', 'Event location');

  const notesInput = el('textarea', { placeholder: 'Notes (optional)', maxlength: 2000 });
  notesInput.setAttribute('aria-label', 'Event notes');
  notesInput.rows = 2;

  const actions = el('div', { className: 'form-actions' });
  const cancelBtn = el('button', { className: 'btn-cancel', text: 'Cancel' });
  cancelBtn.addEventListener('click', () => { createFormType = null; render(); });
  const submitBtn = el('button', { className: 'btn-primary', text: 'Create Event' });
  submitBtn.addEventListener('click', () => {
    const title = titleInput.value.trim();
    if (!title) { titleInput.focus(); return; }
    const dateTime = dateTimeInput.value;
    if (!dateTime) { dateTimeInput.focus(); return; }
    createEvent({ title, dateTime, allDay: allDayCheck.checked, location: locationInput.value, notes: notesInput.value });
    createFormType = null;
    render();
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(submitBtn);
  form.append(titleInput, allDayRow, dateTimeInput, locationInput, notesInput, actions);

  setTimeout(() => titleInput.focus(), 0);
  return form;
}

function buildTaskForm() {
  const form = el('div', { className: 'create-form' });

  const titleInput = el('input', { type: 'text', placeholder: 'Task title', maxlength: 500, required: true, autocomplete: 'off' });
  titleInput.setAttribute('aria-label', 'Task title');

  const timeStateSelect = el('select');
  timeStateSelect.setAttribute('aria-label', 'Time state');
  TIME_STATES.forEach(ts => {
    const opt = el('option', { value: ts, text: ts === 'due-by' ? 'Due by' : ts === 'open' ? 'Open' : 'Recurring' });
    timeStateSelect.appendChild(opt);
  });
  timeStateSelect.value = 'open';

  const dueDateInput = el('input', { type: 'date' });
  dueDateInput.setAttribute('aria-label', 'Due date');
  const dueDateRow = el('div', { className: 'form-row conditional', id: 'due-date-row' }, [
    el('label', { text: 'Due date' }),
    dueDateInput,
  ]);

  const activationDateInput = el('input', { type: 'date' });
  activationDateInput.setAttribute('aria-label', 'Activation date');
  const activationDateRow = el('div', { className: 'form-row conditional', id: 'activation-date-row' }, [
    el('label', { text: 'Starts surfacing' }),
    activationDateInput,
  ]);

  const recurrenceSelect = el('select');
  recurrenceSelect.setAttribute('aria-label', 'Recurrence rule');
  RECURRENCE_RULES.forEach(r => {
    recurrenceSelect.appendChild(el('option', { value: r, text: r.charAt(0).toUpperCase() + r.slice(1) }));
  });
  const recurrenceRow = el('div', { className: 'form-row conditional', id: 'recurrence-row' }, [
    el('label', { text: 'Repeats' }),
    recurrenceSelect,
  ]);

  // Labels
  const labelsRow = el('div', { className: 'form-row label-row' });
  const selectedLabels = new Set();
  LABELS.forEach(l => {
    const chip = el('button', { className: 'label-chip', text: l, type: 'button' });
    chip.addEventListener('click', () => {
      if (selectedLabels.has(l)) { selectedLabels.delete(l); chip.classList.remove('active'); }
      else { selectedLabels.add(l); chip.classList.add('active'); }
    });
    labelsRow.appendChild(chip);
  });

  // Subtasks
  const subtaskList = el('div', { className: 'subtask-list', id: 'create-subtask-list' });
  const subtaskInput = el('input', { type: 'text', placeholder: 'Add subtask...', maxlength: 500, autocomplete: 'off' });
  subtaskInput.setAttribute('aria-label', 'Add subtask');
  subtaskInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const text = subtaskInput.value.trim();
      if (!text) return;
      const item = el('div', { className: 'subtask-entry' }, [
        el('span', { text, className: 'subtask-text' }),
        (() => {
          const btn = el('button', { className: 'subtask-remove', text: '\u00d7', type: 'button', ariaLabel: 'Remove subtask' });
          btn.addEventListener('click', () => item.remove());
          return btn;
        })(),
      ]);
      subtaskList.appendChild(item);
      subtaskInput.value = '';
    }
  });

  // Conditional field visibility
  function updateConditionalFields() {
    const ts = timeStateSelect.value;
    activationDateRow.style.display = ts === 'due-by' ? '' : 'none';
    recurrenceRow.style.display = ts === 'recurring' ? '' : 'none';
  }
  timeStateSelect.addEventListener('change', updateConditionalFields);
  dueDateInput.addEventListener('change', () => {
    if (dueDateInput.value && timeStateSelect.value === 'open') {
      timeStateSelect.value = 'due-by';
      updateConditionalFields();
    } else if (!dueDateInput.value && timeStateSelect.value === 'due-by') {
      timeStateSelect.value = 'open';
      updateConditionalFields();
    }
  });
  updateConditionalFields();

  const actions = el('div', { className: 'form-actions' });
  const cancelBtn = el('button', { className: 'btn-cancel', text: 'Cancel' });
  cancelBtn.addEventListener('click', () => { createFormType = null; render(); });
  const submitBtn = el('button', { className: 'btn-primary', text: 'Create Task' });
  submitBtn.addEventListener('click', () => {
    const title = titleInput.value.trim();
    if (!title) { titleInput.focus(); return; }

    const subtasks = [...subtaskList.querySelectorAll('.subtask-entry')].map(entry => ({
      text: entry.querySelector('.subtask-text').textContent,
    }));

    createTask({
      title,
      timeState: timeStateSelect.value,
      dueDate: dueDateInput.value || null,
      activationDate: activationDateInput.value || null,
      recurrenceRule: recurrenceSelect.value,
      labels: [...selectedLabels],
      subtasks,
    });
    createFormType = null;
    render();
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(submitBtn);
  form.append(titleInput, timeStateSelect, dueDateRow, activationDateRow, recurrenceRow, labelsRow,
    el('div', { className: 'subtask-section' }, [subtaskList, subtaskInput]),
    actions);

  setTimeout(() => titleInput.focus(), 0);
  return form;
}

// === All View Type Filter ===
function renderAllTypeFilter() {
  const toggle = el('div', { className: 'calendar-mode-toggle' });
  const options = [
    { label: 'All',    value: 'all'   },
    { label: 'Tasks',  value: 'task'  },
    { label: 'Events', value: 'event' },
  ];
  options.forEach(({ label, value }) => {
    const btn = el('button', {
      className: `calendar-mode-btn${allTypeFilter === value ? ' active' : ''}`,
      text: label,
    });
    btn.addEventListener('click', () => { allTypeFilter = value; render(); });
    toggle.appendChild(btn);
  });
  return toggle;
}

// === Browse Sort Toggle ===
function renderBrowseSortToggle() {
  const toggle = el('div', { className: 'calendar-mode-toggle' });
  const options = [
    { label: '15min first', value: '15min'  },
    { label: 'A→Z',         value: 'alpha'  },
    { label: 'Newest',      value: 'newest' },
  ];
  options.forEach(({ label, value }) => {
    const btn = el('button', {
      className: `calendar-mode-btn${browseSortOrder === value ? ' active' : ''}`,
      text: label,
    });
    btn.addEventListener('click', () => { browseSortOrder = value; render(); });
    toggle.appendChild(btn);
  });
  return toggle;
}

// === All View Sort Toggle ===
function renderAllSortToggle() {
  const toggle = el('div', { className: 'calendar-mode-toggle' });
  const options = [
    { label: 'Newest', value: 'newest' },
    { label: 'Due',    value: 'due'    },
  ];
  options.forEach(({ label, value }) => {
    const btn = el('button', {
      className: `calendar-mode-btn${allSortOrder === value ? ' active' : ''}`,
      text: label,
    });
    btn.addEventListener('click', () => { allSortOrder = value; render(); });
    toggle.appendChild(btn);
  });
  return toggle;
}

// === Active Window Toggle ===
function renderActiveWindowToggle() {
  const wrapper = el('div', { className: 'window-toggle-row' });
  wrapper.appendChild(el('span', { className: 'window-toggle-label', text: 'Due within:' }));
  const toggle = el('div', { className: 'calendar-mode-toggle' });
  const options = [
    { label: '10 days', value: 10 },
    { label: '30 days', value: 30 },
    { label: 'All', value: null },
  ];
  options.forEach(({ label, value }) => {
    const btn = el('button', {
      className: `calendar-mode-btn${activeViewWindow === value ? ' active' : ''}`,
      text: label,
    });
    btn.addEventListener('click', () => { activeViewWindow = value; render(); });
    toggle.appendChild(btn);
  });
  wrapper.appendChild(toggle);
  return wrapper;
}

// === Calendar Mode Toggle & Agenda ===
function renderCalendarModeToggle() {
  const toggle = el('div', { className: 'calendar-mode-toggle' });
  ['day', 'agenda'].forEach(mode => {
    const btn = el('button', {
      className: `calendar-mode-btn${calendarMode === mode ? ' active' : ''}`,
      text: mode === 'day' ? 'Day' : 'Agenda',
    });
    btn.addEventListener('click', () => { calendarMode = mode; render(); });
    toggle.appendChild(btn);
  });
  return toggle;
}

function renderAgendaView() {
  const today = todayStr();
  const upcoming = items
    .filter(i => i.type === 'event' && (i.dateTime || '').slice(0, 10) >= today)
    .sort((a, b) => (a.dateTime || '').localeCompare(b.dateTime || ''));

  if (upcoming.length === 0) {
    return el('div', { className: 'empty-state' }, [el('p', { text: 'No upcoming events' })]);
  }

  const groups = new Map();
  for (const event of upcoming) {
    const date = (event.dateTime || '').slice(0, 10);
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(event);
  }

  const container = el('div', { className: 'agenda-view' });
  container.appendChild(el('p', { className: 'agenda-events-note', text: 'Events only — see Active for tasks' }));
  for (const [date, events] of groups) {
    const [y, m, d] = date.split('-').map(Number);
    const isToday = date === today;
    const label = isToday
      ? 'Today'
      : new Date(y, m - 1, d).toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' });
    const section = el('div', { className: 'agenda-date-group' });
    section.appendChild(el('p', { className: `agenda-date-heading${isToday ? ' today' : ''}`, text: label }));
    const list = el('ul', { className: 'item-list' });
    events.forEach(e => list.appendChild(renderItemCard(e, { agendaMode: true })));
    section.appendChild(list);
    container.appendChild(section);
  }
  return container;
}

// === Week Strip (Calendar) ===
function renderWeekStrip() {
  const strip = el('div', { className: 'week-strip' });
  const today = todayStr();

  const prevBtn = el('button', { className: 'week-nav', text: '\u2039', ariaLabel: 'Previous week' });
  prevBtn.addEventListener('click', () => { weekStart = addDays(weekStart, -7); render(); });

  const nextBtn = el('button', { className: 'week-nav', text: '\u203a', ariaLabel: 'Next week' });
  nextBtn.addEventListener('click', () => { weekStart = addDays(weekStart, 7); render(); });

  const todayBtn = el('button', { className: 'week-today-btn', text: 'Today' });
  todayBtn.addEventListener('click', () => {
    selectedDate = todayStr();
    weekStart = getWeekStart(todayStr());
    render();
  });

  const days = el('div', { className: 'week-days' });
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    const isToday = d === today;
    const isSelected = d === selectedDate;
    const hasItems = items.some(onDate(d));

    const dayCell = el('button', {
      className: `week-day${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`,
      ariaLabel: `${dayName(d)} ${dayNum(d)}${isToday ? ' (today)' : ''}`,
    }, [
      el('span', { className: 'week-day-name', text: dayName(d) }),
      el('span', { className: 'week-day-num', text: String(dayNum(d)) }),
      hasItems ? el('span', { className: 'week-day-dot' }) : document.createTextNode(''),
    ]);

    dayCell.addEventListener('click', () => { selectedDate = d; render(); });
    days.appendChild(dayCell);
  }

  strip.append(prevBtn, days, nextBtn, todayBtn);
  return strip;
}

// === Search Bar (All view) ===
function renderSearchBar() {
  const bar = el('div', { className: 'search-bar' });
  const input = el('input', { type: 'text', placeholder: 'Search by title...', autocomplete: 'off', value: searchQuery });
  input.setAttribute('aria-label', 'Search items');
  input.addEventListener('input', () => {
    searchQuery = input.value;
    // Re-render just the list, not the search bar itself
    const content = document.getElementById('content');
    const existingList = content.querySelector('.item-list');
    if (existingList) existingList.remove();
    const emptyState = content.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const viewItems = getViewItems('all');
    if (viewItems.length === 0) {
      content.appendChild(renderEmptyState());
    } else {
      const list = el('ul', { className: 'item-list' });
      viewItems.forEach(item => list.appendChild(renderItemCard(item, { readOnly: true })));
      content.appendChild(list);
    }
  });
  bar.appendChild(input);
  return bar;
}

// === Item Cards ===
function renderItemCard(item, opts = {}) {
  if (editingId === item.id && !opts.readOnly) {
    return item.type === 'event' ? renderEventEditForm(item) : renderTaskEditForm(item);
  }
  const card = item.type === 'event' ? renderEventCard(item, opts) : renderTaskCard(item, opts);
  if (currentView === 'all') {
    card.classList.add('reveal-on-interact');
    card.addEventListener('click', e => {
      if (e.target.closest('button, input, label')) return;
      document.querySelectorAll('.item-card.reveal-on-interact.selected')
        .forEach(c => { if (c !== card) c.classList.remove('selected'); });
      card.classList.toggle('selected');
    });
  }
  return card;
}

function renderEventCard(event, opts = {}) {
  const card = el('li', { className: 'item-card event-card', dataset: { id: event.id, type: 'event' } });

  const content = el('div', { className: 'item-content' }, [
    el('span', { className: 'item-title', text: event.title }),
  ]);

  const meta = el('div', { className: 'item-meta' });
  if (event.dateTime) {
    if (opts.agendaMode) {
      // Date is already in the group header — show time only for timed events
      if (!event.allDay) {
        const t = new Date(event.dateTime).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' });
        meta.appendChild(el('span', { className: 'event-time', text: t }));
      }
    } else {
      meta.appendChild(el('span', { className: 'event-time', text: formatDateTime(event.dateTime, event.allDay) }));
    }
  }
  const eventCountdown = formatEventCountdown(event.dateTime, event.allDay);
  if (eventCountdown) {
    meta.appendChild(el('span', { className: `countdown ${eventCountdown.cls}`, text: eventCountdown.text }));
  }
  if (event.location) {
    meta.appendChild(el('span', { className: 'event-location', text: event.location }));
  }
  if (event.notes) {
    meta.appendChild(el('span', { className: 'event-notes', text: event.notes }));
  }
  if (meta.childNodes.length > 0) content.appendChild(meta);

  card.appendChild(content);

  if (!opts.readOnly) {
    const actions = el('div', { className: 'item-actions' });
    const editBtn = el('button', { className: 'edit-btn', ariaLabel: `Edit ${event.title}` });
    editBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';
    editBtn.addEventListener('click', () => { editingId = event.id; render(); });

    const deleteBtn = el('button', { className: 'delete-btn', ariaLabel: `Delete ${event.title}` });
    deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    deleteBtn.addEventListener('click', () => requestDelete(event.id));

    actions.append(editBtn, deleteBtn);
    card.appendChild(actions);
  }

  return card;
}

function renderTaskCard(task, opts = {}) {
  const isOverdueTask = task.dueDate && task.status !== 'done' && task.dueDate < todayStr();
  const card = el('li', { className: `item-card task-card${task.status === 'done' ? ' completed' : ''}${isOverdueTask ? ' overdue' : ''}${task.status === 'waiting' ? ' waiting' : ''}`, dataset: { id: task.id, type: 'task' } });

  const blocked = isBlocked(task);
  const completable = canComplete(task);
  const isDoneView = currentView === 'done';

  // Checkbox (not for Done/All read-only views showing reopen instead)
  if (!isDoneView && !opts.readOnly) {
    const checkLabel = el('label', { className: 'checkbox' });
    const checkInput = el('input', { type: 'checkbox', checked: task.status === 'done' });
    const isRecurringType = task.timeState === 'recurring';
    const doneLabel = isRecurringType ? 'Complete and schedule next occurrence' : 'done';
    checkInput.setAttribute('aria-label', `Mark ${task.title} as ${task.status === 'done' ? 'active' : doneLabel}`);
    if (!completable && task.status !== 'done') checkInput.disabled = true;
    checkInput.addEventListener('change', () => toggleItem(task.id));
    const checkmark = el('span', { className: 'checkmark' });
    checkmark.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';
    checkLabel.append(checkInput, checkmark);
    card.appendChild(checkLabel);
  }

  const content = el('div', { className: 'item-content' }, [
    el('span', { className: 'item-title', text: task.title }),
  ]);

  // Meta: countdown first (urgency), labels, subtasks, actionability badges, stale
  const meta = el('div', { className: 'item-meta' });

  if (task.dueDate && task.status !== 'done') {
    const countdown = formatCountdown(task.dueDate);
    if (countdown) {
      meta.appendChild(el('span', { className: `countdown ${countdown.cls}`, text: countdown.text }));
    }
  }

  (task.labels || []).forEach(l => {
    meta.appendChild(el('span', { className: 'label-chip label-badge', text: l, ariaLabel: `Label: ${l}` }));
  });

  if (task.subtasks && task.subtasks.length > 0) {
    const done = task.subtasks.filter(s => s.done).length;
    const isExpanded = expandedIds.has(task.id);
    const expandBtn = el('button', {
      className: `subtask-toggle${isExpanded ? ' expanded' : ''}`,
      text: `${done}/${task.subtasks.length} subtasks`,
      type: 'button',
      ariaLabel: `${isExpanded ? 'Collapse' : 'Expand'} subtasks`,
    });
    expandBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (expandedIds.has(task.id)) expandedIds.delete(task.id);
      else expandedIds.add(task.id);
      render();
    });
    meta.appendChild(expandBtn);
  }

  if (blocked) {
    meta.appendChild(el('span', { className: 'badge blocked-badge', text: 'blocked', ariaLabel: 'Blocked by dependencies' }));
  }

  if (task.status === 'waiting') {
    meta.appendChild(el('span', { className: 'badge waiting-badge', text: 'waiting', ariaLabel: 'Status: waiting' }));
  }

  if (isStale(task)) {
    meta.appendChild(el('span', { className: 'badge stale-badge', text: 'stale', ariaLabel: 'Stale: not updated in 14+ days' }));
  }

  if (task.recurrenceRule && task.timeState === 'recurring') {
    meta.appendChild(el('span', { className: 'badge recurrence-badge', text: task.recurrenceRule, ariaLabel: `Repeats ${task.recurrenceRule}` }));
  }

  if (meta.childNodes.length > 0) content.appendChild(meta);

  if (expandedIds.has(task.id) && task.subtasks && task.subtasks.length > 0) {
    const subtaskList = el('div', { className: 'card-subtask-list' });
    task.subtasks.forEach(s => {
      const entry = el('div', { className: `card-subtask-entry${s.done ? ' done' : ''}` });
      const chk = el('input', { type: 'checkbox', checked: s.done });
      chk.setAttribute('aria-label', s.text);
      chk.addEventListener('change', () => toggleSubtask(task.id, s.id));
      entry.append(chk, el('span', { className: 'subtask-text', text: s.text }));
      subtaskList.appendChild(entry);
    });
    content.appendChild(subtaskList);
  }

  card.appendChild(content);

  // Actions
  if (!opts.readOnly && !isDoneView) {
    const actions = el('div', { className: 'item-actions' });
    const editBtn = el('button', { className: 'edit-btn', ariaLabel: `Edit ${task.title}` });
    editBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';
    editBtn.addEventListener('click', () => { editingId = task.id; render(); });

    const deleteBtn = el('button', { className: 'delete-btn', ariaLabel: `Delete ${task.title}` });
    deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    deleteBtn.addEventListener('click', () => requestDelete(task.id));

    actions.append(editBtn, deleteBtn);
    card.appendChild(actions);
  }

  // Reopen button for Done view
  if (isDoneView && task.type === 'task') {
    const reopenBtn = el('button', { className: 'btn-reopen', text: 'Reopen', ariaLabel: `Reopen ${task.title}` });
    reopenBtn.addEventListener('click', () => reopenItem(task.id));
    card.appendChild(reopenBtn);
  }

  return card;
}

// === Edit Forms ===
function renderTaskEditForm(task) {
  const card = el('li', { className: 'item-card editing', dataset: { id: task.id } });
  const form = el('div', { className: 'edit-form' });

  const titleInput = el('input', { type: 'text', value: task.title, maxlength: 500 });
  titleInput.setAttribute('aria-label', 'Edit task title');

  // Status
  const statusSelect = el('select');
  statusSelect.setAttribute('aria-label', 'Status');
  STATUSES.forEach(s => {
    const opt = el('option', { value: s, text: s.charAt(0).toUpperCase() + s.slice(1) });
    if (s === task.status) opt.selected = true;
    statusSelect.appendChild(opt);
  });

  // Time state
  const timeStateSelect = el('select');
  timeStateSelect.setAttribute('aria-label', 'Time state');
  TIME_STATES.forEach(ts => {
    const opt = el('option', { value: ts, text: ts === 'due-by' ? 'Due by' : ts === 'open' ? 'Open' : 'Recurring' });
    if (ts === task.timeState) opt.selected = true;
    timeStateSelect.appendChild(opt);
  });

  const dueDateInput = el('input', { type: 'date', value: task.dueDate || '' });
  dueDateInput.setAttribute('aria-label', 'Due date');
  const dueDateRow = el('div', { className: 'form-row conditional' }, [
    el('label', { text: 'Due date' }),
    dueDateInput,
  ]);

  const activationDateInput = el('input', { type: 'date', value: task.activationDate || '' });
  activationDateInput.setAttribute('aria-label', 'Activation date');
  const activationDateRow = el('div', { className: 'form-row conditional' }, [
    el('label', { text: 'Starts surfacing' }),
    activationDateInput,
  ]);

  const recurrenceSelect = el('select');
  recurrenceSelect.setAttribute('aria-label', 'Recurrence rule');
  RECURRENCE_RULES.forEach(r => {
    const opt = el('option', { value: r, text: r.charAt(0).toUpperCase() + r.slice(1) });
    if (r === task.recurrenceRule) opt.selected = true;
    recurrenceSelect.appendChild(opt);
  });
  const recurrenceRow = el('div', { className: 'form-row conditional' }, [
    el('label', { text: 'Repeats' }),
    recurrenceSelect,
  ]);

  // Labels
  const labelsRow = el('div', { className: 'form-row label-row' });
  const selectedLabels = new Set(task.labels || []);
  LABELS.forEach(l => {
    const chip = el('button', { className: `label-chip${selectedLabels.has(l) ? ' active' : ''}`, text: l, type: 'button' });
    chip.addEventListener('click', () => {
      if (selectedLabels.has(l)) { selectedLabels.delete(l); chip.classList.remove('active'); }
      else { selectedLabels.add(l); chip.classList.add('active'); }
    });
    labelsRow.appendChild(chip);
  });

  // Subtasks
  const subtaskSection = el('div', { className: 'subtask-section' });
  const subtaskListEl = el('div', { className: 'subtask-list' });

  function renderSubtaskEntry(s) {
    const entry = el('div', { className: `subtask-entry${s.done ? ' done' : ''}`, dataset: { subtaskId: s.id } });
    const toggle = el('input', { type: 'checkbox', checked: s.done });
    toggle.setAttribute('aria-label', `Toggle subtask: ${s.text}`);
    toggle.addEventListener('change', () => {
      s.done = toggle.checked;
      entry.classList.toggle('done', s.done);
    });
    const text = el('span', { className: 'subtask-text', text: s.text });
    const removeBtn = el('button', { className: 'subtask-remove', text: '\u00d7', type: 'button', ariaLabel: `Remove subtask: ${s.text}` });
    removeBtn.addEventListener('click', () => entry.remove());
    entry.append(toggle, text, removeBtn);
    return entry;
  }

  (task.subtasks || []).forEach(s => subtaskListEl.appendChild(renderSubtaskEntry({ ...s })));

  const subtaskInput = el('input', { type: 'text', placeholder: 'Add subtask...', maxlength: 500, autocomplete: 'off' });
  subtaskInput.setAttribute('aria-label', 'Add subtask');
  subtaskInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const text = subtaskInput.value.trim();
      if (!text) return;
      subtaskListEl.appendChild(renderSubtaskEntry({ id: crypto.randomUUID(), text, done: false }));
      subtaskInput.value = '';
    }
  });

  subtaskSection.append(subtaskListEl, subtaskInput);

  // Conditional fields
  function updateConditionalFields() {
    const ts = timeStateSelect.value;
    activationDateRow.style.display = ts === 'due-by' ? '' : 'none';
    recurrenceRow.style.display = ts === 'recurring' ? '' : 'none';
  }
  timeStateSelect.addEventListener('change', updateConditionalFields);
  dueDateInput.addEventListener('change', () => {
    if (dueDateInput.value && timeStateSelect.value === 'open') {
      timeStateSelect.value = 'due-by';
      updateConditionalFields();
    } else if (!dueDateInput.value && timeStateSelect.value === 'due-by') {
      timeStateSelect.value = 'open';
      updateConditionalFields();
    }
  });
  updateConditionalFields();

  // Actions
  const actions = el('div', { className: 'form-actions' });
  const cancelBtn = el('button', { className: 'btn-cancel', text: 'Cancel' });
  cancelBtn.addEventListener('click', () => { const eid = task.id; editingId = null; render(); focusEditButton(eid); });
  const saveBtn = el('button', { className: 'btn-primary', text: 'Save' });
  saveBtn.addEventListener('click', () => {
    const title = titleInput.value.trim();
    if (!title) { titleInput.focus(); return; }

    const subtasks = [...subtaskListEl.querySelectorAll('.subtask-entry')].map(entry => ({
      id: entry.dataset.subtaskId,
      text: entry.querySelector('.subtask-text').textContent,
      done: entry.querySelector('input[type="checkbox"]').checked,
    }));

    saveTaskEdit(task.id, {
      title,
      status: statusSelect.value,
      timeState: timeStateSelect.value,
      dueDate: dueDateInput.value || null,
      activationDate: activationDateInput.value || null,
      recurrenceRule: recurrenceSelect.value,
      labels: [...selectedLabels],
      subtasks,
    });
  });

  actions.append(cancelBtn, saveBtn);

  form.append(titleInput, el('div', { className: 'form-row' }, [statusSelect, timeStateSelect]),
    dueDateRow, activationDateRow, recurrenceRow, labelsRow, subtaskSection, actions);
  card.appendChild(form);

  // Focus + keyboard
  setTimeout(() => titleInput.focus(), 0);
  card.addEventListener('keydown', e => {
    if (e.key === 'Escape') { const eid = task.id; editingId = null; render(); focusEditButton(eid); }
    if (e.key === 'Enter' && e.target === titleInput) { e.preventDefault(); saveBtn.click(); }
  });

  return card;
}

function renderEventEditForm(event) {
  const card = el('li', { className: 'item-card editing', dataset: { id: event.id } });
  const form = el('div', { className: 'edit-form' });

  const titleInput = el('input', { type: 'text', value: event.title, maxlength: 500 });
  titleInput.setAttribute('aria-label', 'Edit event title');

  // All-day toggle
  const allDayRow = el('div', { className: 'form-row allday-row' });
  const allDayLabel = el('label', { className: 'allday-label' });
  const allDayCheck = el('input', { type: 'checkbox', checked: event.allDay });
  allDayCheck.setAttribute('aria-label', 'All day event');
  allDayLabel.append(allDayCheck, document.createTextNode(' All day'));
  allDayRow.appendChild(allDayLabel);

  const dateTimeInput = el('input', {
    type: event.allDay ? 'date' : 'datetime-local',
    value: event.dateTime || '',
  });
  dateTimeInput.setAttribute('aria-label', event.allDay ? 'Event date' : 'Event date and time');

  allDayCheck.addEventListener('change', () => {
    const oldVal = dateTimeInput.value;
    if (allDayCheck.checked) {
      dateTimeInput.type = 'date';
      dateTimeInput.setAttribute('aria-label', 'Event date');
      if (oldVal && oldVal.includes('T')) dateTimeInput.value = oldVal.slice(0, 10);
    } else {
      dateTimeInput.type = 'datetime-local';
      dateTimeInput.setAttribute('aria-label', 'Event date and time');
      if (oldVal && !oldVal.includes('T')) dateTimeInput.value = oldVal + 'T12:00';
    }
  });

  const locationInput = el('input', { type: 'text', value: event.location || '', placeholder: 'Location', maxlength: 500 });
  locationInput.setAttribute('aria-label', 'Event location');

  const notesInput = el('textarea', { placeholder: 'Notes', maxlength: 2000 });
  notesInput.setAttribute('aria-label', 'Event notes');
  notesInput.value = event.notes || '';
  notesInput.rows = 2;

  const actions = el('div', { className: 'form-actions' });
  const cancelBtn = el('button', { className: 'btn-cancel', text: 'Cancel' });
  cancelBtn.addEventListener('click', () => { const eid = event.id; editingId = null; render(); focusEditButton(eid); });
  const saveBtn = el('button', { className: 'btn-primary', text: 'Save' });
  saveBtn.addEventListener('click', () => {
    const title = titleInput.value.trim();
    if (!title) { titleInput.focus(); return; }
    saveEventEdit(event.id, {
      title,
      dateTime: dateTimeInput.value,
      allDay: allDayCheck.checked,
      location: locationInput.value,
      notes: notesInput.value,
    });
  });

  actions.append(cancelBtn, saveBtn);
  form.append(titleInput, allDayRow, dateTimeInput, locationInput, notesInput, actions);
  card.appendChild(form);

  setTimeout(() => titleInput.focus(), 0);
  card.addEventListener('keydown', e => {
    if (e.key === 'Escape') { const eid = event.id; editingId = null; render(); focusEditButton(eid); }
  });

  return card;
}

// === Empty State ===
function renderEmptyState() {
  const messages = {
    calendar: 'Nothing on this day',
    active: activeViewWindow === null ? 'All clear — no upcoming tasks' : `All clear — nothing due in the next ${activeViewWindow} days`,
    browse: 'No open tasks to browse',
    recurring: 'No recurring tasks due',
    done: 'No completed tasks',
    all: searchQuery ? 'No items match your search' : 'No items yet',
  };
  const icon = document.createElement('span');
  icon.className = 'empty-state-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>';
  const div = el('div', { className: 'empty-state' });
  div.appendChild(icon);
  div.appendChild(el('p', { text: messages[currentView] || 'Nothing here' }));
  return div;
}

// === Auth & Sync ===
function loadAuthSession() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.accessToken || !parsed.refreshToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveAuthSession(session) {
  authSession = session;
  try { localStorage.setItem(AUTH_KEY, JSON.stringify(session)); } catch { /* skip */ }
}

async function clearAuthSession() {
  if (authSession) {
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authSession.accessToken}`,
          'apikey': SUPABASE_ANON_KEY,
        },
      });
    } catch { /* ignore */ }
  }
  authSession = null;
  try { localStorage.removeItem(AUTH_KEY); } catch { /* ok */ }
  renderLoginScreen();
}

function extractTokensFromHash() {
  const hash = window.location.hash;
  if (!hash || !hash.includes('access_token')) return null;
  const params = new URLSearchParams(hash.slice(1));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const expiresIn = parseInt(params.get('expires_in') || '3600', 10);
  if (!accessToken || !refreshToken) return null;
  history.replaceState(null, '', window.location.pathname);
  return { accessToken, refreshToken, expiresAt: Date.now() + expiresIn * 1000 };
}

function extractRedirectError() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error') || params.get('error_code');
  const desc = params.get('error_description');
  if (!error) return null;
  history.replaceState(null, '', window.location.pathname);
  return desc ? `${error}: ${desc}` : error;
}

async function exchangeCodeForTokens() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return null;
  const codeVerifier = localStorage.getItem(PKCE_VERIFIER_KEY);
  if (!codeVerifier) {
    console.warn('[auth] PKCE code found in URL but no code_verifier in storage — link may have opened in a different browser');
    history.replaceState(null, '', window.location.pathname);
    return null;
  }
  try { localStorage.removeItem(PKCE_VERIFIER_KEY); } catch { /* skip */ }
  history.replaceState(null, '', window.location.pathname);
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ auth_code: code, code_verifier: codeVerifier }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[auth] PKCE token exchange failed:', res.status, body);
      return null;
    }
    const data = await res.json();
    if (!data.access_token || !data.refresh_token) return null;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
    };
  } catch (err) {
    console.error('[auth] PKCE token exchange error:', err);
    return null;
  }
}

async function exchangeTokenHash() {
  const params = new URLSearchParams(window.location.search);
  const tokenHash = params.get('token_hash');
  const type = params.get('type');
  if (!tokenHash || type !== 'email') return null;
  history.replaceState(null, '', window.location.pathname);
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ token_hash: tokenHash, type: 'email' }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[auth] token_hash verification failed:', res.status, body);
      return null;
    }
    const data = await res.json();
    if (!data.access_token || !data.refresh_token) return null;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
    };
  } catch (err) {
    console.error('[auth] token_hash verification error:', err);
    return null;
  }
}

async function fetchUser() {
  if (!authSession) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${authSession.accessToken}`,
        'apikey': SUPABASE_ANON_KEY,
      },
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.id) return;
    authSession.userId = data.id;
    authSession.email = data.email || '';
    saveAuthSession(authSession);
  } catch { /* ignore */ }
}

async function refreshAccessToken() {
  if (!authSession || !authSession.refreshToken) {
    await clearAuthSession();
    return false;
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ refresh_token: authSession.refreshToken }),
    });
    if (!res.ok) { await clearAuthSession(); return false; }
    const data = await res.json();
    if (!data.access_token || !data.refresh_token) { await clearAuthSession(); return false; }
    authSession.accessToken = data.access_token;
    authSession.refreshToken = data.refresh_token;
    authSession.expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    saveAuthSession(authSession);
    return true;
  } catch {
    return false;
  }
}

async function ensureValidToken() {
  if (!authSession) return false;
  if (authSession.expiresAt && authSession.expiresAt - Date.now() < 5 * 60 * 1000) {
    return await refreshAccessToken();
  }
  return true;
}

function generateCodeVerifier() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

async function generateCodeChallenge(verifier) {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function getRedirectUrl() {
  const base = window.location.origin + window.location.pathname;
  // Trailing slash must match the Supabase Redirect URL exactly
  return base.endsWith('/') ? base : base + '/';
}

async function sendMagicLink(email) {
  const redirectTo = getRedirectUrl();
  const body = { email, create_user: true };

  // Use PKCE if crypto.subtle is available (requires secure context)
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      body.code_challenge = codeChallenge;
      body.code_challenge_method = 'S256';
      try { localStorage.setItem(PKCE_VERIFIER_KEY, codeVerifier); } catch { /* skip */ }
    } catch (err) {
      console.warn('[auth] PKCE setup failed, falling back to implicit flow:', err);
    }
  } else {
    console.warn('[auth] crypto.subtle unavailable (non-HTTPS?), using implicit flow');
  }

  // redirect_to must be a query param, not in the body — Supabase ignores it in the body
  const otpUrl = `${SUPABASE_URL}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`;
  const res = await fetch(otpUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error('[auth] OTP request failed:', res.status, errBody);
    try { localStorage.removeItem(PKCE_VERIFIER_KEY); } catch { /* skip */ }
  }
  return res.ok;
}

function renderLoginScreen(errorMsg) {
  const app = document.querySelector('main.app');
  app.innerHTML = '';

  const screen = el('div', { className: 'login-screen' });
  screen.appendChild(el('h1', { className: 'login-title', text: 'Planner' }));
  const formArea = el('div', { className: 'login-form-area' });

  formArea.appendChild(el('p', { className: 'login-subtitle', text: 'Sign in to sync across devices' }));

  const emailInput = el('input', { type: 'email', placeholder: 'your@email.com', autocomplete: 'email' });
  emailInput.setAttribute('aria-label', 'Email address');

  const sendBtn = el('button', { className: 'btn-primary', text: 'Send magic link' });
  const hint = el('p', { className: 'login-hint' });

  if (errorMsg) {
    hint.textContent = 'Sign-in link expired or was already used. Please request a new one.';
  }

  emailInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendBtn.click(); });

  sendBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    if (!email) { emailInput.focus(); return; }
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';
    hint.textContent = '';
    try {
      const ok = await sendMagicLink(email);
      if (ok) {
        formArea.innerHTML = '';
        const sentArea = el('div', { className: 'login-sent-area' });
        sentArea.appendChild(el('p', { className: 'login-subtitle', text: 'Check your email' }));
        sentArea.appendChild(el('p', { className: 'login-hint', text: `We sent a link to ${email}` }));
        formArea.appendChild(sentArea);
      } else {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send magic link';
        hint.textContent = 'Could not send link. Check the console for details.';
      }
    } catch (err) {
      console.error('[auth] sendMagicLink error:', err);
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send magic link';
      hint.textContent = 'Could not send link. Check the console for details.';
    }
  });

  const skipBtn = el('button', { className: 'btn-link', text: 'Use without sync' });
  skipBtn.addEventListener('click', () => {
    localStorage.setItem(LOCAL_ONLY_KEY, '1');
    startApp();
  });

  formArea.append(emailInput, sendBtn, hint, skipBtn);
  screen.appendChild(formArea);
  app.appendChild(screen);
}

async function pullFromServer() {
  if (!authSession || !authSession.userId) return;
  if (syncStatus === 'pending' || syncStatus === 'syncing') return;
  const valid = await ensureValidToken();
  if (!valid) return;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/user_data?user_id=eq.${authSession.userId}&select=items,updated_at`,
      {
        headers: {
          'Authorization': `Bearer ${authSession.accessToken}`,
          'apikey': SUPABASE_ANON_KEY,
        },
      }
    );
    if (!res.ok) return;
    const rows = await res.json();
    if (!rows || rows.length === 0) return;
    const row = rows[0];
    const serverUpdatedAt = new Date(row.updated_at).getTime();
    if (serverUpdatedAt <= lastSyncedAt) return;
    const serverItems = Array.isArray(row.items) ? row.items.map(validateItem).filter(Boolean) : [];
    items = serverItems;
    lastSyncedAt = serverUpdatedAt;
    cleanOrphanDependencies();
    saveItems(true); // don't push back what we just pulled
    render();
  } catch { /* silent fail */ }
}

async function pushToServer() {
  if (!authSession || !authSession.userId) return;
  syncStatus = 'syncing';
  renderSyncIndicator();

  const doRequest = async () => fetch(`${SUPABASE_URL}/rest/v1/user_data`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authSession.accessToken}`,
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      user_id: authSession.userId,
      items: items,
      updated_at: new Date().toISOString(),
    }),
  });

  try {
    let res = await doRequest();
    if (res.status === 401) {
      const refreshed = await ensureValidToken();
      if (!refreshed) return;
      res = await doRequest();
    }
    if (res.ok) {
      syncStatus = 'synced';
      lastSyncedAt = Date.now();
      renderSyncIndicator();
      setTimeout(() => {
        if (syncStatus === 'synced') { syncStatus = 'idle'; renderSyncIndicator(); }
      }, 3000);
    } else {
      syncStatus = 'error';
      renderSyncIndicator();
    }
  } catch {
    syncStatus = 'pending';
    renderSyncIndicator();
  }
}

function debouncedPush() {
  clearTimeout(syncTimer);
  syncStatus = 'pending';
  renderSyncIndicator();
  syncTimer = setTimeout(() => pushToServer(), 1500);
}

function renderSyncIndicator() {
  const indicator = document.getElementById('sync-indicator');
  if (!indicator) return;
  indicator.className = `sync-dot ${syncStatus}`;
  const labels = { idle: '', syncing: 'Syncing...', synced: 'Synced', error: 'Sync error', pending: 'Pending sync' };
  indicator.setAttribute('aria-label', labels[syncStatus] || '');
}

// === App Startup (shared between authed + local-only paths) ===
function startApp() {
  // Restore main app structure if login screen replaced it
  const app = document.querySelector('main.app');
  if (!document.getElementById('view-nav')) {
    app.innerHTML = `
      <header>
        <h1>Planner</h1>
        <div class="header-end">
          <span id="sync-indicator" class="sync-dot" role="status" aria-label=""></span>
          <span class="task-count" id="task-count" role="status" aria-live="polite"></span>
          <span id="header-actions"></span>
        </div>
      </header>
      <nav class="view-nav" id="view-nav" role="tablist" aria-label="Views"></nav>
      <div class="create-toggle" id="create-toggle"></div>
      <div id="create-form-container"></div>
      <div id="content" role="tabpanel"></div>
    `;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && authSession) pullFromServer();
  });

  const { items: loadedItems, toast } = loadItems();
  items = loadedItems;
  cleanOrphanDependencies();

  // Wire up delete dialog
  document.getElementById('delete-dialog-confirm').addEventListener('click', confirmDelete);
  document.getElementById('delete-dialog-cancel').addEventListener('click', cancelDelete);
  document.getElementById('delete-dialog').addEventListener('cancel', () => { pendingDeleteId = null; });
  document.getElementById('delete-dialog').addEventListener('close', () => {
    const mainEl = document.querySelector('main.app');
    if (mainEl) mainEl.inert = false;
  });

  // Ctrl+Z / Cmd+Z for undo
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      if (e.target.matches('input, textarea, select')) return;
      e.preventDefault();
      undo();
    }
    // ? — open GitHub repo
    if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.target.matches('input, textarea, select')) return;
      window.open('https://github.com/snackdriven/mise-en-place', '_blank', 'noopener,noreferrer');
    }
  });

  // Update countdowns every minute
  setInterval(() => {
    if (!editingId) render();
  }, 60_000);

  render();

  if (toast) {
    setTimeout(() => showToast(toast), 100);
  }

  if (authSession) pullFromServer();
}

// === Init ===
async function init() {
  authSession = loadAuthSession();

  // Check for Supabase auth errors in redirect URL
  const authError = extractRedirectError();
  if (authError) console.error('[auth] Redirect error from Supabase:', authError);

  const hashTokens = extractTokensFromHash();
  const pkceTokens = !hashTokens ? await exchangeCodeForTokens() : null;
  const tokenHashTokens = !hashTokens && !pkceTokens ? await exchangeTokenHash() : null;
  const tokens = hashTokens || pkceTokens || tokenHashTokens;
  if (tokens) {
    authSession = { ...tokens };
    saveAuthSession(authSession);
    await fetchUser();
  } else if (authSession && !authSession.userId) {
    // Session stored before userId was fetched — recover it
    await fetchUser();
    if (!authSession.userId) { authSession = null; try { localStorage.removeItem(AUTH_KEY); } catch { /* ok */ } }
  }

  const isLocalOnly = localStorage.getItem(LOCAL_ONLY_KEY) === '1';
  if (!authSession && !isLocalOnly) {
    renderLoginScreen(authError);
    return;
  }

  startApp();
}

init().catch(console.error);
