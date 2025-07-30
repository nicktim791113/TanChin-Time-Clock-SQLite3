// database.js
const Database = require('better-sqlite3');
let db = null;

function init(dbFilePath) {
  db = new Database(dbFilePath); 
  console.log('[資料庫] 魔法寶庫已在路徑開啟:', dbFilePath);

  // ✨ 魔法修正：確保所有資料表的欄位都已正確建立
  db.exec(`
    CREATE TABLE IF NOT EXISTS employees ( id TEXT PRIMARY KEY, name TEXT, gender TEXT, nationality TEXT, department TEXT, card TEXT UNIQUE, password TEXT );
    CREATE TABLE IF NOT EXISTS punch_records ( id TEXT, timestamp INTEGER, type TEXT, shift TEXT, status TEXT, source TEXT, PRIMARY KEY (id, timestamp) );
    CREATE TABLE IF NOT EXISTS shifts ( id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, start TEXT, end TEXT );
    CREATE TABLE IF NOT EXISTS greetings ( type TEXT, message TEXT );
    CREATE TABLE IF NOT EXISTS bell_schedules ( id TEXT PRIMARY KEY, title TEXT, time TEXT, days TEXT, sound TEXT, duration INTEGER, enabled INTEGER );
    CREATE TABLE IF NOT EXISTS bell_history ( timestamp INTEGER PRIMARY KEY, scheduleId TEXT, time TEXT, sound TEXT );
    CREATE TABLE IF NOT EXISTS custom_sounds ( id TEXT PRIMARY KEY, name TEXT, path TEXT );
    CREATE TABLE IF NOT EXISTS settings ( key TEXT PRIMARY KEY, value TEXT );
    CREATE TABLE IF NOT EXISTS special_effects ( id TEXT PRIMARY KEY, name TEXT, prefix TEXT, suffix TEXT, start_date TEXT, end_date TEXT, enabled INTEGER );
    CREATE TABLE IF NOT EXISTS theme_schedules ( id TEXT PRIMARY KEY, name TEXT, theme_name TEXT, start_date TEXT, end_date TEXT, enabled INTEGER );
    CREATE TABLE IF NOT EXISTS automation_tasks ( id TEXT PRIMARY KEY, frequency TEXT, day TEXT, time TEXT, task_type TEXT, target TEXT, enabled INTEGER );
    CREATE TABLE IF NOT EXISTS automation_log ( timestamp INTEGER PRIMARY KEY, message TEXT, status TEXT );
    CREATE TABLE IF NOT EXISTS custom_themes ( id TEXT PRIMARY KEY, name TEXT, styles TEXT );
  `);
  
  // --- 魔法加固區：自動升級寶庫結構 ---
  try {
    db.transaction(() => {
        const bellTableInfo = db.prepare("PRAGMA table_info(bell_schedules)").all();
        if (!bellTableInfo.some(col => col.name === 'title')) {
            console.log('[資料庫] 偵測到舊版 bell_schedules 結構，正在施展升級魔法...');
            run('ALTER TABLE bell_schedules ADD COLUMN title TEXT');
            run('ALTER TABLE bell_schedules ADD COLUMN duration INTEGER');
            console.log('[資料庫] bell_schedules 升級成功！');
        }

        const empTableInfo = db.prepare("PRAGMA table_info(employees)").all();
        const empColumns = empTableInfo.map(col => col.name);
        if (!empColumns.includes('birth_date')) {
            console.log('[資料庫] 偵測到舊版 employees 結構，正在施展升級魔法...');
            run('ALTER TABLE employees ADD COLUMN birth_date TEXT');
            run('ALTER TABLE employees ADD COLUMN hire_date TEXT');
            run('ALTER TABLE employees ADD COLUMN termination_date TEXT');
            run('ALTER TABLE employees ADD COLUMN notes TEXT');
            console.log('[資料庫] employees 升級成功！');
        }
    })();
  } catch(e) {
    console.error('[資料庫] 升級魔法失敗:', e.message);
  }

  console.log('[資料庫] 所有寶庫隔間 (資料表) 檢查與建立完畢！');
}

