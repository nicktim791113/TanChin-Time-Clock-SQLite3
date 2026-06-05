// database.js
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
let db = null;
let currentDbFilePath = '';

function init(dbFilePath) {
  currentDbFilePath = path.resolve(dbFilePath);
  db = new Database(currentDbFilePath);
  console.log('[資料庫] 魔法寶庫已在路徑開啟:', dbFilePath);

  // ✨ 魔法修正：在 employees 資料表中新增 job_title 欄位
  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      name TEXT,
      gender TEXT,
      nationality TEXT,
      department TEXT,
      job_title TEXT,
      card TEXT UNIQUE,
      password TEXT,
      national_id TEXT,
      birth_date TEXT,
      hire_date TEXT,
      termination_date TEXT,
      notes TEXT,
      bank_account TEXT,
      mobile_phone TEXT,
      emergency_contact TEXT,
      emergency_phone TEXT,
      contact_address TEXT,
      registered_address TEXT,
      family_status TEXT
    );
    CREATE TABLE IF NOT EXISTS punch_records (
      id TEXT,
      timestamp INTEGER,
      type TEXT,
      shift TEXT,
      status TEXT,
      source TEXT,
      ip_address TEXT,
      user_agent TEXT,
      device_id TEXT,
      device_name TEXT,
      gps_lat REAL,
      gps_lng REAL,
      gps_accuracy REAL,
      gps_captured_at INTEGER,
      gps_status TEXT,
      risk_flags TEXT,
      PRIMARY KEY (id, timestamp)
    );
    CREATE TABLE IF NOT EXISTS shifts ( id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, start TEXT, end TEXT );
    CREATE TABLE IF NOT EXISTS greetings ( id TEXT PRIMARY KEY, type TEXT, message TEXT, employee_id TEXT );
    CREATE TABLE IF NOT EXISTS bell_schedules ( id TEXT PRIMARY KEY, title TEXT, time TEXT, days TEXT, sound TEXT, duration INTEGER, enabled INTEGER );
    CREATE TABLE IF NOT EXISTS bell_history ( timestamp INTEGER PRIMARY KEY, scheduleId TEXT, time TEXT, sound TEXT );
    CREATE TABLE IF NOT EXISTS custom_sounds ( id TEXT PRIMARY KEY, name TEXT, path TEXT );
    CREATE TABLE IF NOT EXISTS settings ( key TEXT PRIMARY KEY, value TEXT );
    CREATE TABLE IF NOT EXISTS external_api_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      key_suffix TEXT,
      permissions TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_used_at INTEGER,
      last_used_ip TEXT
    );
    CREATE TABLE IF NOT EXISTS account_access (
      employee_id TEXT PRIMARY KEY,
      allowed_roles TEXT NOT NULL DEFAULT '["employee"]',
      admin_preset TEXT NOT NULL DEFAULT 'none',
      admin_permissions TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER,
      updated_by TEXT
    );
    CREATE TABLE IF NOT EXISTS workspace_nav_order (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      nav_type TEXT NOT NULL DEFAULT 'main',
      scope TEXT NOT NULL DEFAULT 'global',
      employee_id TEXT NOT NULL DEFAULT '',
      order_json TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER,
      updated_by TEXT,
      UNIQUE(role, nav_type, scope, employee_id)
    );
    CREATE TABLE IF NOT EXISTS special_effects ( id TEXT PRIMARY KEY, name TEXT, prefix TEXT, suffix TEXT, start_date TEXT, end_date TEXT, enabled INTEGER );
    CREATE TABLE IF NOT EXISTS theme_schedules ( id TEXT PRIMARY KEY, name TEXT, theme_name TEXT, start_date TEXT, end_date TEXT, enabled INTEGER );
    CREATE TABLE IF NOT EXISTS automation_tasks ( id TEXT PRIMARY KEY, frequency TEXT, day TEXT, time TEXT, task_type TEXT, target TEXT, export_template TEXT, export_directory TEXT, enabled INTEGER );
    CREATE TABLE IF NOT EXISTS automation_log ( timestamp INTEGER PRIMARY KEY, message TEXT, status TEXT );
    CREATE TABLE IF NOT EXISTS custom_themes ( id TEXT PRIMARY KEY, name TEXT, styles TEXT );
    CREATE TABLE IF NOT EXISTS leave_types (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      unit TEXT,
      requires_attachment INTEGER NOT NULL DEFAULT 0,
      deducts_balance INTEGER NOT NULL DEFAULT 0,
      paid INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      display_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS leave_approval_routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department TEXT NOT NULL UNIQUE,
      supervisor_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS leave_requests (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      leave_type_id TEXT NOT NULL,
      start_at INTEGER NOT NULL,
      end_at INTEGER NOT NULL,
      duration_hours REAL NOT NULL DEFAULT 0,
      reason TEXT,
      status TEXT NOT NULL,
      supervisor_id TEXT,
      supervisor_decision TEXT,
      supervisor_comment TEXT,
      supervisor_decided_at INTEGER,
      admin_decision_by TEXT,
      admin_comment TEXT,
      admin_decided_at INTEGER,
      approval_mode TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      withdrawn_at INTEGER,
      cancelled_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS leave_approval_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL,
      step_order INTEGER NOT NULL,
      reviewer_role TEXT NOT NULL,
      reviewer_id TEXT,
      status TEXT NOT NULL,
      comment TEXT,
      decided_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS overtime_requests (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      applicant_id TEXT NOT NULL,
      applicant_role TEXT,
      start_at INTEGER NOT NULL,
      end_at INTEGER NOT NULL,
      duration_hours REAL NOT NULL DEFAULT 0,
      reason TEXT,
      status TEXT NOT NULL,
      supervisor_id TEXT,
      supervisor_decision TEXT,
      supervisor_comment TEXT,
      supervisor_decided_at INTEGER,
      approval_mode TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      withdrawn_at INTEGER,
      cancelled_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS overtime_approval_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL,
      step_order INTEGER NOT NULL,
      reviewer_role TEXT NOT NULL,
      reviewer_id TEXT,
      status TEXT NOT NULL,
      comment TEXT,
      decided_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS employee_devices (
      employee_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      device_name TEXT,
      device_token_hash TEXT,
      platform TEXT,
      user_agent TEXT,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      last_ip TEXT,
      last_gps_lat REAL,
      last_gps_lng REAL,
      last_gps_accuracy REAL,
      last_gps_at INTEGER,
      status TEXT,
      PRIMARY KEY (employee_id, device_id)
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      actor_id TEXT,
      actor_name TEXT,
      role TEXT,
      channel TEXT,
      action TEXT,
      target_type TEXT,
      target_id TEXT,
      summary TEXT,
      before_json TEXT,
      after_json TEXT,
      success INTEGER NOT NULL DEFAULT 1,
      ip_address TEXT,
      session_token_suffix TEXT
    );
    CREATE TABLE IF NOT EXISTS audit_archives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER NOT NULL,
      archive_batch_id TEXT,
      source_table TEXT NOT NULL,
      archive_month TEXT,
      start_timestamp INTEGER,
      end_timestamp INTEGER,
      record_count INTEGER NOT NULL DEFAULT 0,
      file_path TEXT NOT NULL,
      checksum TEXT,
      retention_days INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs (timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs (actor_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_target_type ON audit_logs (target_type);
    CREATE INDEX IF NOT EXISTS idx_audit_archives_created_at ON audit_archives (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_archives_month ON audit_archives (archive_month);
    CREATE INDEX IF NOT EXISTS idx_external_api_keys_hash ON external_api_keys (key_hash);
    CREATE INDEX IF NOT EXISTS idx_external_api_keys_enabled ON external_api_keys (enabled);
    CREATE INDEX IF NOT EXISTS idx_external_api_keys_last_used_at ON external_api_keys (last_used_at DESC);
    CREATE INDEX IF NOT EXISTS idx_employee_devices_employee_id ON employee_devices (employee_id);
    CREATE INDEX IF NOT EXISTS idx_employee_devices_last_seen_at ON employee_devices (last_seen_at DESC);
    CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_id ON leave_requests (employee_id);
    CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests (status);
    CREATE INDEX IF NOT EXISTS idx_leave_requests_supervisor_id ON leave_requests (supervisor_id);
    CREATE INDEX IF NOT EXISTS idx_leave_requests_start_at ON leave_requests (start_at);
    CREATE INDEX IF NOT EXISTS idx_leave_approval_steps_request_id ON leave_approval_steps (request_id);
    CREATE INDEX IF NOT EXISTS idx_overtime_requests_employee_id ON overtime_requests (employee_id);
    CREATE INDEX IF NOT EXISTS idx_overtime_requests_applicant_id ON overtime_requests (applicant_id);
    CREATE INDEX IF NOT EXISTS idx_overtime_requests_status ON overtime_requests (status);
    CREATE INDEX IF NOT EXISTS idx_overtime_requests_supervisor_id ON overtime_requests (supervisor_id);
    CREATE INDEX IF NOT EXISTS idx_overtime_requests_start_at ON overtime_requests (start_at);
    CREATE INDEX IF NOT EXISTS idx_overtime_approval_steps_request_id ON overtime_approval_steps (request_id);
    CREATE INDEX IF NOT EXISTS idx_account_access_updated_at ON account_access (updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_workspace_nav_order_scope ON workspace_nav_order (role, nav_type, scope, employee_id);
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
        const employeeColumnDefinitions = [
            ['national_id', 'national_id TEXT'],
            ['birth_date', 'birth_date TEXT'],
            ['hire_date', 'hire_date TEXT'],
            ['termination_date', 'termination_date TEXT'],
            ['notes', 'notes TEXT'],
            ['bank_account', 'bank_account TEXT'],
            ['mobile_phone', 'mobile_phone TEXT'],
            ['emergency_contact', 'emergency_contact TEXT'],
            ['emergency_phone', 'emergency_phone TEXT'],
            ['contact_address', 'contact_address TEXT'],
            ['registered_address', 'registered_address TEXT'],
            ['family_status', 'family_status TEXT']
        ];
        const missingEmployeeColumns = employeeColumnDefinitions.filter(([columnName]) => !empColumns.includes(columnName));
        if (missingEmployeeColumns.length) {
            console.log('[資料庫] 偵測到舊版 employees 結構，正在施展升級魔法...');
            for (const [, columnDefinition] of missingEmployeeColumns) {
                run(`ALTER TABLE employees ADD COLUMN ${columnDefinition}`);
            }
            console.log('[資料庫] employees 升級成功！');
        }
        
        // ✨ 魔法新增：檢查並升級 employees 資料表，加入 job_title
        if (!empColumns.includes('job_title')) {
            console.log('[資料庫] 偵測到舊版 employees 結構，正在為其加上「職稱」欄位...');
            run('ALTER TABLE employees ADD COLUMN job_title TEXT');
            console.log('[資料庫] employees 的 job_title 升級成功！');
        }

        const greetingsTableInfo = db.prepare("PRAGMA table_info(greetings)").all();
        const greetingsColumns = greetingsTableInfo.map(col => col.name);
        if (!greetingsColumns.includes('employee_id')) {
            console.log('[資料庫] 偵測到舊版 greetings 結構，正在施展升級魔法...');
            const oldGreetings = all('SELECT type, message FROM greetings');
            run('DROP TABLE greetings');
            run('CREATE TABLE greetings ( id TEXT PRIMARY KEY, type TEXT, message TEXT, employee_id TEXT )');
            const insert = db.prepare('INSERT INTO greetings (id, type, message, employee_id) VALUES (?, ?, ?, ?)');
            let i = 0;
            for (const greeting of oldGreetings) {
                insert.run(`greeting_${Date.now()}_${i++}`, greeting.type, greeting.message, null);
            }
            console.log('[資料庫] greetings 升級成功！');
        }
        const automationTableInfo = db.prepare("PRAGMA table_info(automation_tasks)").all();
        const automationColumns = automationTableInfo.map(col => col.name);
        if (!automationColumns.includes('export_template')) {
            console.log('[資料庫精靈] 正在為 automation_tasks 補上 export_template 欄位...');
            run('ALTER TABLE automation_tasks ADD COLUMN export_template TEXT');
            console.log('[資料庫精靈] automation_tasks 已升級完成！');
        }
        if (!automationColumns.includes('export_directory')) {
            console.log('[鞈?摨怎移? 甇???automation_tasks 鋆? export_directory 甈?...');
            run('ALTER TABLE automation_tasks ADD COLUMN export_directory TEXT');
            console.log('[鞈?摨怎移? automation_tasks export_directory 撌脣?蝝???');
        }
        const punchTableInfo = db.prepare("PRAGMA table_info(punch_records)").all();
        const punchColumns = punchTableInfo.map(col => col.name);
        const punchColumnDefinitions = [
            ['ip_address', 'ip_address TEXT'],
            ['user_agent', 'user_agent TEXT'],
            ['device_id', 'device_id TEXT'],
            ['device_name', 'device_name TEXT'],
            ['gps_lat', 'gps_lat REAL'],
            ['gps_lng', 'gps_lng REAL'],
            ['gps_accuracy', 'gps_accuracy REAL'],
            ['gps_captured_at', 'gps_captured_at INTEGER'],
            ['gps_status', 'gps_status TEXT'],
            ['risk_flags', 'risk_flags TEXT']
        ];
        const missingPunchColumns = punchColumnDefinitions.filter(([columnName]) => !punchColumns.includes(columnName));
        if (missingPunchColumns.length) {
            console.log('[資料庫] 偵測到舊版 punch_records 結構，正在補上遠端打卡安全欄位...');
            for (const [, columnDefinition] of missingPunchColumns) {
                run(`ALTER TABLE punch_records ADD COLUMN ${columnDefinition}`);
            }
            console.log('[資料庫] punch_records 安全欄位升級成功！');
        }

        const leaveRequestTableInfo = db.prepare("PRAGMA table_info(leave_requests)").all();
        const leaveRequestColumns = leaveRequestTableInfo.map(col => col.name);
        if (!leaveRequestColumns.includes('approval_mode')) {
            console.log('[資料庫] 偵測到舊版 leave_requests 結構，正在補上 approval_mode 欄位...');
            run('ALTER TABLE leave_requests ADD COLUMN approval_mode TEXT');
            console.log('[資料庫] leave_requests approval_mode 升級成功！');
        }

        const overtimeRequestTableInfo = db.prepare("PRAGMA table_info(overtime_requests)").all();
        const overtimeRequestColumns = overtimeRequestTableInfo.map(col => col.name);
        if (!overtimeRequestColumns.includes('approval_mode')) {
            console.log('[資料庫] 偵測到舊版 overtime_requests 結構，正在補上 approval_mode 欄位...');
            run('ALTER TABLE overtime_requests ADD COLUMN approval_mode TEXT');
            console.log('[資料庫] overtime_requests approval_mode 升級成功！');
        }

        const employeeDevicesTableInfo = db.prepare("PRAGMA table_info(employee_devices)").all();
        const employeeDeviceColumns = employeeDevicesTableInfo.map(col => col.name);
        const employeeDeviceDefinitions = [
            ['device_token_hash', 'device_token_hash TEXT'],
            ['platform', 'platform TEXT'],
            ['user_agent', 'user_agent TEXT'],
            ['created_at', 'created_at INTEGER'],
            ['last_seen_at', 'last_seen_at INTEGER'],
            ['last_ip', 'last_ip TEXT'],
            ['last_gps_lat', 'last_gps_lat REAL'],
            ['last_gps_lng', 'last_gps_lng REAL'],
            ['last_gps_accuracy', 'last_gps_accuracy REAL'],
            ['last_gps_at', 'last_gps_at INTEGER'],
            ['status', 'status TEXT']
        ];
        const missingEmployeeDeviceColumns = employeeDeviceDefinitions.filter(([columnName]) => !employeeDeviceColumns.includes(columnName));
        if (missingEmployeeDeviceColumns.length) {
            console.log('[資料庫] 偵測到舊版 employee_devices 結構，正在補上裝置綁定欄位...');
            for (const [, columnDefinition] of missingEmployeeDeviceColumns) {
                run(`ALTER TABLE employee_devices ADD COLUMN ${columnDefinition}`);
            }
            console.log('[資料庫] employee_devices 升級成功！');
        }
    })();
  } catch(e) {
    console.error('[資料庫] 升級魔法失敗:', e.message);
  }

  console.log('[資料庫] 所有寶庫隔間 (資料表) 檢查與建立完畢！');
  seedDefaultLeaveTypes();
}

function run(sql, ...params) { return db.prepare(sql).run(...params); }
function get(sql, ...params) { return db.prepare(sql).get(...params); }
function all(sql, ...params) { return db.prepare(sql).all(...params); }

function getDatabasePath() {
    return currentDbFilePath;
}

function ensureDatabaseOpen() {
    if (!db || !db.open) {
        throw new Error('資料庫尚未開啟，無法執行備份或還原。');
    }
}

async function backupDatabase(destinationFilePath) {
    ensureDatabaseOpen();
    const destinationText = String(destinationFilePath || '').trim();
    if (!destinationText) {
        throw new Error('請提供資料庫備份檔案路徑。');
    }
    const resolvedDestination = path.resolve(destinationText);
    fs.mkdirSync(path.dirname(resolvedDestination), { recursive: true });
    await db.backup(resolvedDestination);
    const stat = fs.statSync(resolvedDestination);
    return {
        filePath: resolvedDestination,
        sizeBytes: stat.size
    };
}

function validateBackupDatabaseFile(sourceFilePath) {
    const sourceText = String(sourceFilePath || '').trim();
    if (!sourceText) {
        throw new Error('請提供要還原的資料庫備份檔案。');
    }
    const resolvedSource = path.resolve(sourceText);
    if (!fs.existsSync(resolvedSource)) {
        throw new Error(`找不到要還原的資料庫備份檔：${resolvedSource}`);
    }
    if (!fs.statSync(resolvedSource).isFile()) {
        throw new Error('要還原的路徑不是資料庫備份檔案。');
    }

    const candidate = new Database(resolvedSource, { readonly: true, fileMustExist: true });
    try {
        const quickCheck = candidate.pragma('quick_check');
        const quickCheckValue = Array.isArray(quickCheck)
            ? String(Object.values(quickCheck[0] || {})[0] || '')
            : String(quickCheck || '');
        if (quickCheckValue.toLowerCase() !== 'ok') {
            throw new Error(`SQLite quick_check 未通過：${quickCheckValue || 'unknown'}`);
        }
        const employeesTable = candidate.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'employees'"
        ).get();
        const settingsTable = candidate.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settings'"
        ).get();
        if (!employeesTable || !settingsTable) {
            throw new Error('備份檔缺少必要資料表，已停止還原。');
        }
    } finally {
        candidate.close();
    }
    return { filePath: resolvedSource };
}

async function replaceDatabaseFromBackup(sourceFilePath, options = {}) {
    const { filePath: resolvedSource } = validateBackupDatabaseFile(sourceFilePath);
    const targetPath = currentDbFilePath;
    if (!targetPath) {
        throw new Error('目前資料庫路徑不存在，無法執行還原。');
    }
    if (path.resolve(resolvedSource).toLowerCase() === path.resolve(targetPath).toLowerCase()) {
        throw new Error('還原來源不可直接指向目前正在使用的資料庫檔。');
    }

    const emergencyBackupPath = String(options.emergencyBackupPath || '').trim();
    const emergencyBackup = emergencyBackupPath
        ? await backupDatabase(emergencyBackupPath)
        : null;

    try {
        if (db?.open) {
            db.close();
        }
        db = null;
        fs.copyFileSync(resolvedSource, targetPath);
        for (const suffix of ['-wal', '-shm']) {
            const sidecarPath = `${targetPath}${suffix}`;
            if (fs.existsSync(sidecarPath)) {
                fs.unlinkSync(sidecarPath);
            }
        }
        init(targetPath);
        return {
            restoredPath: targetPath,
            sourcePath: resolvedSource,
            emergencyBackup
        };
    } catch (error) {
        if (emergencyBackup?.filePath && fs.existsSync(emergencyBackup.filePath)) {
            try {
                fs.copyFileSync(emergencyBackup.filePath, targetPath);
            } catch (rollbackError) {
                error.rollbackError = rollbackError.message;
            }
        }
        if (!db?.open) {
            init(targetPath);
        }
        throw error;
    }
}

const EMPLOYEE_TEXT_FIELDS = [
    'id', 'name', 'gender', 'nationality', 'department', 'job_title', 'card', 'password',
    'national_id', 'birth_date', 'hire_date', 'termination_date', 'notes',
    'bank_account', 'mobile_phone', 'emergency_contact', 'emergency_phone',
    'contact_address', 'registered_address', 'family_status'
];

function normalizeEmployeeForStorage(employee = {}) {
    const normalizedEmployee = {};
    for (const field of EMPLOYEE_TEXT_FIELDS) {
        normalizedEmployee[field] = String(employee[field] ?? '').trim();
    }
    return normalizedEmployee;
}

// ✨ 魔法修正：更新儲存員工資料的 SQL 語句
const saveEmployees = (employees) => {
    const insert = db.prepare(`
        INSERT OR REPLACE INTO employees (
            id, name, gender, nationality, department, job_title, card, password,
            national_id,
            birth_date, hire_date, termination_date, notes,
            bank_account, mobile_phone, emergency_contact, emergency_phone,
            contact_address, registered_address, family_status
        ) VALUES (
            @id, @name, @gender, @nationality, @department, @job_title, @card, @password,
            @national_id,
            @birth_date, @hire_date, @termination_date, @notes,
            @bank_account, @mobile_phone, @emergency_contact, @emergency_phone,
            @contact_address, @registered_address, @family_status
        )
    `);
    db.transaction(() => {
        run('DELETE FROM employees');
        for (const emp of employees) insert.run(normalizeEmployeeForStorage(emp));
    })();
};
const loadEmployees = () => all('SELECT * FROM employees ORDER BY id');
const deleteAllEmployees = () => run('DELETE FROM employees');

function safeParseJsonValue(value) {
    if (value == null || value === '') return null;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

const DEFAULT_LEAVE_TYPES = [
    { id: 'personal', name: '事假', description: '一般私人事務請假。', unit: 'hour', requires_attachment: false, deducts_balance: false, paid: false, enabled: true, display_order: 10 },
    { id: 'annual', name: '特休', description: '年度特別休假，第一版先以人工額度控管為主。', unit: 'hour', requires_attachment: false, deducts_balance: true, paid: true, enabled: true, display_order: 20 },
    { id: 'sick', name: '病假', description: '因疾病或健康因素請假，可依公司規則要求附件。', unit: 'hour', requires_attachment: false, deducts_balance: false, paid: false, enabled: true, display_order: 30 },
    { id: 'marriage', name: '婚假', description: '婚假，可依公司與法規規則調整。', unit: 'day', requires_attachment: false, deducts_balance: false, paid: true, enabled: true, display_order: 40 },
    { id: 'bereavement', name: '喪假', description: '喪假，可依親等與公司規則調整。', unit: 'day', requires_attachment: false, deducts_balance: false, paid: true, enabled: true, display_order: 50 },
    { id: 'official', name: '公假', description: '公務或法定公假。', unit: 'hour', requires_attachment: false, deducts_balance: false, paid: true, enabled: true, display_order: 60 },
    { id: 'other', name: '其他', description: '保留給臨時或公司自訂假別。', unit: 'hour', requires_attachment: false, deducts_balance: false, paid: false, enabled: true, display_order: 99 }
];

function normalizeBooleanForDb(value) {
    return value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0;
}

function normalizeLeaveTypeForStorage(type = {}) {
    const id = String(type.id || type.name || `leave_${Date.now()}`).trim();
    return {
        id,
        name: String(type.name || id).trim(),
        description: String(type.description || '').trim(),
        unit: String(type.unit || 'hour').trim(),
        requires_attachment: normalizeBooleanForDb(type.requires_attachment ?? type.requiresAttachment),
        deducts_balance: normalizeBooleanForDb(type.deducts_balance ?? type.deductsBalance),
        paid: normalizeBooleanForDb(type.paid),
        enabled: type.enabled === false || type.enabled === 0 || type.enabled === '0' || type.enabled === 'false' ? 0 : 1,
        display_order: Number(type.display_order ?? type.displayOrder ?? 0) || 0
    };
}

function mapLeaveTypeRow(row) {
    return {
        ...row,
        requires_attachment: row.requires_attachment === 1,
        requiresAttachment: row.requires_attachment === 1,
        deducts_balance: row.deducts_balance === 1,
        deductsBalance: row.deducts_balance === 1,
        paid: row.paid === 1,
        enabled: row.enabled === 1
    };
}

function seedDefaultLeaveTypes() {
    const row = get('SELECT COUNT(*) AS total FROM leave_types');
    if (Number(row?.total || 0) > 0) return;
    const insert = db.prepare(`
        INSERT INTO leave_types (
            id, name, description, unit, requires_attachment,
            deducts_balance, paid, enabled, display_order
        ) VALUES (
            @id, @name, @description, @unit, @requires_attachment,
            @deducts_balance, @paid, @enabled, @display_order
        )
    `);
    db.transaction(() => {
        for (const type of DEFAULT_LEAVE_TYPES) {
            insert.run(normalizeLeaveTypeForStorage(type));
        }
    })();
}

const loadLeaveTypes = () => all('SELECT * FROM leave_types ORDER BY display_order, name').map(mapLeaveTypeRow);

const saveLeaveTypes = (types = []) => {
    const insert = db.prepare(`
        INSERT OR REPLACE INTO leave_types (
            id, name, description, unit, requires_attachment,
            deducts_balance, paid, enabled, display_order
        ) VALUES (
            @id, @name, @description, @unit, @requires_attachment,
            @deducts_balance, @paid, @enabled, @display_order
        )
    `);
    db.transaction(() => {
        run('DELETE FROM leave_types');
        for (const type of types) {
            const normalized = normalizeLeaveTypeForStorage(type);
            if (normalized.id && normalized.name) insert.run(normalized);
        }
    })();
};

function normalizeLeaveApprovalRouteForStorage(route = {}) {
    return {
        id: Number(route.id) || null,
        department: String(route.department || '').trim(),
        supervisor_id: String(route.supervisor_id ?? route.supervisorId ?? '').trim(),
        enabled: route.enabled === false || route.enabled === 0 || route.enabled === '0' || route.enabled === 'false' ? 0 : 1
    };
}

function mapLeaveApprovalRouteRow(row) {
    return {
        ...row,
        supervisorId: row.supervisor_id,
        enabled: row.enabled === 1
    };
}

const loadLeaveApprovalRoutes = () => all('SELECT * FROM leave_approval_routes ORDER BY department').map(mapLeaveApprovalRouteRow);

const saveLeaveApprovalRoutes = (routes = []) => {
    const insert = db.prepare(`
        INSERT OR REPLACE INTO leave_approval_routes (id, department, supervisor_id, enabled)
        VALUES (@id, @department, @supervisor_id, @enabled)
    `);
    db.transaction(() => {
        run('DELETE FROM leave_approval_routes');
        for (const route of routes) {
            const normalized = normalizeLeaveApprovalRouteForStorage(route);
            if (normalized.department && normalized.supervisor_id) insert.run(normalized);
        }
    })();
};

function mapLeaveRequestRow(row) {
    return {
        ...row,
        duration_hours: Number(row.duration_hours || 0)
    };
}

const createLeaveRequest = (request) => {
    const insertRequest = db.prepare(`
        INSERT INTO leave_requests (
            id, employee_id, leave_type_id, start_at, end_at, duration_hours,
            reason, status, supervisor_id, supervisor_decision, supervisor_comment,
            supervisor_decided_at, admin_decision_by, admin_comment, admin_decided_at,
            approval_mode, created_at, updated_at
        ) VALUES (
            @id, @employee_id, @leave_type_id, @start_at, @end_at, @duration_hours,
            @reason, @status, @supervisor_id, @supervisor_decision, @supervisor_comment,
            @supervisor_decided_at, @admin_decision_by, @admin_comment, @admin_decided_at,
            @approval_mode, @created_at, @updated_at
        )
    `);
    const insertStep = db.prepare(`
        INSERT INTO leave_approval_steps (
            request_id, step_order, reviewer_role, reviewer_id, status, comment,
            decided_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const isApproved = request.status === 'approved';
    const requestForDb = {
        ...request,
        supervisor_decision: request.supervisor_decision || null,
        supervisor_comment: request.supervisor_comment || null,
        supervisor_decided_at: request.supervisor_decided_at || null,
        admin_decision_by: request.admin_decision_by || null,
        admin_comment: request.admin_comment || null,
        admin_decided_at: request.admin_decided_at || null,
        approval_mode: request.approval_mode || 'employee_request'
    };
    db.transaction(() => {
        insertRequest.run(requestForDb);
        insertStep.run(
            request.id,
            1,
            'supervisor',
            request.supervisor_id || null,
            isApproved ? 'approved' : 'pending',
            isApproved ? (request.supervisor_comment || '紙本核准補登') : null,
            isApproved ? (request.supervisor_decided_at || request.created_at) : null,
            request.created_at
        );
        insertStep.run(
            request.id,
            2,
            'admin',
            request.admin_decision_by || null,
            isApproved ? 'approved' : 'waiting',
            isApproved ? (request.admin_comment || '管理者紙本核准補登') : null,
            isApproved ? (request.admin_decided_at || request.created_at) : null,
            request.created_at
        );
    })();
};

const getLeaveRequestById = (requestId) => {
    const row = get('SELECT * FROM leave_requests WHERE id = ?', requestId);
    return row ? mapLeaveRequestRow(row) : null;
};

const queryLeaveRequests = (filters = {}) => {
    const clauses = [];
    const params = [];
    if (filters.employeeId) {
        clauses.push('employee_id = ?');
        params.push(String(filters.employeeId));
    }
    if (filters.supervisorId) {
        clauses.push('supervisor_id = ?');
        params.push(String(filters.supervisorId));
    }
    if (filters.status) {
        if (Array.isArray(filters.status)) {
            const values = filters.status.map((value) => String(value || '').trim()).filter(Boolean);
            if (values.length) {
                clauses.push(`status IN (${values.map(() => '?').join(',')})`);
                params.push(...values);
            }
        } else {
            clauses.push('status = ?');
            params.push(String(filters.status));
        }
    }
    if (filters.overlapStartAt !== undefined && filters.overlapEndAt !== undefined) {
        clauses.push('start_at <= ? AND end_at > ?');
        params.push(Number(filters.overlapEndAt) || 0, Number(filters.overlapStartAt) || 0);
    }
    const shouldLimit = filters.limit !== null && filters.limit !== false && filters.limit !== 'all';
    const maxLimit = Math.max(1, Number(filters.maxLimit) || 500);
    const limit = shouldLimit ? Math.max(1, Math.min(Number(filters.limit) || 100, maxLimit)) : null;
    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const limitSql = shouldLimit ? ' LIMIT ?' : '';
    const queryParams = shouldLimit ? [...params, limit] : params;
    return all(`SELECT * FROM leave_requests ${whereSql} ORDER BY created_at DESC${limitSql}`, ...queryParams).map(mapLeaveRequestRow);
};

const hasOverlappingLeaveRequest = (employeeId, startAt, endAt, excludeId = '') => {
    const rows = all(
        `SELECT id FROM leave_requests
         WHERE employee_id = ?
           AND status IN ('pending_supervisor', 'pending_admin', 'approved')
           AND start_at < ?
           AND end_at > ?`,
        employeeId,
        Number(endAt) || 0,
        Number(startAt) || 0
    );
    return rows.some((row) => row.id !== excludeId);
};

const updateLeaveRequestSupervisorDecision = ({ requestId, decision, comment, decidedAt }) => {
    const nextStatus = decision === 'approved' ? 'pending_admin' : 'rejected';
    db.transaction(() => {
        run(
            `UPDATE leave_requests
             SET status = ?, supervisor_decision = ?, supervisor_comment = ?,
                 supervisor_decided_at = ?, updated_at = ?
             WHERE id = ?`,
            nextStatus,
            decision,
            comment || '',
            decidedAt,
            decidedAt,
            requestId
        );
        run(
            `UPDATE leave_approval_steps
             SET status = ?, comment = ?, decided_at = ?
             WHERE request_id = ? AND reviewer_role = 'supervisor'`,
            decision,
            comment || '',
            decidedAt,
            requestId
        );
        run(
            `UPDATE leave_approval_steps
             SET status = ?
             WHERE request_id = ? AND reviewer_role = 'admin'`,
            decision === 'approved' ? 'pending' : 'cancelled',
            requestId
        );
    })();
};

const updateLeaveRequestAdminDecision = ({ requestId, decision, adminId, comment, decidedAt }) => {
    const nextStatus = decision === 'approved' ? 'approved' : 'rejected';
    db.transaction(() => {
        run(
            `UPDATE leave_requests
             SET status = ?, admin_decision_by = ?, admin_comment = ?,
                 admin_decided_at = ?, updated_at = ?
             WHERE id = ?`,
            nextStatus,
            adminId || '',
            comment || '',
            decidedAt,
            decidedAt,
            requestId
        );
        run(
            `UPDATE leave_approval_steps
             SET reviewer_id = ?, status = ?, comment = ?, decided_at = ?
             WHERE request_id = ? AND reviewer_role = 'admin'`,
            adminId || '',
            decision,
            comment || '',
            decidedAt,
            requestId
        );
    })();
};

const withdrawLeaveRequest = ({ requestId, withdrawnAt }) => run(
    `UPDATE leave_requests
     SET status = 'withdrawn', withdrawn_at = ?, updated_at = ?
     WHERE id = ?`,
    withdrawnAt,
    withdrawnAt,
    requestId
);

function mapOvertimeRequestRow(row) {
    return {
        ...row,
        duration_hours: Number(row.duration_hours || 0)
    };
}

const createOvertimeRequest = (request) => {
    const insertRequest = db.prepare(`
        INSERT INTO overtime_requests (
            id, employee_id, applicant_id, applicant_role, start_at, end_at,
            duration_hours, reason, status, supervisor_id, supervisor_decision,
            supervisor_comment, supervisor_decided_at, approval_mode, created_at,
            updated_at
        ) VALUES (
            @id, @employee_id, @applicant_id, @applicant_role, @start_at, @end_at,
            @duration_hours, @reason, @status, @supervisor_id, @supervisor_decision,
            @supervisor_comment, @supervisor_decided_at, @approval_mode, @created_at,
            @updated_at
        )
    `);
    const insertStep = db.prepare(`
        INSERT INTO overtime_approval_steps (
            request_id, step_order, reviewer_role, reviewer_id, status, comment,
            decided_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const isAutoApproved = request.status === 'approved';
    db.transaction(() => {
        insertRequest.run({
            ...request,
            supervisor_decision: request.supervisor_decision || null,
            supervisor_comment: request.supervisor_comment || null,
            supervisor_decided_at: request.supervisor_decided_at || null
        });
        insertStep.run(
            request.id,
            1,
            'supervisor',
            request.supervisor_id || null,
            isAutoApproved ? 'approved' : 'pending',
            isAutoApproved ? (request.supervisor_comment || '主管代申請自動核准') : null,
            isAutoApproved ? (request.supervisor_decided_at || request.created_at) : null,
            request.created_at
        );
    })();
};

const getOvertimeRequestById = (requestId) => {
    const row = get('SELECT * FROM overtime_requests WHERE id = ?', requestId);
    return row ? mapOvertimeRequestRow(row) : null;
};

const queryOvertimeRequests = (filters = {}) => {
    const clauses = [];
    const params = [];
    if (filters.employeeId) {
        clauses.push('employee_id = ?');
        params.push(String(filters.employeeId));
    }
    if (filters.applicantId) {
        clauses.push('applicant_id = ?');
        params.push(String(filters.applicantId));
    }
    if (filters.employeeOrApplicantId) {
        clauses.push('(employee_id = ? OR applicant_id = ?)');
        params.push(String(filters.employeeOrApplicantId), String(filters.employeeOrApplicantId));
    }
    if (filters.supervisorId) {
        clauses.push('supervisor_id = ?');
        params.push(String(filters.supervisorId));
    }
    if (filters.status) {
        if (Array.isArray(filters.status)) {
            const values = filters.status.map((value) => String(value || '').trim()).filter(Boolean);
            if (values.length) {
                clauses.push(`status IN (${values.map(() => '?').join(',')})`);
                params.push(...values);
            }
        } else {
            clauses.push('status = ?');
            params.push(String(filters.status));
        }
    }
    if (filters.overlapStartAt !== undefined && filters.overlapEndAt !== undefined) {
        clauses.push('start_at <= ? AND end_at > ?');
        params.push(Number(filters.overlapEndAt) || 0, Number(filters.overlapStartAt) || 0);
    }
    const shouldLimit = filters.limit !== null && filters.limit !== false && filters.limit !== 'all';
    const maxLimit = Math.max(1, Number(filters.maxLimit) || 500);
    const limit = shouldLimit ? Math.max(1, Math.min(Number(filters.limit) || 100, maxLimit)) : null;
    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const limitSql = shouldLimit ? ' LIMIT ?' : '';
    const queryParams = shouldLimit ? [...params, limit] : params;
    return all(`SELECT * FROM overtime_requests ${whereSql} ORDER BY created_at DESC${limitSql}`, ...queryParams).map(mapOvertimeRequestRow);
};

const hasOverlappingOvertimeRequest = (employeeId, startAt, endAt, excludeId = '') => {
    const rows = all(
        `SELECT id FROM overtime_requests
         WHERE employee_id = ?
           AND status IN ('pending_supervisor', 'approved')
           AND start_at < ?
           AND end_at > ?`,
        employeeId,
        Number(endAt) || 0,
        Number(startAt) || 0
    );
    return rows.some((row) => row.id !== excludeId);
};

const updateOvertimeRequestSupervisorDecision = ({ requestId, decision, comment, decidedAt }) => {
    const nextStatus = decision === 'approved' ? 'approved' : 'rejected';
    db.transaction(() => {
        run(
            `UPDATE overtime_requests
             SET status = ?, supervisor_decision = ?, supervisor_comment = ?,
                 supervisor_decided_at = ?, updated_at = ?
             WHERE id = ?`,
            nextStatus,
            decision,
            comment || '',
            decidedAt,
            decidedAt,
            requestId
        );
        run(
            `UPDATE overtime_approval_steps
             SET status = ?, comment = ?, decided_at = ?
             WHERE request_id = ? AND reviewer_role = 'supervisor'`,
            decision,
            comment || '',
            decidedAt,
            requestId
        );
    })();
};

const withdrawOvertimeRequest = ({ requestId, withdrawnAt }) => run(
    `UPDATE overtime_requests
     SET status = 'withdrawn', withdrawn_at = ?, updated_at = ?
     WHERE id = ?`,
    withdrawnAt,
    withdrawnAt,
    requestId
);

const addPunchRecord = (record) => run(
    `INSERT INTO punch_records (
        id, timestamp, type, shift, status, source,
        ip_address, user_agent, device_id, device_name,
        gps_lat, gps_lng, gps_accuracy, gps_captured_at,
        gps_status, risk_flags
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    record.id,
    record.timestamp,
    record.type,
    record.shift,
    record.status,
    record.source,
    record.ip_address || null,
    record.user_agent || null,
    record.device_id || null,
    record.device_name || null,
    record.gps_lat ?? null,
    record.gps_lng ?? null,
    record.gps_accuracy ?? null,
    record.gps_captured_at ?? null,
    record.gps_status || null,
    record.risk_flags == null
        ? null
        : Array.isArray(record.risk_flags) || typeof record.risk_flags === 'object'
            ? JSON.stringify(record.risk_flags)
            : String(record.risk_flags || '')
);
const loadPunchRecords = () => all('SELECT * FROM punch_records ORDER BY timestamp DESC').map((row) => ({
    ...row,
    risk_flags: safeParseJsonValue(row.risk_flags) || []
}));
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
    const insert = db.prepare('INSERT OR REPLACE INTO greetings (id, type, message, employee_id) VALUES (@id, @type, @message, @employee_id)');
    db.transaction(() => {
        run('DELETE FROM greetings');
        for (const greeting of greetings) {
            insert.run(greeting);
        }
    })();
};
const loadGreetings = () => {
    return all('SELECT * FROM greetings');
};

const saveBellSchedules = (schedules) => {
    const insert = db.prepare('INSERT OR REPLACE INTO bell_schedules (id, title, time, days, sound, duration, enabled) VALUES (@id, @title, @time, @days, @sound, @duration, @enabled)');
    db.transaction(() => {
        run('DELETE FROM bell_schedules');
        for (const schedule of schedules) {
            const scheduleForDb = { 
                ...schedule, 
                duration: schedule.duration || 5,
                enabled: schedule.enabled ? 1 : 0 
            };
            insert.run(scheduleForDb);
        }
    })();
};

const loadBellSchedules = () => {
    const schedules = all('SELECT * FROM bell_schedules ORDER BY time');
    return schedules.map(s => ({ ...s, enabled: s.enabled === 1 }));
};

const addBellHistory = (record) => run('INSERT INTO bell_history (timestamp, scheduleId, time, sound) VALUES (?, ?, ?, ?)', record.timestamp, record.scheduleId, record.time, record.sound);
const hasBellHistorySince = (scheduleId, sinceTimestamp) => Boolean(
    get('SELECT 1 FROM bell_history WHERE scheduleId = ? AND timestamp > ? LIMIT 1', scheduleId, sinceTimestamp)
);
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

function safeParseArray(value, fallback = []) {
    if (Array.isArray(value)) return value;
    if (!value) return fallback;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : fallback;
    } catch (error) {
        return fallback;
    }
}

function normalizeStringList(values = []) {
    return [...new Set((Array.isArray(values) ? values : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean))];
}

function mapExternalApiKeyRow(row = {}) {
    return {
        id: String(row.id || '').trim(),
        name: String(row.name || '').trim(),
        key_hash: String(row.key_hash || '').trim(),
        keyHash: String(row.key_hash || '').trim(),
        key_suffix: String(row.key_suffix || '').trim(),
        keySuffix: String(row.key_suffix || '').trim(),
        permissions: normalizeStringList(safeParseArray(row.permissions, [])),
        enabled: row.enabled === 1,
        notes: String(row.notes || '').trim(),
        created_at: Number(row.created_at) || 0,
        createdAt: Number(row.created_at) || 0,
        updated_at: Number(row.updated_at) || 0,
        updatedAt: Number(row.updated_at) || 0,
        last_used_at: Number(row.last_used_at) || 0,
        lastUsedAt: Number(row.last_used_at) || 0,
        last_used_ip: String(row.last_used_ip || '').trim(),
        lastUsedIp: String(row.last_used_ip || '').trim()
    };
}

function normalizeExternalApiKeyForStorage(record = {}) {
    const now = Date.now();
    return {
        id: String(record.id || record.keyId || `api_key_${now}`).trim(),
        name: String(record.name || '').trim(),
        key_hash: String(record.key_hash || record.keyHash || '').trim(),
        key_suffix: String(record.key_suffix || record.keySuffix || '').trim(),
        permissions: JSON.stringify(normalizeStringList(record.permissions)),
        enabled: record.enabled === false || record.enabled === 0 || record.enabled === '0' || record.enabled === 'false' ? 0 : 1,
        notes: String(record.notes || '').trim(),
        created_at: Number(record.created_at || record.createdAt) || now,
        updated_at: Number(record.updated_at || record.updatedAt) || now,
        last_used_at: Number(record.last_used_at || record.lastUsedAt) || null,
        last_used_ip: String(record.last_used_ip || record.lastUsedIp || '').trim()
    };
}

const loadExternalApiKeys = () => all('SELECT * FROM external_api_keys ORDER BY created_at DESC').map(mapExternalApiKeyRow);
const getExternalApiKeyById = (keyId) => {
    const row = get('SELECT * FROM external_api_keys WHERE id = ?', String(keyId || '').trim());
    return row ? mapExternalApiKeyRow(row) : null;
};
const getExternalApiKeyByHash = (keyHash) => {
    const row = get('SELECT * FROM external_api_keys WHERE key_hash = ?', String(keyHash || '').trim());
    return row ? mapExternalApiKeyRow(row) : null;
};
const saveExternalApiKey = (record = {}) => {
    const normalized = normalizeExternalApiKeyForStorage(record);
    if (!normalized.id || !normalized.name || !normalized.key_hash) {
        throw new Error('外部 API Key 資料不完整，無法儲存。');
    }
    run(
        `INSERT OR REPLACE INTO external_api_keys (
            id, name, key_hash, key_suffix, permissions, enabled, notes,
            created_at, updated_at, last_used_at, last_used_ip
        ) VALUES (
            @id, @name, @key_hash, @key_suffix, @permissions, @enabled, @notes,
            @created_at, @updated_at, @last_used_at, @last_used_ip
        )`,
        normalized
    );
    return getExternalApiKeyById(normalized.id);
};
const deleteExternalApiKey = (keyId) => run('DELETE FROM external_api_keys WHERE id = ?', String(keyId || '').trim());
const updateExternalApiKeyUsage = ({ keyId, usedAt = Date.now(), ipAddress = '' } = {}) => run(
    'UPDATE external_api_keys SET last_used_at = ?, last_used_ip = ? WHERE id = ?',
    Number(usedAt) || Date.now(),
    String(ipAddress || '').trim(),
    String(keyId || '').trim()
);

function mapAccountAccessRow(row = {}) {
    return {
        employee_id: String(row.employee_id || '').trim(),
        allowed_roles: normalizeStringList(safeParseArray(row.allowed_roles, ['employee'])),
        admin_preset: String(row.admin_preset || 'none').trim() || 'none',
        admin_permissions: normalizeStringList(safeParseArray(row.admin_permissions, [])),
        updated_at: Number(row.updated_at) || 0,
        updated_by: String(row.updated_by || '').trim()
    };
}

function normalizeAccountAccessForStorage(record = {}) {
    return {
        employee_id: String(record.employee_id || record.employeeId || '').trim(),
        allowed_roles: JSON.stringify(normalizeStringList(record.allowed_roles || record.allowedRoles || ['employee'])),
        admin_preset: String(record.admin_preset || record.adminPreset || 'none').trim() || 'none',
        admin_permissions: JSON.stringify(normalizeStringList(record.admin_permissions || record.adminPermissions || [])),
        updated_at: Number(record.updated_at || record.updatedAt) || Date.now(),
        updated_by: String(record.updated_by || record.updatedBy || '').trim()
    };
}

const countAccountAccessRecords = () => Number(get('SELECT COUNT(*) AS total FROM account_access')?.total || 0);
const loadAccountAccessRecords = () => all('SELECT * FROM account_access ORDER BY employee_id').map(mapAccountAccessRow);
const getAccountAccessRecord = (employeeId) => {
    const row = get('SELECT * FROM account_access WHERE employee_id = ?', String(employeeId || '').trim());
    return row ? mapAccountAccessRow(row) : null;
};

const saveAccountAccessRecords = (records = []) => {
    const insert = db.prepare(`
        INSERT OR REPLACE INTO account_access (
            employee_id, allowed_roles, admin_preset, admin_permissions, updated_at, updated_by
        ) VALUES (
            @employee_id, @allowed_roles, @admin_preset, @admin_permissions, @updated_at, @updated_by
        )
    `);
    const normalizedRecords = (Array.isArray(records) ? records : [])
        .map(normalizeAccountAccessForStorage)
        .filter((record) => record.employee_id);
    db.transaction(() => {
        run('DELETE FROM account_access');
        for (const record of normalizedRecords) insert.run(record);
    })();
};

const saveAccountAccessRecord = (record = {}) => {
    const normalized = normalizeAccountAccessForStorage(record);
    if (!normalized.employee_id) return;
    run(
        `INSERT OR REPLACE INTO account_access (
            employee_id, allowed_roles, admin_preset, admin_permissions, updated_at, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        normalized.employee_id,
        normalized.allowed_roles,
        normalized.admin_preset,
        normalized.admin_permissions,
        normalized.updated_at,
        normalized.updated_by
    );
};

const deleteAccountAccessByEmployee = (employeeId) => run(
    'DELETE FROM account_access WHERE employee_id = ?',
    String(employeeId || '').trim()
);

function mapWorkspaceNavOrderRow(row = {}) {
    return {
        id: Number(row.id) || 0,
        role: String(row.role || '').trim(),
        nav_type: String(row.nav_type || 'main').trim() || 'main',
        scope: String(row.scope || 'global').trim() || 'global',
        employee_id: String(row.employee_id || '').trim(),
        order: normalizeStringList(safeParseArray(row.order_json, [])),
        updated_at: Number(row.updated_at) || 0,
        updated_by: String(row.updated_by || '').trim()
    };
}

function normalizeWorkspaceNavOrderForStorage(record = {}) {
    return {
        role: String(record.role || '').trim(),
        nav_type: String(record.nav_type || record.navType || 'main').trim() || 'main',
        scope: String(record.scope || 'global').trim() || 'global',
        employee_id: String(record.employee_id || record.employeeId || '').trim(),
        order_json: JSON.stringify(normalizeStringList(record.order || record.order_json || record.orderJson || [])),
        updated_at: Number(record.updated_at || record.updatedAt) || Date.now(),
        updated_by: String(record.updated_by || record.updatedBy || '').trim()
    };
}

const loadWorkspaceNavOrderRecords = () => all(
    'SELECT * FROM workspace_nav_order ORDER BY role, nav_type, scope, employee_id'
).map(mapWorkspaceNavOrderRow);

const getWorkspaceNavOrderRecord = (role, navType = 'main', scope = 'global', employeeId = '') => {
    const row = get(
        'SELECT * FROM workspace_nav_order WHERE role = ? AND nav_type = ? AND scope = ? AND employee_id = ?',
        String(role || '').trim(),
        String(navType || 'main').trim() || 'main',
        String(scope || 'global').trim() || 'global',
        String(employeeId || '').trim()
    );
    return row ? mapWorkspaceNavOrderRow(row) : null;
};

const saveWorkspaceNavOrderRecord = (record = {}) => {
    const normalized = normalizeWorkspaceNavOrderForStorage(record);
    if (!normalized.role) return;
    run(
        `INSERT OR REPLACE INTO workspace_nav_order (
            role, nav_type, scope, employee_id, order_json, updated_at, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        normalized.role,
        normalized.nav_type,
        normalized.scope,
        normalized.employee_id,
        normalized.order_json,
        normalized.updated_at,
        normalized.updated_by
    );
};

const deleteWorkspaceNavOrderRecord = (role, navType = 'main', scope = 'global', employeeId = '') => run(
    'DELETE FROM workspace_nav_order WHERE role = ? AND nav_type = ? AND scope = ? AND employee_id = ?',
    String(role || '').trim(),
    String(navType || 'main').trim() || 'main',
    String(scope || 'global').trim() || 'global',
    String(employeeId || '').trim()
);

function mapEmployeeDeviceRow(row) {
    return {
        ...row,
        created_at: Number(row.created_at) || 0,
        last_seen_at: Number(row.last_seen_at) || 0,
        last_gps_lat: row.last_gps_lat == null ? null : Number(row.last_gps_lat),
        last_gps_lng: row.last_gps_lng == null ? null : Number(row.last_gps_lng),
        last_gps_accuracy: row.last_gps_accuracy == null ? null : Number(row.last_gps_accuracy),
        last_gps_at: row.last_gps_at == null ? null : Number(row.last_gps_at),
        status: row.status || 'active'
    };
}

const loadEmployeeDevices = (employeeId = '') => {
    const normalizedEmployeeId = String(employeeId || '').trim();
    const rows = normalizedEmployeeId
        ? all('SELECT * FROM employee_devices WHERE employee_id = ? ORDER BY last_seen_at DESC', normalizedEmployeeId)
        : all('SELECT * FROM employee_devices ORDER BY last_seen_at DESC');
    return rows.map(mapEmployeeDeviceRow);
};

const getEmployeeDevice = (employeeId, deviceId) => {
    const row = get(
        'SELECT * FROM employee_devices WHERE employee_id = ? AND device_id = ?',
        String(employeeId || '').trim(),
        String(deviceId || '').trim()
    );
    return row ? mapEmployeeDeviceRow(row) : null;
};

const saveEmployeeDevice = (device) => run(
    `INSERT OR REPLACE INTO employee_devices (
        employee_id, device_id, device_name, device_token_hash,
        platform, user_agent, created_at, last_seen_at, last_ip,
        last_gps_lat, last_gps_lng, last_gps_accuracy, last_gps_at, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    String(device.employee_id || '').trim(),
    String(device.device_id || '').trim(),
    String(device.device_name || '').trim() || null,
    String(device.device_token_hash || '').trim() || null,
    String(device.platform || '').trim() || null,
    String(device.user_agent || '').trim() || null,
    Number(device.created_at) || Date.now(),
    Number(device.last_seen_at) || Date.now(),
    String(device.last_ip || '').trim() || null,
    device.last_gps_lat ?? null,
    device.last_gps_lng ?? null,
    device.last_gps_accuracy ?? null,
    device.last_gps_at ?? null,
    String(device.status || 'active').trim() || 'active'
);

const deleteEmployeeDevice = (employeeId, deviceId) => run(
    'DELETE FROM employee_devices WHERE employee_id = ? AND device_id = ?',
    String(employeeId || '').trim(),
    String(deviceId || '').trim()
);

const deleteEmployeeDevicesByEmployee = (employeeId) => run(
    'DELETE FROM employee_devices WHERE employee_id = ?',
    String(employeeId || '').trim()
);

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

const saveAutomationTasks = (tasks) => {
    const insert = db.prepare('INSERT OR REPLACE INTO automation_tasks (id, frequency, day, time, task_type, target, export_template, export_directory, enabled) VALUES (@id, @frequency, @day, @time, @task_type, @target, @export_template, @export_directory, @enabled)');
    db.transaction(() => {
        run('DELETE FROM automation_tasks');
        for (const task of tasks) {
            const taskForDb = {
                ...task,
                export_template: task.export_template || 'full',
                export_directory: String(task.export_directory || '').trim(),
                enabled: task.enabled ? 1 : 0
            };
            insert.run(taskForDb);
        }
    })();
};
const loadAutomationTasks = () => {
    const tasks = all('SELECT * FROM automation_tasks ORDER BY time');
    return tasks.map(t => ({
        ...t,
        export_template: t.export_template || 'full',
        export_directory: String(t.export_directory || '').trim(),
        enabled: t.enabled === 1
    }));
};
const addAutomationLog = (record) => run('INSERT INTO automation_log (timestamp, message, status) VALUES (?, ?, ?)', record.timestamp, record.message, record.status);
const loadAutomationLog = () => all('SELECT * FROM automation_log ORDER BY timestamp DESC');
const clearAutomationLog = () => run('DELETE FROM automation_log');

function safeParseAuditJson(value) {
    if (!value) return null;
    try {
        return JSON.parse(value);
    } catch (error) {
        return null;
    }
}

function buildAuditLogWhere(filters = {}) {
    const clauses = [];
    const params = [];

    const startDate = String(filters.startDate || '').trim();
    if (startDate) {
        const timestamp = new Date(`${startDate}T00:00:00`).getTime();
        if (!Number.isNaN(timestamp)) {
            clauses.push('timestamp >= ?');
            params.push(timestamp);
        }
    }

    const endDate = String(filters.endDate || '').trim();
    if (endDate) {
        const timestamp = new Date(`${endDate}T23:59:59.999`).getTime();
        if (!Number.isNaN(timestamp)) {
            clauses.push('timestamp <= ?');
            params.push(timestamp);
        }
    }

    const actorId = String(filters.actorId || '').trim();
    if (actorId) {
        clauses.push('actor_id = ?');
        params.push(actorId);
    }

    const role = String(filters.role || '').trim();
    if (role) {
        clauses.push('role = ?');
        params.push(role);
    }

    const action = String(filters.action || '').trim();
    if (action) {
        clauses.push('action = ?');
        params.push(action);
    }

    const targetType = String(filters.targetType || '').trim();
    if (targetType) {
        clauses.push('target_type = ?');
        params.push(targetType);
    }

    const successFilter = String(filters.success || '').trim().toLowerCase();
    if (['1', 'true', 'success', 'succeeded', 'ok'].includes(successFilter)) {
        clauses.push('success = 1');
    } else if (['0', 'false', 'failure', 'failed', 'error'].includes(successFilter)) {
        clauses.push('success = 0');
    }

    const keyword = String(filters.query || '').trim();
    if (keyword) {
        const likeValue = `%${keyword}%`;
        clauses.push('(actor_id LIKE ? OR actor_name LIKE ? OR summary LIKE ? OR target_id LIKE ? OR before_json LIKE ? OR after_json LIKE ?)');
        params.push(likeValue, likeValue, likeValue, likeValue, likeValue, likeValue);
    }

    return {
        whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
        params
    };
}

function mapAuditLogRow(row) {
    return {
        ...row,
        success: row.success === 1,
        before_data: safeParseAuditJson(row.before_json),
        after_data: safeParseAuditJson(row.after_json)
    };
}

const addAuditLog = (record) => run(
    `INSERT INTO audit_logs (
        timestamp, actor_id, actor_name, role, channel, action,
        target_type, target_id, summary, before_json, after_json,
        success, ip_address, session_token_suffix
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    Number(record.timestamp) || Date.now(),
    record.actor_id || null,
    record.actor_name || null,
    record.role || null,
    record.channel || null,
    record.action || null,
    record.target_type || null,
    record.target_id || null,
    record.summary || null,
    record.before_data == null ? null : JSON.stringify(record.before_data),
    record.after_data == null ? null : JSON.stringify(record.after_data),
    record.success === false ? 0 : 1,
    record.ip_address || null,
    record.session_token_suffix || null
);

const getAuditLogsForArchive = (cutoffTimestamp, limit = 2000) => {
    const normalizedLimit = Math.max(1, Math.min(Number(limit) || 2000, 5000));
    const rows = all(
        'SELECT * FROM audit_logs WHERE timestamp < ? ORDER BY timestamp ASC LIMIT ?',
        Number(cutoffTimestamp) || 0,
        normalizedLimit
    );
    return rows.map(mapAuditLogRow);
};

const deleteAuditLogsByIds = (ids = []) => {
    const normalizedIds = [...new Set((Array.isArray(ids) ? ids : [])
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0))];
    if (!normalizedIds.length) return { changes: 0 };

    let changes = 0;
    db.transaction(() => {
        for (let index = 0; index < normalizedIds.length; index += 400) {
            const chunk = normalizedIds.slice(index, index + 400);
            const placeholders = chunk.map(() => '?').join(', ');
            changes += run(`DELETE FROM audit_logs WHERE id IN (${placeholders})`, ...chunk).changes;
        }
    })();
    return { changes };
};

const addAuditArchive = (record) => run(
    `INSERT INTO audit_archives (
        created_at, archive_batch_id, source_table, archive_month,
        start_timestamp, end_timestamp, record_count, file_path,
        checksum, retention_days
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    Number(record.created_at) || Date.now(),
    record.archive_batch_id || null,
    record.source_table || 'audit_logs',
    record.archive_month || null,
    Number(record.start_timestamp) || null,
    Number(record.end_timestamp) || null,
    Number(record.record_count) || 0,
    record.file_path || '',
    record.checksum || null,
    Number(record.retention_days) || null
);

const loadAuditArchives = (limit = 20) => {
    const normalizedLimit = Math.max(1, Math.min(Number(limit) || 20, 200));
    return all('SELECT * FROM audit_archives ORDER BY created_at DESC LIMIT ?', normalizedLimit);
};

const countAuditArchives = () => {
    const row = get('SELECT COUNT(*) AS total FROM audit_archives');
    return Number(row?.total || 0);
};

const queryAuditLogs = (filters = {}) => {
    const { whereSql, params } = buildAuditLogWhere(filters);
    const requestedLimit = Number(filters.limit) || 100;
    const limit = Math.max(1, Math.min(requestedLimit, 200));
    const rows = all(`SELECT * FROM audit_logs ${whereSql} ORDER BY timestamp DESC LIMIT ?`, ...params, limit);
    return rows.map(mapAuditLogRow);
};

const countAuditLogs = (filters = {}) => {
    const { whereSql, params } = buildAuditLogWhere(filters);
    const row = get(`SELECT COUNT(*) AS total FROM audit_logs ${whereSql}`, ...params);
    return Number(row?.total || 0);
};

const countPunchFailureAuditLogsSince = (startTimestamp, excludedFailureCodes = []) => {
    const rows = all(
        `SELECT summary, after_json FROM audit_logs
         WHERE timestamp >= ?
           AND action = 'punch'
           AND target_type = 'punch_record'
           AND success = 0`,
        Number(startTimestamp) || 0
    );
    const excludedCodes = new Set((Array.isArray(excludedFailureCodes) ? excludedFailureCodes : [])
        .map((code) => String(code || '').trim())
        .filter(Boolean));

    return rows.filter((row) => {
        const afterData = safeParseAuditJson(row.after_json) || {};
        const failureCode = String(afterData.failure_code || '').trim();
        if (failureCode && excludedCodes.has(failureCode)) return false;
        if (!failureCode && String(row.summary || '').includes('重複打卡')) return false;
        return true;
    }).length;
};


module.exports = {
  init,
  getDatabasePath, backupDatabase, validateBackupDatabaseFile, replaceDatabaseFromBackup,
  saveEmployees, loadEmployees, deleteAllEmployees,
  addPunchRecord, loadPunchRecords,
  deletePunchRecordsByDateRange, deletePunchRecordsBySource,
  saveShifts, loadShifts,
  saveGreetings, loadGreetings,
  saveBellSchedules, loadBellSchedules,
  addBellHistory, hasBellHistorySince, loadBellHistory, clearBellHistory,
  saveCustomSounds, loadCustomSounds,
  setSetting, getSetting,
  loadExternalApiKeys, getExternalApiKeyById, getExternalApiKeyByHash,
  saveExternalApiKey, deleteExternalApiKey, updateExternalApiKeyUsage,
  countAccountAccessRecords, loadAccountAccessRecords, getAccountAccessRecord,
  saveAccountAccessRecords, saveAccountAccessRecord, deleteAccountAccessByEmployee,
  loadWorkspaceNavOrderRecords, getWorkspaceNavOrderRecord,
  saveWorkspaceNavOrderRecord, deleteWorkspaceNavOrderRecord,
  loadEmployeeDevices, getEmployeeDevice, saveEmployeeDevice,
  deleteEmployeeDevice, deleteEmployeeDevicesByEmployee,
  saveSpecialEffects, loadSpecialEffects,
  saveThemeSchedules, loadThemeSchedules,
  saveCustomThemes, loadCustomThemes,
  loadLeaveTypes, saveLeaveTypes,
  loadLeaveApprovalRoutes, saveLeaveApprovalRoutes,
  createLeaveRequest, getLeaveRequestById, queryLeaveRequests,
  hasOverlappingLeaveRequest, updateLeaveRequestSupervisorDecision,
  updateLeaveRequestAdminDecision, withdrawLeaveRequest,
  createOvertimeRequest, getOvertimeRequestById, queryOvertimeRequests,
  hasOverlappingOvertimeRequest, updateOvertimeRequestSupervisorDecision,
  withdrawOvertimeRequest,
  saveAutomationTasks, loadAutomationTasks,
  addAutomationLog, loadAutomationLog, clearAutomationLog,
  addAuditLog, getAuditLogsForArchive, deleteAuditLogsByIds,
  addAuditArchive, loadAuditArchives, countAuditArchives,
  queryAuditLogs, countAuditLogs, countPunchFailureAuditLogsSince
};