function run(sql, ...params) { return db.prepare(sql).run(...params); }
function get(sql, ...params) { return db.prepare(sql).get(...params); }
function all(sql, ...params) { return db.prepare(sql).all(...params); }

const saveEmployees = (employees) => {
    const insert = db.prepare('INSERT OR REPLACE INTO employees (id, name, gender, nationality, department, card, password, birth_date, hire_date, termination_date, notes) VALUES (@id, @name, @gender, @nationality, @department, @card, @password, @birth_date, @hire_date, @termination_date, @notes)');
    db.transaction(() => {
        run('DELETE FROM employees');
        for (const emp of employees) insert.run(emp);
    })();
};
const loadEmployees = () => all('SELECT * FROM employees ORDER BY id');
const deleteAllEmployees = () => run('DELETE FROM employees');

const addPunchRecord = (record) => run('INSERT INTO punch_records (id, timestamp, type, shift, status, source) VALUES (?, ?, ?, ?, ?, ?)', record.id, record.timestamp, record.type, record.shift, record.status, record.source);
const loadPunchRecords = () => all('SELECT * FROM punch_records ORDER BY timestamp DESC');
const deletePunchRecordsByDateRange = (startTime, endTime) => run('DELETE FROM punch_records WHERE timestamp >= ? AND timestamp <= ?', startTime, endTime);
const deletePunchRecordsBySource = (source) => run('DELETE FROM punch_records WHERE source = ?', source);

const saveShifts = (shifts) => {
    const insert = db.prepare('INSERT INTO shifts (name, start, end) VALUES (@name, @start, @end)');
    db.transaction(() => {
        run('DELETE FROM shifts');
        for (const shift of shifts) {
            if (shift.name && shift.start && shift.end) insert.run(shift);
        }
    })();
};
const loadShifts = () => all('SELECT * FROM shifts ORDER BY start');

const saveGreetings = (greetings) => {
    const insert = db.prepare('INSERT INTO greetings (type, message) VALUES (?, ?)');
    db.transaction(() => {
        run('DELETE FROM greetings');
        for (const type in greetings) {
            for (const msg of greetings[type]) insert.run(type, msg);
        }
    })();
};
const loadGreetings = () => {
    const rows = all('SELECT type, message FROM greetings');
    const greetings = { in: [], out: [] };
    for (const row of rows) {
        if (greetings[row.type]) {
            greetings[row.type].push(row.message);
        }
    }
    return greetings;
};

const saveBellSchedules = (schedules) => {
    const insert = db.prepare('INSERT OR REPLACE INTO bell_schedules (id, title, time, days, sound, duration, enabled) VALUES (@id, @title, @time, @days, @sound, @duration, @enabled)');
    db.transaction(() => {
        run('DELETE FROM bell_schedules');
        for (const schedule of schedules) {
            const scheduleForDb = { ...schedule, enabled: schedule.enabled ? 1 : 0 };
            insert.run(scheduleForDb);
        }
    })();
};
const loadBellSchedules = () => {
    const schedules = all('SELECT * FROM bell_schedules ORDER BY time');
    return schedules.map(s => ({ ...s, enabled: s.enabled === 1 }));
};

const addBellHistory = (record) => run('INSERT INTO bell_history (timestamp, scheduleId, time, sound) VALUES (?, ?, ?, ?)', record.timestamp, record.scheduleId, record.time, record.sound);
const loadBellHistory = () => all('SELECT * FROM bell_history ORDER BY timestamp DESC');
const clearBellHistory = () => run('DELETE FROM bell_history');

const saveCustomSounds = (sounds) => {
    const insert = db.prepare('INSERT OR REPLACE INTO custom_sounds (id, name, path) VALUES (@id, @name, @path)');
     db.transaction(() => {
        run('DELETE FROM custom_sounds');
        for (const sound of sounds) insert.run(sound);
    })();
};
const loadCustomSounds = () => all('SELECT * FROM custom_sounds');

const setSetting = (key, value) => run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, JSON.stringify(value));
const getSetting = (key) => {
    const row = get('SELECT value FROM settings WHERE key = ?', key);
    return row ? JSON.parse(row.value) : null;
};

const saveSpecialEffects = (effects) => {
    const insert = db.prepare('INSERT OR REPLACE INTO special_effects (id, name, prefix, suffix, start_date, end_date, enabled) VALUES (@id, @name, @prefix, @suffix, @start_date, @end_date, @enabled)');
    db.transaction(() => {
        run('DELETE FROM special_effects');
        for (const effect of effects) {
            const effectForDb = { ...effect, enabled: effect.enabled ? 1 : 0 };
            insert.run(effectForDb);
        }
    })();
};
const loadSpecialEffects = () => {
    const effects = all('SELECT * FROM special_effects ORDER BY start_date');
    return effects.map(e => ({ ...e, enabled: e.enabled === 1 }));
};

const saveThemeSchedules = (schedules) => {
    const insert = db.prepare('INSERT OR REPLACE INTO theme_schedules (id, name, theme_name, start_date, end_date, enabled) VALUES (@id, @name, @theme_name, @start_date, @end_date, @enabled)');
    db.transaction(() => {
        run('DELETE FROM theme_schedules');
        for (const schedule of schedules) {
            const scheduleForDb = { ...schedule, enabled: schedule.enabled ? 1 : 0 };
            insert.run(scheduleForDb);
        }
    })();
};
const loadThemeSchedules = () => {
    const schedules = all('SELECT * FROM theme_schedules ORDER BY start_date');
    return schedules.map(s => ({ ...s, enabled: s.enabled === 1 }));
};

// --- 魔法新增處 ---
const saveCustomThemes = (themes) => {
    const insert = db.prepare('INSERT OR REPLACE INTO custom_themes (id, name, styles) VALUES (@id, @name, @styles)');
    db.transaction(() => {
        run('DELETE FROM custom_themes');
        for (const theme of themes) {
            const themeForDb = { ...theme, styles: JSON.stringify(theme.styles) };
            insert.run(themeForDb);
        }
    })();
};
const loadCustomThemes = () => {
    const themes = all('SELECT * FROM custom_themes ORDER BY name');
    return themes.map(t => ({ ...t, styles: JSON.parse(t.styles) }));
};
// --- 魔法新增處 ---

const saveAutomationTasks = (tasks) => {
    const insert = db.prepare('INSERT OR REPLACE INTO automation_tasks (id, frequency, day, time, task_type, target, enabled) VALUES (@id, @frequency, @day, @time, @task_type, @target, @enabled)');
    db.transaction(() => {
        run('DELETE FROM automation_tasks');
        for (const task of tasks) {
            const taskForDb = { ...task, enabled: task.enabled ? 1 : 0 };
            insert.run(taskForDb);
        }
    })();
};
const loadAutomationTasks = () => {
    const tasks = all('SELECT * FROM automation_tasks ORDER BY time');
    return tasks.map(t => ({ ...t, enabled: t.enabled === 1 }));
};
const addAutomationLog = (record) => run('INSERT INTO automation_log (timestamp, message, status) VALUES (?, ?, ?)', record.timestamp, record.message, record.status);
const loadAutomationLog = () => all('SELECT * FROM automation_log ORDER BY timestamp DESC');
const clearAutomationLog = () => run('DELETE FROM automation_log');


module.exports = {
  init,
  saveEmployees, loadEmployees, deleteAllEmployees,
  addPunchRecord, loadPunchRecords,
  deletePunchRecordsByDateRange, deletePunchRecordsBySource,
  saveShifts, loadShifts,
  saveGreetings, loadGreetings,
  saveBellSchedules, loadBellSchedules,
  addBellHistory, loadBellHistory, clearBellHistory,
  saveCustomSounds, loadCustomSounds,
  setSetting, getSetting,
  saveSpecialEffects, loadSpecialEffects,
  saveThemeSchedules, loadThemeSchedules,
  // --- 魔法新增處 ---
  saveCustomThemes, loadCustomThemes,
  // --- 魔法新增處 ---
  saveAutomationTasks, loadAutomationTasks,
  addAutomationLog, loadAutomationLog, clearAutomationLog
};
