const roleConfig = {
    employee: {
        title: "員工登入",
        accountLabel: "員工編號",
        accountPlaceholder: "輸入員工編號",
        secretLabel: "卡號",
        secretPlaceholder: "請輸入卡號",
        help: "員工使用工號與卡號登入，登入後可看到個人資訊、目前班別與近 7 日打卡紀錄。"
    },
    admin: {
        title: "管理者登入",
        accountLabel: "員工編號",
        accountPlaceholder: "輸入員工編號",
        secretLabel: "管理者密碼",
        secretPlaceholder: "請輸入管理者密碼",
        help: "管理者使用工號與管理者密碼登入，登入後可管理員工、班別、問候語、響鈴、主題與資料設定。"
    },
    developer: {
        title: "開發人員登入",
        accountLabel: "員工編號",
        accountPlaceholder: "輸入員工編號",
        secretLabel: "系統密碼",
        secretPlaceholder: "請輸入系統密碼",
        help: "開發人員使用工號與系統密碼登入，登入後可管理 AI 系統控制、自動化任務與系統密碼。"
    },
    system_admin: {
        title: "系統管理者登入",
        accountLabel: "系統管理者帳號",
        accountPlaceholder: "system-admin",
        secretLabel: "系統管理者密碼",
        secretPlaceholder: "請輸入系統管理者密碼",
        help: "系統管理者使用獨立網頁端帳號登入，只負責設定員工可使用的網頁角色與管理者功能。"
    }
};

const defaultThemeStyles = {
    bgDayStart: "#f5fbff",
    bgDayEnd: "#e8f2f8",
    bgNightStart: "#edf5fa",
    bgNightEnd: "#dce9f3",
    dayStartTime: "05:00",
    nightStartTime: "17:00",
    mainTitleColor: "#18384a",
    btnAdminBg: "#edf3f7",
    btnAdminText: "#0f556f",
    btnReportBg: "#e1f4fb",
    btnReportText: "#0d607a",
    btnAiBg: "#e6efff",
    btnAiText: "#154f78",
    clockBg: "#dff2fb",
    clockText: "#164b67",
    clockBgImage: "",
    browserClockBgImage: "",
    clockBgPos: "center",
    clockSymbolsLeft: "",
    clockSymbolsRight: "",
    blinkEnabled: false,
    blinkDayColor: "#fbc02d",
    blinkNightColor: "#29d9ff",
    punchEffect: "none",
    punchFallContent: "★,☆",
    punchFlashContent: "OK"
};

const defaultDisplaySettings = {
    mainTitle: "震欣科技AI作息系統",
    subtitle: "您的 AI 智慧好夥伴",
    heroDescription: "透過瀏覽器快速查看打卡資料、管理設定與系統狀態。"
};

const automationFrequencyLabels = {
    immediate: "立即",
    daily: "每日",
    weekly: "每週",
    monthly: "每月"
};

const automationTaskLabels = {
    export: "匯出",
    delete: "刪除",
    backup: "完整備份"
};

const automationTargetLabels = {
    last_week_records: "上週打卡紀錄",
    last_month_records: "上月打卡紀錄",
    manual_records: "手動補登紀錄",
    all_records: "全部打卡紀錄",
    all_employees: "全部員工資料",
    all_bell_records: "全部響鈴紀錄",
    log: "系統日誌",
    database_full: "完整資料庫備份"
};

const auditRoleLabels = {
    employee: "員工",
    admin: "管理者",
    developer: "開發人員",
    system_admin: "系統管理者",
    desktop: "桌面端",
    system: "系統"
};

const auditActionLabels = {
    login: "登入",
    logout: "登出",
    punch: "打卡",
    archive: "封存",
    create: "新增",
    save: "儲存",
    update: "更新",
    delete: "刪除",
    clear: "清除",
    upload: "上傳",
    export: "匯出",
    execute: "立即執行",
    backup: "備份",
    restore: "還原",
    change_password: "變更密碼"
};

const auditTargetTypeLabels = {
    session: "登入工作階段",
    employee: "員工資料",
    punch_record: "打卡紀錄",
    shift: "班別設定",
    greeting: "問候語",
    bell_schedule: "作息響鈴",
    custom_sound: "自訂音效",
    bell_history: "響鈴歷史",
    special_effect: "節日特效",
    theme_schedule: "主題排程",
    custom_theme: "自訂主題",
    automation_task: "自動化任務",
    automation_log: "自動化日誌",
    database: "資料庫",
    database_backup_setting: "資料庫備份設定",
    audit_log: "操作稽核",
    audit_archive_setting: "稽核封存設定",
    setting: "系統設定",
    report: "報表"
};

const attendanceExportTargets = ["last_week_records", "last_month_records", "manual_records", "all_records"];

const attendanceExportTemplateLabels = {
    payroll: "薪資系統",
    anomaly: "異常稽核",
    analysis: "報表分析",
    payroll_leave: "薪資含請假明細",
    full: "完整格式",
    custom: "自訂格式"
};

const dayLabels = ["日", "一", "二", "三", "四", "五", "六"];
const EMPLOYEE_ROSTER_VISIBLE_COLUMNS_STORAGE_KEY = "tanchin.browser.employeeRosterVisibleColumns";
const COLLAPSIBLE_DEFAULTS_STORAGE_KEY = "tanchin.browser.collapsibleDefaults";
const ADMIN_DASHBOARD_SCOPE_STORAGE_KEY = "tanchin.browser.adminDashboardScope";
const ADMIN_DASHBOARD_SCOPE_MODES = ["all", "active", "department", "manual"];

const state = {
    activeRole: "employee",
    token: sessionStorage.getItem("browserPortalToken") || "",
    dashboard: null,
    publicDisplaySettings: { ...defaultDisplaySettings },
    clockTimer: null,
    adminReport: null,
    adminPeopleFilters: null,
    developerAudit: null,
    syncEventSource: null,
    activeInsightKey: "",
    employeeWorkspacePanel: "",
    workspaceNavOrderRole: "admin",
    collapsibleStates: {},
    collapsibleDefaults: loadCollapsibleDefaults(),
    adminDashboardScope: loadAdminDashboardScope(),
    activeSections: {
        admin: "people",
        developer: "automation"
    }
};

const WORKSPACE_NAV_ROLE_FALLBACKS = [
    {
        id: "admin",
        label: "管理者工作台",
        sections: [
            { id: "people", label: "人員資料" },
            { id: "security", label: "安全設定" },
            { id: "shifts", label: "班別設定" },
            { id: "manualPunch", label: "手動補登" },
            { id: "reports", label: "考勤報表" },
            { id: "leave", label: "請假管理" },
            { id: "system", label: "系統設定" },
            { id: "bells", label: "響鈴設定" },
            { id: "themes", label: "主題特效" }
        ]
    },
    {
        id: "developer",
        label: "開發者工作台",
        sections: [
            { id: "automation", label: "自動化任務" },
            { id: "automationLogs", label: "自動化日誌" },
            { id: "auditLogs", label: "稽核紀錄" },
            { id: "systemSettings", label: "系統設定" },
            { id: "export", label: "匯出設定" },
            { id: "status", label: "系統狀態" }
        ]
    }
];

function getWorkspaceNavOrderState(dashboard = state.dashboard) {
    return dashboard?.datasets?.workspaceNavOrder || dashboard?.workspaceNavOrder || {
        canManage: false,
        roles: [],
        orders: {}
    };
}

function getWorkspaceNavRoleDefinitions(navState = getWorkspaceNavOrderState()) {
    const roles = Array.isArray(navState.roles) && navState.roles.length
        ? navState.roles
        : WORKSPACE_NAV_ROLE_FALLBACKS;
    return roles.filter((role) => role?.id && Array.isArray(role.sections));
}

function orderWorkspaceMainSections(role, sections = [], dashboard = state.dashboard) {
    const safeSections = Array.isArray(sections) ? sections : [];
    const order = getWorkspaceNavOrderState(dashboard)?.orders?.[role]?.order || [];
    if (!Array.isArray(order) || !order.length) return safeSections;
    const orderMap = new Map(order.map((sectionId, index) => [sectionId, index]));
    return [...safeSections].sort((a, b) => {
        const aIndex = orderMap.has(a.id) ? orderMap.get(a.id) : Number.MAX_SAFE_INTEGER;
        const bIndex = orderMap.has(b.id) ? orderMap.get(b.id) : Number.MAX_SAFE_INTEGER;
        if (aIndex !== bIndex) return aIndex - bIndex;
        return safeSections.indexOf(a) - safeSections.indexOf(b);
    });
}

function padDatePart(value) {
    return String(value).padStart(2, "0");
}

function formatDateInputValue(date = new Date()) {
    return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function createDefaultAdminReportState() {
    const today = formatDateInputValue();
    return {
        filters: {
            employeeId: "",
            employeeName: "",
            startDate: today,
            endDate: today
        },
        summary: null,
        records: [],
        queried: false
    };
}

function createDefaultAdminPeopleFilterState() {
    return {
        query: "",
        department: "",
        visibleRows: "25"
    };
}

function ensureAdminReportState() {
    const defaults = createDefaultAdminReportState();
    if (!state.adminReport) {
        state.adminReport = defaults;
        return state.adminReport;
    }

    state.adminReport = {
        ...defaults,
        ...state.adminReport,
        filters: {
            ...defaults.filters,
            ...(state.adminReport.filters || {})
        },
        summary: state.adminReport.summary || null,
        records: Array.isArray(state.adminReport.records) ? state.adminReport.records : [],
        queried: Boolean(state.adminReport.queried)
    };
    return state.adminReport;
}

function ensureAdminPeopleFilters() {
    const defaults = createDefaultAdminPeopleFilterState();
    state.adminPeopleFilters = {
        ...defaults,
        ...(state.adminPeopleFilters || {})
    };
    if (!["25", "50"].includes(String(state.adminPeopleFilters.visibleRows))) {
        state.adminPeopleFilters.visibleRows = defaults.visibleRows;
    }
    return state.adminPeopleFilters;
}

function createDefaultDeveloperAuditState() {
    return {
        filters: {
            startDate: "",
            endDate: "",
            actorId: "",
            role: "",
            action: "",
            targetType: "",
            success: "",
            query: "",
            limit: "100"
        },
        logs: [],
        total: 0,
        queried: false
    };
}

function ensureDeveloperAuditState() {
    const defaults = createDefaultDeveloperAuditState();
    if (!state.developerAudit) {
        state.developerAudit = defaults;
        return state.developerAudit;
    }

    state.developerAudit = {
        ...defaults,
        ...state.developerAudit,
        filters: {
            ...defaults.filters,
            ...(state.developerAudit.filters || {})
        },
        logs: Array.isArray(state.developerAudit.logs) ? state.developerAudit.logs : [],
        total: Number(state.developerAudit.total || 0),
        queried: Boolean(state.developerAudit.queried)
    };
    return state.developerAudit;
}

const EMPLOYEE_ROSTER_FIXED_COLUMNS = ["id", "name", "gender", "department", "job_title", "card", "password", "nationality"];
const EMPLOYEE_ROSTER_COLUMNS = [
    { key: "id", label: "工號", cellClass: "nowrap-cell", render: (employee) => escapeHtml(employee.id || "-") },
    { key: "name", label: "姓名", cellClass: "nowrap-cell", render: (employee) => renderEmployeeNameWithSupervisorHint(employee) },
    { key: "gender", label: "性別", cellClass: "nowrap-cell", render: (employee) => escapeHtml(employee.gender || "-") },
    { key: "department", label: "部門", cellClass: "nowrap-cell", render: (employee) => escapeHtml(employee.department || "-") },
    { key: "job_title", label: "職稱", cellClass: "nowrap-cell", render: (employee) => escapeHtml(employee.job_title || "-") },
    { key: "card", label: "卡號", cellClass: "nowrap-cell", render: (employee) => escapeHtml(employee.card || "-") },
    { key: "password", label: "密碼", cellClass: "nowrap-cell", render: () => `<span class="mono-text">********</span>` },
    { key: "nationality", label: "國籍", cellClass: "nowrap-cell", render: (employee) => escapeHtml(employee.nationality || "-") },
    { key: "national_id", label: "身分證字號", cellClass: "nowrap-cell", render: (employee) => escapeHtml(employee.national_id || "-") },
    { key: "birth_date", label: "出生日", cellClass: "nowrap-cell", render: (employee) => escapeHtml(employee.birth_date || "-") },
    { key: "hire_date", label: "到職日", cellClass: "nowrap-cell", render: (employee) => escapeHtml(employee.hire_date || "-") },
    { key: "termination_date", label: "離職日", cellClass: "nowrap-cell", render: (employee) => escapeHtml(employee.termination_date || "-") },
    { key: "bank_account", label: "銀行帳戶號碼", cellClass: "nowrap-cell", render: (employee) => escapeHtml(employee.bank_account || "-") },
    { key: "mobile_phone", label: "聯絡手機", cellClass: "nowrap-cell", render: (employee) => escapeHtml(employee.mobile_phone || "-") },
    { key: "emergency_contact", label: "緊急聯絡人", cellClass: "nowrap-cell", render: (employee) => escapeHtml(employee.emergency_contact || "-") },
    { key: "emergency_phone", label: "緊急聯絡電話", cellClass: "nowrap-cell", render: (employee) => escapeHtml(employee.emergency_phone || "-") },
    { key: "contact_address", label: "聯絡地址", cellClass: "multiline-cell", render: (employee) => escapeHtml(employee.contact_address || "-") },
    { key: "registered_address", label: "戶籍地址", cellClass: "multiline-cell", render: (employee) => escapeHtml(employee.registered_address || "-") },
    { key: "family_status", label: "家庭概況", cellClass: "multiline-cell", render: (employee) => escapeHtml(employee.family_status || "-") },
    { key: "notes", label: "備註", cellClass: "multiline-cell", render: (employee) => escapeHtml(employee.notes || "-") }
];
const EMPLOYEE_ROSTER_OPTIONAL_COLUMNS = EMPLOYEE_ROSTER_COLUMNS.filter((column) => !EMPLOYEE_ROSTER_FIXED_COLUMNS.includes(column.key));

function getEmployeeRosterVisibleColumns() {
    try {
        const raw = localStorage.getItem(EMPLOYEE_ROSTER_VISIBLE_COLUMNS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        const allowedKeys = new Set(EMPLOYEE_ROSTER_OPTIONAL_COLUMNS.map((column) => column.key));
        if (!Array.isArray(parsed)) return [];
        return [...new Set(parsed.map((value) => String(value || "").trim()).filter((value) => allowedKeys.has(value)))];
    } catch {
        return [];
    }
}

function setEmployeeRosterVisibleColumns(columns) {
    try {
        localStorage.setItem(EMPLOYEE_ROSTER_VISIBLE_COLUMNS_STORAGE_KEY, JSON.stringify(columns));
    } catch {
        // Ignore storage errors and fall back to in-memory rendering only.
    }
}

function loadCollapsibleDefaults() {
    try {
        const parsed = JSON.parse(localStorage.getItem(COLLAPSIBLE_DEFAULTS_STORAGE_KEY) || "{}");
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function saveCollapsibleDefaults() {
    try {
        localStorage.setItem(COLLAPSIBLE_DEFAULTS_STORAGE_KEY, JSON.stringify(state.collapsibleDefaults || {}));
    } catch (error) {
        console.error("Failed to save collapsible defaults:", error);
    }
}

function createDefaultAdminDashboardScope() {
    return {
        mode: "all",
        department: "",
        employeeIds: []
    };
}

function loadAdminDashboardScope() {
    const defaults = createDefaultAdminDashboardScope();
    try {
        const parsed = JSON.parse(localStorage.getItem(ADMIN_DASHBOARD_SCOPE_STORAGE_KEY) || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return defaults;
        const mode = ADMIN_DASHBOARD_SCOPE_MODES.includes(parsed.mode) ? parsed.mode : defaults.mode;
        const employeeIds = Array.isArray(parsed.employeeIds)
            ? [...new Set(parsed.employeeIds.map((id) => String(id || "").trim()).filter(Boolean))]
            : [];
        return {
            ...defaults,
            mode,
            department: String(parsed.department || "").trim(),
            employeeIds
        };
    } catch {
        return defaults;
    }
}

function saveAdminDashboardScope() {
    try {
        localStorage.setItem(ADMIN_DASHBOARD_SCOPE_STORAGE_KEY, JSON.stringify(state.adminDashboardScope || createDefaultAdminDashboardScope()));
    } catch (error) {
        console.error("Failed to save admin dashboard scope:", error);
    }
}

function resetEmployeeRosterVisibleColumns() {
    setEmployeeRosterVisibleColumns([]);
}

function getActiveEmployeeRosterColumns() {
    const visibleOptionalColumns = new Set(getEmployeeRosterVisibleColumns());
    return EMPLOYEE_ROSTER_COLUMNS.filter((column) =>
        EMPLOYEE_ROSTER_FIXED_COLUMNS.includes(column.key) || visibleOptionalColumns.has(column.key)
    );
}

function getEmployeeRosterColumnSummaryText() {
    return `固定顯示核心 ${EMPLOYEE_ROSTER_FIXED_COLUMNS.length} 欄，目前額外顯示 ${getEmployeeRosterVisibleColumns().length} / ${EMPLOYEE_ROSTER_OPTIONAL_COLUMNS.length} 欄。`;
}

function renderEmployeeRosterColumnControls() {
    const visibleColumns = new Set(getEmployeeRosterVisibleColumns());
    return `
        <div class="employee-column-grid">
            ${EMPLOYEE_ROSTER_OPTIONAL_COLUMNS.map((column) => `
                <label class="employee-column-option">
                    <input
                        type="checkbox"
                        class="employee-column-toggle"
                        data-column="${escapeHtml(column.key)}"
                        ${visibleColumns.has(column.key) ? "checked" : ""}
                    >
                    <span>${escapeHtml(column.label)}</span>
                </label>
            `).join("")}
        </div>
    `;
}

function isAttendanceExportTask(taskType, target) {
    return taskType === "export" && attendanceExportTargets.includes(String(target || "").trim());
}

function getAttendanceExportConfig(datasets = getDatasets()) {
    return datasets?.attendanceExport || {
        defaultTemplateId: "full",
        customFields: [],
        fieldCatalog: [],
        templates: []
    };
}

function getAutomationExportConfig(datasets = getDatasets()) {
    return datasets?.automationExport || {
        defaultDirectory: "",
        fallbackDirectory: "",
        effectiveDirectory: "",
        usingFallback: true
    };
}

function getDatabaseBackupConfig(datasets = getDatasets()) {
    return datasets?.databaseBackup || {
        defaultDirectory: "",
        fallbackDirectory: "",
        effectiveDirectory: "",
        usingFallback: true,
        retentionCount: 30,
        recentBackups: [],
        recentEmergencyBackups: []
    };
}

function getAuditArchiveConfig(datasets = getDatasets()) {
    return datasets?.auditArchive || {
        retentionDays: 180,
        defaultDirectory: "",
        fallbackDirectory: "",
        effectiveDirectory: "",
        usingFallback: true,
        recentArchives: []
    };
}

function getAttendanceExportTemplateLabel(templateId) {
    return attendanceExportTemplateLabels[templateId] || templateId || attendanceExportTemplateLabels.full;
}

const ui = {
    roleSelector: document.getElementById("role-selector"),
    roleHelp: document.getElementById("role-help"),
    loginForm: document.getElementById("login-form"),
    heroEyebrow: document.getElementById("hero-eyebrow"),
    heroTitle: document.getElementById("hero-title"),
    heroDescription: document.getElementById("hero-description"),
    heroDescriptionActions: document.getElementById("hero-description-actions"),
    heroDescriptionEditBtn: document.getElementById("hero-description-edit-btn"),
    heroDescriptionForm: document.getElementById("hero-description-form"),
    heroDescriptionInput: document.getElementById("hero-description-input"),
    heroDescriptionCancelBtn: document.getElementById("hero-description-cancel-btn"),
    employeeIdLabel: document.getElementById("employee-id-label"),
    employeeIdInput: document.getElementById("employee-id-input"),
    secretLabel: document.getElementById("secret-label"),
    secretInput: document.getElementById("secret-input"),
    loginSubmitBtn: document.getElementById("login-submit-btn"),
    loginMessage: document.getElementById("login-message"),
    loginView: document.getElementById("login-view"),
    dashboardView: document.getElementById("dashboard-view"),
    dashboardTitle: document.getElementById("dashboard-title"),
    dashboardIdentityPill: document.getElementById("dashboard-identity-pill"),
    dashboardVersionPill: document.getElementById("dashboard-version-pill"),
    dashboardMessage: document.getElementById("dashboard-message"),
    dashboardContent: document.getElementById("dashboard-content"),
    dashboardHelpBtn: document.getElementById("dashboard-help-btn"),
    dashboardHelpModal: document.getElementById("dashboard-help-modal"),
    dashboardHelpTitle: document.getElementById("dashboard-help-title"),
    dashboardHelpContent: document.getElementById("dashboard-help-content"),
    dashboardHelpCloseBtn: document.getElementById("dashboard-help-close-btn"),
    dashboardInsightModal: document.getElementById("dashboard-insight-modal"),
    dashboardInsightTitle: document.getElementById("dashboard-insight-title"),
    dashboardInsightContent: document.getElementById("dashboard-insight-content"),
    dashboardInsightCloseBtn: document.getElementById("dashboard-insight-close-btn"),
    logoutBtn: document.getElementById("logout-btn"),
    audioPlayer: document.getElementById("browser-audio-player")
};

function setMessage(target, text, type = "info") {
    target.textContent = text || "";
    if (target.id === "dashboard-message") {
        target.className = text ? `status-pill ${type}` : "status-pill hidden";
        return;
    }
    target.className = text ? `inline-message ${type}` : "inline-message";
}

function getFormMessageNode(formOrId) {
    const formId = typeof formOrId === "string"
        ? formOrId
        : formOrId?.getAttribute?.("id") || "";
    if (!formId) return null;
    return document.querySelector(`[data-form-message-for="${formId}"]`);
}

function setFormMessage(formOrId, text, type = "info") {
    const target = getFormMessageNode(formOrId);
    if (target) setMessage(target, text, type);
}

async function hashCardIdentifier(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    try {
        const data = new TextEncoder().encode(`card-id:${text}`);
        const digest = await window.crypto.subtle.digest("SHA-256", data);
        return Array.from(new Uint8Array(digest))
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("");
    } catch {
        let hash = 2166136261;
        for (let index = 0; index < text.length; index += 1) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
    }
}

function getCardIdentifierMeta(value) {
    const text = String(value || "").trim();
    return {
        length: text.length,
        suffix: text.length <= 4 ? text : text.slice(-4)
    };
}

function normalizeDisplayText(value, fallback) {
    const normalized = String(value ?? "").trim();
    return normalized || fallback;
}

function getDisplaySettings(source = state.dashboard?.displaySettings || state.publicDisplaySettings) {
    return {
        mainTitle: normalizeDisplayText(source?.mainTitle, defaultDisplaySettings.mainTitle),
        subtitle: normalizeDisplayText(source?.subtitle, defaultDisplaySettings.subtitle),
        heroDescription: normalizeDisplayText(source?.heroDescription, defaultDisplaySettings.heroDescription)
    };
}

function syncHeroHeader(dashboard = state.dashboard) {
    const displaySettings = getDisplaySettings(dashboard?.displaySettings || state.publicDisplaySettings);

    if (dashboard?.displaySettings) {
        state.publicDisplaySettings = { ...displaySettings };
    }

    if (ui.heroEyebrow) ui.heroEyebrow.textContent = displaySettings.subtitle;
    if (ui.heroTitle) ui.heroTitle.textContent = displaySettings.mainTitle;
    if (ui.heroDescription) ui.heroDescription.textContent = displaySettings.heroDescription;
    document.title = displaySettings.mainTitle;

    const canEditHeroDescription = dashboard?.role === "developer";
    ui.heroDescriptionActions?.classList.toggle("hidden", !canEditHeroDescription);
    if (ui.heroDescriptionForm) {
        ui.heroDescriptionForm.classList.add("hidden");
        setFormMessage("hero-description-form", "");
    }
    if (ui.heroDescriptionInput) {
        ui.heroDescriptionInput.value = displaySettings.heroDescription;
    }
}

function startHeroDescriptionEdit() {
    if (state.dashboard?.role !== "developer") return;
    ui.heroDescriptionActions?.classList.add("hidden");
    ui.heroDescriptionForm?.classList.remove("hidden");
    if (ui.heroDescriptionInput) {
        ui.heroDescriptionInput.value = getDisplaySettings().heroDescription;
        ui.heroDescriptionInput.focus();
        ui.heroDescriptionInput.setSelectionRange?.(ui.heroDescriptionInput.value.length, ui.heroDescriptionInput.value.length);
    }
}

function cancelHeroDescriptionEdit() {
    if (state.dashboard?.role !== "developer") {
        syncHeroHeader();
        return;
    }
    ui.heroDescriptionForm?.classList.add("hidden");
    ui.heroDescriptionActions?.classList.remove("hidden");
    setFormMessage("hero-description-form", "");
    if (ui.heroDescriptionInput) {
        ui.heroDescriptionInput.value = getDisplaySettings().heroDescription;
    }
}

function escapeHtml(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

async function requestJson(url, { method = "GET", body, auth = false } = {}) {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (auth && state.token) headers.Authorization = `Bearer ${state.token}`;

    const response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const result = await response.json().catch(() => ({}));

    if (response.status === 401) {
        await handleLogout(true);
        throw new Error(result.error || "登入狀態已失效，請重新登入。");
    }
    if (!response.ok || result.success === false) {
        throw new Error(result.error || result.message || "操作失敗");
    }
    return result;
}

async function fetchDashboard() {
    const result = await requestJson("/api/browser/dashboard", { auth: true });
    return result.dashboard;
}

async function loadPublicDisplaySettings() {
    try {
        const result = await requestJson("/api/browser/public-settings");
        state.publicDisplaySettings = getDisplaySettings(result.data?.displaySettings || defaultDisplaySettings);
        syncHeroHeader();
    } catch (error) {
        console.error("Failed to load browser display settings:", error);
        syncHeroHeader();
    }
}

async function reloadDashboard(message = "", type = "success") {
    const dashboard = await fetchDashboard();
    if (dashboard.role === "admin" && ensureAdminReportState().queried) {
        const reportState = ensureAdminReportState();
        try {
            const reportResult = await requestJson("/api/browser/admin/reports/query", {
                method: "POST",
                body: {
                    employeeId: reportState.filters.employeeId || "",
                    startDate: reportState.filters.startDate,
                    endDate: reportState.filters.endDate
                },
                auth: true
            });
            state.adminReport = {
                ...reportResult.data,
                queried: true
            };
        } catch (error) {
            console.error("同步管理者報表查詢狀態失敗:", error);
        }
    }
    if (dashboard.role === "developer" && ensureDeveloperAuditState().queried) {
        const auditState = ensureDeveloperAuditState();
        try {
            const auditResult = await requestJson("/api/browser/developer/audit-logs/query", {
                method: "POST",
                body: {
                    ...auditState.filters,
                    limit: Number(auditState.filters.limit) || 100
                },
                auth: true
            });
            state.developerAudit = {
                filters: {
                    ...createDefaultDeveloperAuditState().filters,
                    ...(auditResult.data?.filters || auditState.filters || {})
                },
                logs: Array.isArray(auditResult.data?.logs) ? auditResult.data.logs : [],
                total: Number(auditResult.data?.total || 0),
                queried: true
            };
        } catch (error) {
            console.error("Failed to refresh developer audit logs:", error);
        }
    }
    renderDashboard(dashboard);
    if (message) setMessage(ui.dashboardMessage, message, type);
}

async function pickAutomationExportDirectory(defaultPath = "") {
    try {
        const result = await requestJson("/api/browser/developer/automation-export-directory/select", {
            method: "POST",
            body: { defaultPath },
            auth: true
        });
        return result.data?.path || "";
    } catch (error) {
        if (String(error?.message || "").includes("取消")) return "";
        throw error;
    }
}

async function pickAuditArchiveDirectory(defaultPath = "") {
    try {
        const result = await requestJson("/api/browser/developer/audit-archive-directory/select", {
            method: "POST",
            body: { defaultPath },
            auth: true
        });
        return result.data?.path || "";
    } catch (error) {
        if (String(error?.message || "").includes("取消")) return "";
        throw error;
    }
}

function closeRealtimeSync() {
    if (state.syncEventSource) {
        state.syncEventSource.close();
        state.syncEventSource = null;
    }
}

function getRealtimeSyncLabel(type) {
    if (type === "employees") return "員工資料";
    if (type === "punchRecords") return "打卡紀錄";
    if (type === "shifts") return "班別設定";
    if (type === "displaySettings") return "主畫面資料設定";
    if (type === "adminPassword") return "管理者密碼";
    if (type === "greetings") return "問候語";
    if (type === "bellSchedules") return "響鈴場景";
    if (type === "customSounds") return "聲音庫";
    if (type === "bellHistory") return "響鈴歷史";
    if (type === "specialEffects") return "節日特效";
    if (type === "themeSchedules") return "主題排程";
    if (type === "customThemes") return "自訂主題";
    if (type === "automationTasks") return "自動化任務";
    if (type === "automationLog") return "自動化日誌";
    if (type === "systemPassword") return "系統密碼";
    if (type === "automationExportDirectory") return "自動化匯出資料夾";
    if (type === "attendanceExportSettings") return "考勤報表匯出欄位設定";
    return type;
}

async function handleRealtimeSyncMessage(payload) {
    const type = String(payload?.type || "");
    const employeeSyncTypes = new Set(["displaySettings"]);
    const adminSyncTypes = new Set([
        "employees",
        "punchRecords",
        "shifts",
        "displaySettings",
        "adminPassword",
        "greetings",
        "bellSchedules",
        "customSounds",
        "bellHistory",
        "specialEffects",
        "themeSchedules",
        "customThemes"
    ]);
    const developerSyncTypes = new Set(["automationTasks", "automationLog", "systemPassword", "automationExportDirectory", "databaseBackup", "systemHealth", "attendanceExportSettings", "displaySettings"]);
    if (!state.dashboard) return;
    if (payload.origin === "browser" && payload.sessionToken && payload.sessionToken === state.token) return;

    const role = state.dashboard.role;
    const shouldReload = (role === "employee" && employeeSyncTypes.has(type))
        || (role === "admin" && adminSyncTypes.has(type))
        || (role === "developer" && developerSyncTypes.has(type));
    if (!shouldReload) return;

    try {
        await reloadDashboard(`已同步${getRealtimeSyncLabel(type)}最新內容。`, "info");
    } catch (error) {
        console.error("即時同步失敗:", error);
    }
}

function initializeRealtimeSync() {
    closeRealtimeSync();
    if (!state.token) return;

    const eventSource = new EventSource(`/api/browser/events?token=${encodeURIComponent(state.token)}`);
    eventSource.onmessage = (event) => {
        try {
            const payload = JSON.parse(event.data || "{}");
            handleRealtimeSyncMessage(payload);
        } catch (error) {
            console.error("解析即時同步事件失敗:", error);
        }
    };
    eventSource.onerror = () => {
        if (!state.token) {
            closeRealtimeSync();
        }
    };

    state.syncEventSource = eventSource;
}

function renderStatsGrid(summary, labels, options = {}) {
    const clickableKeys = new Set(options.clickableKeys || []);
    const subtitles = options.subtitles || {};
    return `
        <div class="stats-grid">
            ${Object.entries(summary).filter(([key]) => key !== "lastPunch").map(([key, value]) => {
                const isClickable = clickableKeys.has(key);
                const TagName = isClickable ? "button" : "div";
                return `
                <${TagName} class="stat-card ${isClickable ? "stat-card-button" : ""}" ${isClickable ? `type="button" data-insight-key="${escapeHtml(key)}"` : ""}>
                    <p class="stat-label">${escapeHtml(labels[key] || key)}</p>
                    <p class="stat-value">${escapeHtml(value ?? "-")}</p>
                    ${subtitles[key] ? `<p class="stat-subtext">${escapeHtml(subtitles[key])}</p>` : ""}
                </${TagName}>
            `;
            }).join("")}
        </div>
    `;
}

function buildInfoGrid(user) {
    return `
        <div class="info-grid">
            <div><dt>工號</dt><dd>${escapeHtml(user.id || "-")}</dd></div>
            <div><dt>姓名</dt><dd>${escapeHtml(user.name || "-")}</dd></div>
            <div><dt>部門</dt><dd>${escapeHtml(user.department || "-")}</dd></div>
            <div><dt>職稱</dt><dd>${escapeHtml(user.job_title || "-")}</dd></div>
            <div><dt>性別</dt><dd>${escapeHtml(user.gender || "-")}</dd></div>
            <div><dt>國籍</dt><dd>${escapeHtml(user.nationality || "-")}</dd></div>
        </div>
    `;
}

function buildKeyValueGrid(items) {
    return `
        <div class="info-grid">
            ${items.map((item) => `
                <div>
                    <dt>${escapeHtml(item.label)}</dt>
                    <dd>${item.mono ? `<span class="mono-text">${escapeHtml(item.value ?? "-")}</span>` : escapeHtml(item.value ?? "-")}</dd>
                </div>
            `).join("")}
        </div>
    `;
}

function buildEmployeePrivateInfoGrid(user) {
    return buildKeyValueGrid([
        { label: "身分證字號", value: user.national_id || "-", mono: true },
        { label: "銀行帳戶號碼", value: user.bank_account || "-", mono: true },
        { label: "聯絡手機", value: user.mobile_phone || "-", mono: true },
        { label: "緊急聯絡人", value: user.emergency_contact || "-" },
        { label: "緊急聯絡電話", value: user.emergency_phone || "-", mono: true },
        { label: "聯絡地址", value: user.contact_address || "-" },
        { label: "戶籍地址", value: user.registered_address || "-" },
        { label: "家庭概況", value: user.family_status || "-" },
        { label: "備註", value: user.notes || "-" }
    ]);
}

function renderRecords(records) {
    if (!records.length) {
        return `<div class="record-empty">近 7 日尚無打卡紀錄。</div>`;
    }

    return `
        <div class="record-list">
            ${records.map((record) => `
                <div class="record-item">
                    <div class="record-topline">
                        <span>${escapeHtml(record.dateText)} ${escapeHtml(record.timeText)}</span>
                        <span class="record-status">${escapeHtml(record.statusText)}</span>
                    </div>
                    <div class="record-subline">班別：${escapeHtml(record.shift || "-")}，來源：${escapeHtml(record.sourceText)}</div>
                </div>
            `).join("")}
        </div>
    `;
}

function renderSuggestions(items) {
    return `
        <div class="suggest-grid">
            ${items.map((item) => `
                <article class="suggest-card">
                    <h3>${escapeHtml(item.title)}</h3>
                    <p>${escapeHtml(item.description)}</p>
                </article>
            `).join("")}
        </div>
    `;
}

function renderSuggestionList(items = []) {
    if (!items.length) return renderEmptyState("目前沒有工作台說明。");
    return `
        <div class="record-list">
            ${items.map((item) => `
                <article class="list-item">
                    <div class="list-item-top">
                        <span>${escapeHtml(item.title)}</span>
                    </div>
                    <div class="record-subline">${escapeHtml(item.description)}</div>
                </article>
            `).join("")}
        </div>
    `;
}

function syncDashboardHelpButton(dashboard = state.dashboard) {
    if (!ui.dashboardHelpBtn) return;
    const canShow = ["admin", "developer", "system_admin"].includes(dashboard?.role) && Array.isArray(dashboard.suggestions) && dashboard.suggestions.length > 0;
    ui.dashboardHelpBtn.classList.toggle("hidden", !canShow);
}

function syncDashboardIdentityPill(dashboard = state.dashboard) {
    if (!ui.dashboardIdentityPill) return;
    if (!dashboard) {
        ui.dashboardIdentityPill.textContent = "";
        ui.dashboardIdentityPill.classList.add("hidden");
        return;
    }
    const roleLabel = auditRoleLabels[dashboard.role] || dashboard.role || "";
    const userLabel = dashboard.user?.name || dashboard.user?.id || "";
    ui.dashboardIdentityPill.textContent = `${roleLabel}：${userLabel}`;
    ui.dashboardIdentityPill.classList.remove("hidden");
}

function syncDashboardVersionPill(dashboard = state.dashboard) {
    if (!ui.dashboardVersionPill) return;
    const version = String(dashboard?.appVersion || dashboard?.datasets?.systemHealth?.appVersion || "").trim();
    if (!version) {
        ui.dashboardVersionPill.textContent = "";
        ui.dashboardVersionPill.removeAttribute("title");
        ui.dashboardVersionPill.classList.add("hidden");
        return;
    }
    const normalizedVersion = version.replace(/^v/i, "");
    ui.dashboardVersionPill.textContent = `v${normalizedVersion}`;
    ui.dashboardVersionPill.title = `目前版本 v${normalizedVersion}`;
    ui.dashboardVersionPill.classList.remove("hidden");
}

function openDashboardHelpModal() {
    if (!ui.dashboardHelpModal || !state.dashboard) return;
    ui.dashboardHelpTitle.textContent = state.dashboard.role === "developer"
        ? "開發人員工作台說明"
        : state.dashboard.role === "admin"
            ? "管理者工作台說明"
            : "工作台說明";
    const suggestions = state.dashboard.role === "admin"
        ? [
            ...(state.dashboard.suggestions || []),
            {
                title: "安全設定",
                description: "可控管遠端打卡是否必須綁定裝置、是否要求 GPS 定位，以及允許的定位精度。啟用裝置綁定後，員工瀏覽器登入會綁定指定裝置；要求 GPS 時，打卡必須提供定位且精度需在設定範圍內。管理者也可查看員工綁定裝置、最近登入 IP/GPS 與風險打卡紀錄，必要時解除或清除綁定。"
            },
            {
                title: "員工 CSV 匯入 / 匯出",
                description: "匯出 CSV 會匯出完整員工名冊，不受目前搜尋、部門篩選或顯示筆數影響。匯入 CSV 會讀取標題列並合併到現有名冊：同工號更新、卡號相同則更新原持卡員工，新工號且卡號不重複則新增；缺少工號、姓名、部門、卡號或密碼的列會跳過。匯入不會刪除 CSV 未出現的既有員工，合併後若仍有重複卡號會阻止存入。"
            }
        ]
        : (state.dashboard.suggestions || []);
    ui.dashboardHelpContent.innerHTML = renderSuggestionList(suggestions);
    ui.dashboardHelpModal.classList.remove("hidden");
}

function closeDashboardHelpModal() {
    ui.dashboardHelpModal?.classList.add("hidden");
}

function renderWorkspaceSummaryHelpContent(description) {
    const paragraphs = String(description || "")
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
    if (!paragraphs.length) return renderEmptyState("目前沒有額外說明。");
    return `
        <div class="workspace-summary-help-content">
            ${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
        </div>
    `;
}

function openWorkspaceSummaryHelpModal(title, description) {
    if (!ui.dashboardHelpModal) return;
    ui.dashboardHelpTitle.textContent = `${title || "頁籤"}說明`;
    ui.dashboardHelpContent.innerHTML = renderWorkspaceSummaryHelpContent(description);
    ui.dashboardHelpModal.classList.remove("hidden");
}

function closeDashboardInsightModal() {
    ui.dashboardInsightModal?.classList.add("hidden");
    state.activeInsightKey = "";
}

function getAdminDashboardInsights(dashboard = state.dashboard) {
    return dashboard?.insights || {};
}

function getAdminScopeDepartments(dashboard = state.dashboard) {
    const employees = dashboard?.datasets?.employees || [];
    return [...new Set(employees.map((employee) => String(employee.department || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-Hant"));
}

function isActiveRosterEmployee(employee, today = formatDateInputValue(new Date())) {
    const terminationDate = String(employee.termination_date || "").trim();
    return !terminationDate || terminationDate >= today;
}

function getAdminMonitoredEmployees(dashboard = state.dashboard) {
    const employees = dashboard?.datasets?.employees || [];
    const scope = state.adminDashboardScope || createDefaultAdminDashboardScope();
    if (scope.mode === "active") return employees.filter((employee) => isActiveRosterEmployee(employee));
    if (scope.mode === "department") {
        return employees.filter((employee) => String(employee.department || "").trim() === scope.department);
    }
    if (scope.mode === "manual") {
        const selectedIds = new Set(scope.employeeIds || []);
        return employees.filter((employee) => selectedIds.has(employee.id));
    }
    return employees;
}

function getAdminMonitorScopeLabel(dashboard = state.dashboard) {
    const scope = state.adminDashboardScope || createDefaultAdminDashboardScope();
    const count = getAdminMonitoredEmployees(dashboard).length;
    if (scope.mode === "active") return `監測在職員工 ${count} 人`;
    if (scope.mode === "department") return `監測部門「${scope.department || "未選擇"}」${count} 人`;
    if (scope.mode === "manual") return `手動監測 ${count} 人`;
    return `監測全部員工 ${count} 人`;
}

function getScopedAttendanceSummary(dashboard = state.dashboard) {
    const insights = getAdminDashboardInsights(dashboard);
    const monitoredEmployees = getAdminMonitoredEmployees(dashboard);
    const monitoredIds = new Set(monitoredEmployees.map((employee) => employee.id));
    const attendance = insights.todayAttendance || {};
    const records = Array.isArray(attendance.records) ? attendance.records : [];
    const normalRecords = records.filter((record) => monitoredIds.has(record.id) && record.isNormal);
    const abnormalRecords = records.filter((record) => monitoredIds.has(record.id) && record.isAbnormal);
    const normalIds = new Set(normalRecords.map((record) => record.id));
    const recordIds = new Set(records.filter((record) => monitoredIds.has(record.id)).map((record) => record.id));
    const failureLogs = (attendance.failureLogs || []).filter((log) => {
        const employeeId = log.targetId || log.actorId || "";
        return !employeeId || monitoredIds.has(employeeId);
    });
    const normalEmployees = monitoredEmployees.filter((employee) => normalIds.has(employee.id));
    const missingEmployees = monitoredEmployees.filter((employee) => !recordIds.has(employee.id));
    return {
        monitoredEmployees,
        normalEmployees,
        missingEmployees,
        normalRecords,
        abnormalRecords,
        failureLogs
    };
}

function getScheduleDayText(days) {
    return String(Array.isArray(days) ? days.join(",") : days || "")
        .split(",")
        .map((day) => day.trim())
        .filter(Boolean)
        .map((day) => dayLabels[Number(day)] || day)
        .join("、") || "-";
}

const dataTableDensityState = {
    frame: 0,
    canvas: typeof document !== "undefined" ? document.createElement("canvas") : null
};

function getDataTableMeasureContext() {
    return dataTableDensityState.canvas?.getContext?.("2d") || null;
}

function normalizeColumnWidthText(value) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim();
}

function getFormControlWidthText(control) {
    if (!control) return "";
    const tagName = control.tagName;
    if (tagName === "SELECT") {
        return Array.from(control.options || [])
            .map((option) => option.textContent || option.value || "")
            .sort((left, right) => right.length - left.length)[0] || "";
    }
    if (tagName === "TEXTAREA" || tagName === "INPUT") {
        return control.value || control.getAttribute("placeholder") || "";
    }
    return control.textContent || "";
}

function getCellWidthText(cell) {
    if (!cell) return "";
    const controls = Array.from(cell.querySelectorAll("input, select, textarea, button"));
    if (controls.length) {
        return controls.map(getFormControlWidthText).join("  ");
    }
    return cell.textContent || "";
}

function measureCellContentWidth(cell) {
    const context = getDataTableMeasureContext();
    const styles = window.getComputedStyle(cell);
    const text = normalizeColumnWidthText(getCellWidthText(cell));
    const padding = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
    const border = (parseFloat(styles.borderLeftWidth) || 0) + (parseFloat(styles.borderRightWidth) || 0);
    const visualBuffer = cell.matches("td.actions, .actions") ? 28 : 18;
    if (!context) {
        return Math.max(cell.scrollWidth || 0, cell.offsetWidth || 0, padding + border + visualBuffer);
    }

    context.font = styles.font || `${styles.fontWeight || "400"} ${styles.fontSize || "14px"} ${styles.fontFamily || "sans-serif"}`;
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const candidates = lines.length ? lines : [text || "MM"];
    const textWidth = Math.max(...candidates.map((line) => context.measureText(line).width), 0);
    return textWidth + padding + border + visualBuffer;
}

function getColumnWidthLimits(table, columnIndex) {
    const cells = Array.from(table.querySelectorAll("tr"))
        .map((row) => row.cells?.[columnIndex])
        .filter(Boolean);
    const hasActions = cells.some((cell) => cell.matches("td.actions, .actions") || cell.querySelector("button"));
    const hasMultiline = cells.some((cell) => cell.matches(".multiline-cell") || cell.querySelector("textarea"));
    if (hasActions) return { min: 108, max: 280 };
    if (hasMultiline) return { min: 150, max: 420 };
    return { min: 72, max: 340 };
}

function fitDataTableColumnsForTable(table) {
    if (!table?.rows?.length) return;
    const columnCount = Math.max(...Array.from(table.rows).map((row) => row.cells.length), 0);
    if (!columnCount) return;

    let colgroup = table.querySelector(":scope > colgroup[data-density-columns]");
    if (!colgroup) {
        colgroup = document.createElement("colgroup");
        colgroup.dataset.densityColumns = "true";
        table.prepend(colgroup);
    }

    while (colgroup.children.length < columnCount) colgroup.appendChild(document.createElement("col"));
    while (colgroup.children.length > columnCount) colgroup.lastElementChild.remove();

    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
        const columnCells = Array.from(table.querySelectorAll("tr"))
            .map((row) => row.cells?.[columnIndex])
            .filter((cell) => cell && cell.colSpan === 1);
        const measured = Math.max(...columnCells.map(measureCellContentWidth), 0);
        const limits = getColumnWidthLimits(table, columnIndex);
        const width = Math.min(Math.max(Math.ceil(measured * 1.1), limits.min), limits.max);
        const col = colgroup.children[columnIndex];
        col.style.width = `${width}px`;
    }

    table.dataset.columnFit = "ready";
}

function fitDataTableColumns(root = document) {
    const tables = root?.matches?.("table.data-table")
        ? [root]
        : Array.from(root?.querySelectorAll?.("table.data-table") || []);
    tables.forEach(fitDataTableColumnsForTable);
}

function scheduleDataTableColumnFit(root = document) {
    if (dataTableDensityState.frame) window.cancelAnimationFrame(dataTableDensityState.frame);
    dataTableDensityState.frame = window.requestAnimationFrame(() => {
        dataTableDensityState.frame = 0;
        fitDataTableColumns(root);
    });
}

function renderInsightTable(headers, rows, emptyText = "目前沒有資料。") {
    if (!rows.length) return renderEmptyState(emptyText);
    return `
        <div class="data-table-wrap insight-table-wrap">
            <table class="data-table">
                <thead>
                    <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
                </thead>
                <tbody>${rows.join("")}</tbody>
            </table>
        </div>
    `;
}

function renderInsightEmployeeTable(employees, emptyText = "目前沒有符合條件的員工。") {
    return renderInsightTable(["工號", "姓名", "部門", "職稱", "狀態"], employees.map((employee) => `
        <tr>
            <td>${escapeHtml(employee.id || "-")}</td>
            <td>${escapeHtml(employee.name || "-")}</td>
            <td>${escapeHtml(employee.department || "-")}</td>
            <td>${escapeHtml(employee.job_title || "-")}</td>
            <td>${escapeHtml(isActiveRosterEmployee(employee) ? "在職" : "離職")}</td>
        </tr>
    `), emptyText);
}

function renderAdminInsightScopeControls(dashboard = state.dashboard) {
    const scope = state.adminDashboardScope || createDefaultAdminDashboardScope();
    const departments = getAdminScopeDepartments(dashboard);
    const employees = dashboard?.datasets?.employees || [];
    const selectedIds = new Set(scope.employeeIds || []);
    return `
        <section class="insight-section">
            <div class="insight-section-header">
                <div>
                    <h3>監測人員範圍</h3>
                    <p class="helper-text">${escapeHtml(getAdminMonitorScopeLabel(dashboard))}</p>
                </div>
            </div>
            <div class="field-grid three dense-form">
                <label class="field">
                    <span>來源</span>
                    <select id="admin-insight-scope-mode">
                        <option value="all" ${scope.mode === "all" ? "selected" : ""}>全部員工</option>
                        <option value="active" ${scope.mode === "active" ? "selected" : ""}>在職員工</option>
                        <option value="department" ${scope.mode === "department" ? "selected" : ""}>指定部門</option>
                        <option value="manual" ${scope.mode === "manual" ? "selected" : ""}>手動選取</option>
                    </select>
                </label>
                <label class="field">
                    <span>部門</span>
                    <select id="admin-insight-scope-department" ${scope.mode !== "department" ? "disabled" : ""}>
                        <option value="">選擇部門</option>
                        ${departments.map((department) => `<option value="${escapeHtml(department)}" ${scope.department === department ? "selected" : ""}>${escapeHtml(department)}</option>`).join("")}
                    </select>
                </label>
                <div class="status-box">
                    <strong>${escapeHtml(getAdminMonitoredEmployees(dashboard).length)}</strong>
                    <span>目前納入今日出勤監測的人數</span>
                </div>
            </div>
            ${scope.mode === "manual" ? `
                <div class="employee-column-grid insight-employee-picker">
                    ${employees.map((employee) => `
                        <label class="employee-column-option">
                            <input type="checkbox" class="admin-insight-employee-toggle" value="${escapeHtml(employee.id)}" ${selectedIds.has(employee.id) ? "checked" : ""}>
                            <span>${escapeHtml(employee.id || "-")} / ${escapeHtml(employee.name || "-")}</span>
                        </label>
                    `).join("")}
                </div>
            ` : ""}
        </section>
    `;
}

function renderAdminEmployeeInsight(dashboard = state.dashboard) {
    return `
        ${renderAdminInsightScopeControls(dashboard)}
        <section class="insight-section">
            <div class="insight-section-header">
                <h3>員工名冊來源</h3>
                ${renderBadge(getAdminMonitorScopeLabel(dashboard), "success")}
            </div>
            ${renderInsightEmployeeTable(getAdminMonitoredEmployees(dashboard))}
        </section>
    `;
}

function renderAdminShiftInsight(dashboard = state.dashboard) {
    const insights = getAdminDashboardInsights(dashboard);
    const shifts = insights.shifts?.items || dashboard?.datasets?.shifts || [];
    const currentShift = insights.shifts?.current || null;
    return `
        <section class="insight-section">
            <div class="insight-section-header">
                <div>
                    <h3>目前班別</h3>
                    <p class="helper-text">以現在時間判斷，不代表員工個別排班。</p>
                </div>
                ${renderBadge(currentShift ? `${currentShift.name} ${currentShift.start}-${currentShift.end}` : "未落在任何班別", currentShift ? "success" : "warning")}
            </div>
            ${renderInsightTable(["班別", "開始", "結束", "狀態"], shifts.map((shift) => `
                <tr>
                    <td>${escapeHtml(shift.name || "-")}</td>
                    <td>${escapeHtml(shift.start || "-")}</td>
                    <td>${escapeHtml(shift.end || "-")}</td>
                    <td>${escapeHtml(currentShift?.name === shift.name ? "當前班別" : "-")}</td>
                </tr>
            `), "尚未設定班別。")}
        </section>
    `;
}

function renderAdminTodayNormalInsight(dashboard = state.dashboard) {
    const attendance = getScopedAttendanceSummary(dashboard);
    return `
        ${renderAdminInsightScopeControls(dashboard)}
        <section class="insight-section">
            <div class="insight-section-header">
                <h3>今日出勤狀態</h3>
                <div class="badge-row">
                    ${renderBadge(`正常 ${attendance.normalEmployees.length} 人`, "success")}
                    ${renderBadge(`未打卡 ${attendance.missingEmployees.length} 人`, attendance.missingEmployees.length ? "warning" : "success")}
                </div>
            </div>
            <div class="insight-two-column">
                <div>
                    <h4>已正常打卡員工</h4>
                    ${renderInsightEmployeeTable(attendance.normalEmployees, "目前沒有正常打卡員工。")}
                </div>
                <div>
                    <h4>未打卡員工</h4>
                    ${renderInsightEmployeeTable(attendance.missingEmployees, "目前沒有未打卡員工。")}
                </div>
            </div>
        </section>
    `;
}

function renderAdminAbnormalInsight(dashboard = state.dashboard) {
    const attendance = getScopedAttendanceSummary(dashboard);
    const recordRows = attendance.abnormalRecords.map((record) => `
        <tr>
            <td>${escapeHtml(record.id || "-")}</td>
            <td>${escapeHtml(record.employeeName || "-")}</td>
            <td>${escapeHtml(record.timeText || "-")}</td>
            <td>${escapeHtml(record.typeText || "-")}</td>
            <td>${escapeHtml(record.attendanceStatusText || record.status || "異常")}</td>
            <td>${escapeHtml(record.sourceText || "-")}</td>
        </tr>
    `);
    const failureRows = attendance.failureLogs.map((log) => `
        <tr>
            <td>${escapeHtml(log.targetId || log.actorId || "-")}</td>
            <td>${escapeHtml(log.actorName || "-")}</td>
            <td>${escapeHtml(log.timestampText || "-")}</td>
            <td>${escapeHtml(log.failureCode || "-")}</td>
            <td>${escapeHtml(log.reason || log.summary || "-")}</td>
        </tr>
    `);
    return `
        <section class="insight-section">
            <div class="insight-section-header">
                <h3>今日異常打卡資料</h3>
                <div class="badge-row">
                    ${renderBadge(`異常紀錄 ${attendance.abnormalRecords.length} 筆`, attendance.abnormalRecords.length ? "warning" : "success")}
                    ${renderBadge(`失敗稽核 ${attendance.failureLogs.length} 筆`, attendance.failureLogs.length ? "warning" : "success")}
                </div>
            </div>
            <h4>已寫入的異常打卡紀錄</h4>
            ${renderInsightTable(["工號", "姓名", "時間", "類型", "狀態", "來源"], recordRows, "今日沒有異常打卡紀錄。")}
            <h4>未成功寫入的打卡失敗稽核</h4>
            ${renderInsightTable(["工號", "姓名", "時間", "代碼", "原因"], failureRows, "今日沒有打卡失敗稽核。")}
        </section>
    `;
}

function renderAdminBellInsight(dashboard = state.dashboard) {
    const bells = getAdminDashboardInsights(dashboard).bells || {};
    const schedules = bells.schedules || dashboard?.datasets?.bellSchedules || [];
    const next = bells.nextSchedule || null;
    return `
        <section class="insight-section">
            <div class="insight-section-header">
                <div>
                    <h3>下一個響鈴</h3>
                    <p class="helper-text">${next ? `${next.nextDateText} ${next.nextTimeText} / ${next.title}` : "目前沒有可用的啟用排程。"}</p>
                </div>
                <div class="badge-row">
                    ${renderBadge(`啟用 ${bells.enabledCount || 0} 組`, "success")}
                    ${renderBadge(`全部 ${bells.totalCount || schedules.length} 組`)}
                </div>
            </div>
            ${renderInsightTable(["名稱", "時間", "星期", "秒數", "狀態"], schedules.map((schedule) => `
                <tr>
                    <td>${escapeHtml(schedule.title || "-")}</td>
                    <td>${escapeHtml(schedule.time || "-")}</td>
                    <td>${escapeHtml(getScheduleDayText(schedule.days))}</td>
                    <td>${escapeHtml(schedule.duration || "-")}</td>
                    <td>${escapeHtml(schedule.enabled ? "啟用" : "停用")}</td>
                </tr>
            `), "尚未建立響鈴排程。")}
        </section>
    `;
}

function renderAdminGreetingInsight(dashboard = state.dashboard) {
    const datasets = dashboard?.datasets || {};
    const employeeMap = new Map((datasets.employees || []).map((employee) => [employee.id, employee]));
    const greetings = getAdminDashboardInsights(dashboard).greetings?.items || datasets.greetings || [];
    return `
        <section class="insight-section">
            <div class="insight-section-header">
                <h3>問候語狀態</h3>
                ${renderBadge(`問候語 ${greetings.length} 則`, "success")}
            </div>
            ${renderInsightTable(["類型", "對象", "內容"], greetings.map((greeting) => {
                const employee = employeeMap.get(greeting.employee_id);
                return `
                    <tr>
                        <td>${escapeHtml(greeting.type || "-")}</td>
                        <td>${escapeHtml(employee ? `${employee.id} / ${employee.name}` : "全體或未指定")}</td>
                        <td>${escapeHtml(greeting.message || "-")}</td>
                    </tr>
                `;
            }), "尚未設定問候語。")}
        </section>
    `;
}

function renderAdminThemeInsight(dashboard = state.dashboard) {
    const themes = getAdminDashboardInsights(dashboard).themes || {};
    return `
        <section class="insight-section">
            <div class="insight-section-header">
                <h3>主題與特效狀態</h3>
                <div class="badge-row">
                    ${renderBadge(`自訂主題 ${themes.customThemeCount || 0} 組`, "success")}
                    ${renderBadge(`主題排程 ${(themes.themeSchedules || []).length} 組`)}
                    ${renderBadge(`節日特效 ${(themes.specialEffects || []).length} 組`)}
                </div>
            </div>
            <h4>自訂主題</h4>
            ${renderInsightTable(["名稱", "識別"], (themes.customThemes || []).map((theme) => `
                <tr><td>${escapeHtml(theme.name || "-")}</td><td>${escapeHtml(theme.id || "-")}</td></tr>
            `), "尚未建立自訂主題。")}
            <h4>主題排程</h4>
            ${renderInsightTable(["名稱", "主題", "起日", "迄日", "狀態"], (themes.themeSchedules || []).map((schedule) => `
                <tr>
                    <td>${escapeHtml(schedule.name || "-")}</td>
                    <td>${escapeHtml(schedule.theme_name || "-")}</td>
                    <td>${escapeHtml(schedule.start_date || "-")}</td>
                    <td>${escapeHtml(schedule.end_date || "-")}</td>
                    <td>${escapeHtml(schedule.enabled ? "啟用" : "停用")}</td>
                </tr>
            `), "尚未建立主題排程。")}
        </section>
    `;
}

function getAdminInsightTitle(key) {
    return {
        employeeCount: "員工數量明細",
        shiftCount: "班別數量明細",
        todayPunchCount: "今日正常打卡明細",
        todayAbnormalPunchCount: "今日異常打卡明細",
        bellScheduleCount: "響鈴排程明細",
        greetingCount: "問候語明細",
        customThemeCount: "自訂主題明細"
    }[key] || "儀表板明細";
}

function renderAdminDashboardInsightContent(key, dashboard = state.dashboard) {
    if (key === "employeeCount") return renderAdminEmployeeInsight(dashboard);
    if (key === "shiftCount") return renderAdminShiftInsight(dashboard);
    if (key === "todayPunchCount") return renderAdminTodayNormalInsight(dashboard);
    if (key === "todayAbnormalPunchCount") return renderAdminAbnormalInsight(dashboard);
    if (key === "bellScheduleCount") return renderAdminBellInsight(dashboard);
    if (key === "greetingCount") return renderAdminGreetingInsight(dashboard);
    if (key === "customThemeCount") return renderAdminThemeInsight(dashboard);
    return renderEmptyState("目前沒有這張卡片的明細資料。");
}

function refreshAdminDashboardInsightModal() {
    if (!state.activeInsightKey || !ui.dashboardInsightModal || ui.dashboardInsightModal.classList.contains("hidden")) return;
    ui.dashboardInsightTitle.textContent = getAdminInsightTitle(state.activeInsightKey);
    ui.dashboardInsightContent.innerHTML = renderAdminDashboardInsightContent(state.activeInsightKey);
    scheduleDataTableColumnFit(ui.dashboardInsightContent);
}

function openAdminDashboardInsight(key) {
    if (state.dashboard?.role !== "admin") return;
    state.activeInsightKey = key;
    ui.dashboardInsightTitle.textContent = getAdminInsightTitle(key);
    ui.dashboardInsightContent.innerHTML = renderAdminDashboardInsightContent(key);
    ui.dashboardInsightModal?.classList.remove("hidden");
    scheduleDataTableColumnFit(ui.dashboardInsightContent);
}

function buildAdminDashboardStatModel(dashboard = state.dashboard) {
    const insights = getAdminDashboardInsights(dashboard);
    const attendance = getScopedAttendanceSummary(dashboard);
    const bells = insights.bells || {};
    const currentShift = insights.shifts?.current || null;
    const nextBell = bells.nextSchedule || null;
    const summary = {
        ...(dashboard?.summary || {}),
        employeeCount: attendance.monitoredEmployees.length,
        todayPunchCount: attendance.normalEmployees.length,
        todayAbnormalPunchCount: attendance.abnormalRecords.length + attendance.failureLogs.length,
        bellScheduleCount: `${bells.enabledCount ?? dashboard?.summary?.bellScheduleCount ?? 0}/${bells.totalCount ?? dashboard?.summary?.bellScheduleCount ?? 0}`
    };
    return {
        summary,
        subtitles: {
            employeeCount: getAdminMonitorScopeLabel(dashboard),
            shiftCount: currentShift ? `當前：${currentShift.name}` : "目前未落在班別",
            todayPunchCount: `未打卡 ${attendance.missingEmployees.length} 人`,
            todayAbnormalPunchCount: attendance.failureLogs.length ? `含失敗稽核 ${attendance.failureLogs.length} 筆` : "點擊查看異常來源",
            bellScheduleCount: nextBell ? `下一個：${nextBell.title} ${nextBell.nextTimeText}` : "沒有下一個啟用響鈴",
            greetingCount: "點擊查看問候語對象",
            customThemeCount: "點擊查看主題排程"
        },
        clickableKeys: ["employeeCount", "shiftCount", "todayPunchCount", "todayAbnormalPunchCount", "bellScheduleCount", "greetingCount", "customThemeCount"]
    };
}

function renderOptions(items, { valueKey = "id", labelFn, selectedValue = "" } = {}) {
    return items.map((item) => {
        const value = item[valueKey];
        const label = labelFn ? labelFn(item) : item.name;
        const selected = String(value) === String(selectedValue) ? "selected" : "";
        return `<option value="${escapeHtml(value)}" ${selected}>${escapeHtml(label)}</option>`;
    }).join("");
}

function renderEmptyState(text) {
    return `<div class="empty-state">${escapeHtml(text)}</div>`;
}

function renderBadge(text, type = "") {
    return `<span class="badge ${type}">${escapeHtml(text)}</span>`;
}

function renderEmployeeDashboard(dashboard) {
    const lastPunchText = dashboard.summary.lastPunch
        ? `${dashboard.summary.lastPunch.dateText} ${dashboard.summary.lastPunch.timeText} ${dashboard.summary.lastPunch.statusText}`
        : "目前尚無打卡紀錄";

    return `
        <div class="dashboard-layout employee-layout">
            <article class="info-card">
                <h3>員工資訊</h3>
                <p class="hero-copy">這裡會顯示目前登入員工的資料與近況摘要。</p>
                ${buildInfoGrid(dashboard.user)}
                ${renderStatsGrid(dashboard.summary, {
                    todayRecordCount: "今日紀錄數",
                    validRecordCount: "有效打卡數",
                    weekRecordCount: "近 7 日紀錄",
                    currentShiftName: "目前班別",
                    nextPunchType: "下一筆預計"
                })}
            </article>

            <article class="clock-panel">
                <h3>目前時間</h3>
                <p id="employee-live-clock" class="clock-time">--:--:--</p>
                <p id="employee-clock-subtext" class="clock-subtext"></p>
                <div class="quick-actions">
                    <button data-action="employee-punch" class="primary-btn" type="button">${escapeHtml(dashboard.punchAction.label)}</button>
                    <button data-action="refresh-dashboard" class="secondary-btn" type="button">重新整理</button>
                </div>
                <p class="punch-note">最近一筆：${escapeHtml(lastPunchText)}</p>
            </article>

            <article class="info-card" style="grid-column: 1 / -1;">
                <h3>私人資訊</h3>
                <p class="hero-copy">以下資料僅供目前登入的員工本人查看。</p>
                ${buildEmployeePrivateInfoGrid(dashboard.user)}
            </article>

            <article class="record-card" style="grid-column: 1 / -1;">
                <h3>近 7 日打卡紀錄</h3>
                <p class="hero-copy">顯示今天與前 6 天的全部打卡結果，包含正常與重複打卡紀錄。</p>
                ${renderRecords(dashboard.recentRecords)}
            </article>
        </div>
    `;
}

function buildEmployeeDirectoryDepartmentOptions(employees, selectedDepartment = "") {
    return Array.from(new Set(
        (employees || [])
            .map((employee) => String(employee.department || "").trim())
            .filter(Boolean)
    ))
        .sort((left, right) => left.localeCompare(right, "zh-Hant"))
        .map((department) => `<option value="${escapeHtml(department)}" ${department === selectedDepartment ? "selected" : ""}>${escapeHtml(department)}</option>`)
        .join("");
}

function filterAdminEmployees(employees) {
    const filters = ensureAdminPeopleFilters();
    const keyword = String(filters.query || "").trim().toLowerCase();
    const department = String(filters.department || "").trim();

    return (employees || []).filter((employee) => {
        if (department && String(employee.department || "").trim() !== department) {
            return false;
        }
        if (!keyword) return true;

        const searchableText = [
            employee.id,
            employee.name,
            employee.gender,
            employee.nationality,
            employee.department,
            employee.job_title,
            employee.card,
            employee.national_id,
            employee.notes,
            employee.bank_account,
            employee.mobile_phone,
            employee.emergency_contact,
            employee.emergency_phone,
            employee.contact_address,
            employee.registered_address,
            employee.family_status
        ]
            .map((value) => String(value || "").toLowerCase())
            .join(" ");

        return searchableText.includes(keyword);
    });
}

function getSupervisorDepartmentsForEmployee(employeeId, datasets = getDatasets()) {
    const routes = datasets?.leave?.approvalRoutes || [];
    return routes
        .filter((route) => route.enabled !== false && String(route.supervisor_id || route.supervisorId || "").trim() === String(employeeId || "").trim())
        .map((route) => String(route.department || "").trim())
        .filter(Boolean);
}

function renderEmployeeNameWithSupervisorHint(employee) {
    const departments = getSupervisorDepartmentsForEmployee(employee.id);
    const nameText = escapeHtml(employee.name || "-");
    if (!departments.length) return nameText;
    const departmentText = departments.slice(0, 3).join("、");
    const overflowText = departments.length > 3 ? ` 等 ${departments.length} 個部門` : "";
    return `
        <div class="employee-name-stack">
            <span>${nameText}</span>
            <span class="supervisor-hint">請假主管：${escapeHtml(departmentText)}${escapeHtml(overflowText)}</span>
        </div>
    `;
}

function renderEmployeeRows(employees, visibleRows = "25") {
    if (!employees.length) return renderEmptyState("目前沒有符合條件的員工資料。");
    const tableHeight = visibleRows === "50" ? "48rem" : "32rem";
    const visibleColumns = getActiveEmployeeRosterColumns();

    return `
        <div class="data-table-wrap employee-table-wrap" style="--employee-table-height: ${tableHeight};">
            <table class="data-table">
                <thead>
                    <tr>
                        ${visibleColumns.map((column) => `<th class="${column.cellClass || ""}">${escapeHtml(column.label)}</th>`).join("")}
                        <th class="nowrap-cell">操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${employees.map((employee) => `
                        <tr>
                            ${visibleColumns.map((column) => `<td class="${column.cellClass || ""}">${column.render(employee)}</td>`).join("")}
                            <td class="actions">
                                <div class="table-actions">
                                    <button class="mini-btn" type="button" data-action="edit-employee" data-id="${escapeHtml(employee.id)}">編輯</button>
                                    <button class="mini-btn" type="button" data-action="jump-leave-routes" data-id="${escapeHtml(employee.id)}">主管設定</button>
                                    <button class="mini-btn" type="button" data-action="delete-employee" data-id="${escapeHtml(employee.id)}">刪除</button>
                                </div>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

function renderShiftRows(shifts) {
    const rows = [...shifts];
    while (rows.length < 6) rows.push({ name: "", start: "", end: "" });
    return rows.map((shift, index) => `
        <div class="field-grid three shift-row" data-index="${index}">
            <label class="field"><span>班別名稱</span><input name="shift-name" value="${escapeHtml(shift.name || "")}" placeholder="例如：早班"></label>
            <label class="field"><span>開始時間</span><input name="shift-start" type="time" value="${escapeHtml(shift.start || "")}"></label>
            <label class="field"><span>結束時間</span><input name="shift-end" type="time" value="${escapeHtml(shift.end || "")}"></label>
        </div>
    `).join("");
}

function renderAdminReportRows(reportState) {
    if (!reportState.queried) {
        return renderEmptyState("請先選擇日期區間並查詢考勤報表。");
    }
    if (!reportState.records.length) {
        return renderEmptyState("此條件下沒有查到任何出勤紀錄。");
    }

    return `
        <div class="data-table-wrap">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>工號</th>
                        <th>姓名</th>
                        <th>部門</th>
                        <th>日期</th>
                        <th>時間</th>
                        <th>班別</th>
                        <th>類型</th>
                        <th>狀態</th>
                        <th>請假區段</th>
                        <th>請假時數</th>
                        <th>來源</th>
                    </tr>
                </thead>
                <tbody>
                    ${reportState.records.map((record) => {
                        const leaveWindow = record.recordKind === "leave" && record.leaveStartText
                            ? `${record.leaveStartText || "-"} ~ ${record.leaveEndText || "-"}`
                            : "-";
                        const leaveHours = record.recordKind === "leave" && record.leaveDurationHours !== undefined && record.leaveDurationHours !== null
                            ? `${record.leaveDurationHours} 小時`
                            : "-";
                        return `
                            <tr>
                                <td>${escapeHtml(record.employeeId || "-")}</td>
                                <td>${escapeHtml(record.employeeName || "-")}</td>
                                <td>${escapeHtml(record.department || "-")}</td>
                                <td>${escapeHtml(record.dateText || "-")}</td>
                                <td>${escapeHtml(record.timeText || "-")}</td>
                                <td>${escapeHtml(record.shift || "-")}</td>
                                <td>${escapeHtml(record.typeText || "-")}</td>
                                <td>${escapeHtml(record.attendanceStatusText || "-")}</td>
                                <td>${escapeHtml(leaveWindow)}</td>
                                <td>${escapeHtml(leaveHours)}</td>
                                <td>${escapeHtml(record.sourceText || "-")}</td>
                            </tr>
                        `;
                    }).join("")}
                </tbody>
            </table>
        </div>
    `;
}

function renderAdminReportSection(datasets) {
    const reportState = ensureAdminReportState();
    const selectedEmployeeLabel = reportState.filters.employeeId
        ? `${reportState.filters.employeeId} ${reportState.filters.employeeName || ""}`.trim()
        : "全部員工";
    const employeeOptions = renderOptions(datasets.employees, {
        labelFn: (employee) => `${employee.id} ${employee.name} / ${employee.department || "未設定部門"}`,
        selectedValue: reportState.filters.employeeId
    });

    return `
        <div class="workspace-stack">
            <article class="workspace-card">
                <div class="list-toolbar">
                    <div>
                        <p class="sub-kicker">管理者報表</p>
                        <h3>考勤報表查詢與匯出</h3>
                    </div>
                    <div class="badge-row">
                        ${renderBadge(`員工 ${datasets.employees.length} 人`, "success")}
                        ${renderBadge(`總紀錄 ${reportState.summary?.recordCount ?? 0} 筆`)}
                    </div>
                </div>
                <p class="helper-text">支援查詢全部員工或單一員工在指定日期區間內的出勤資料，查詢完成後可直接匯出目前結果為 CSV。</p>
            </article>

            <article class="sub-panel">
                <h3>查詢條件</h3>
                <form id="attendance-report-form" class="stack-form">
                    <div class="field-grid three">
                        <label class="field">
                            <span>員工範圍</span>
                            <select name="employeeId">
                                <option value="">全部員工</option>
                                ${employeeOptions}
                            </select>
                        </label>
                        <label class="field">
                            <span>開始日期</span>
                            <input name="startDate" type="date" value="${escapeHtml(reportState.filters.startDate || "")}" required>
                        </label>
                        <label class="field">
                            <span>結束日期</span>
                            <input name="endDate" type="date" value="${escapeHtml(reportState.filters.endDate || "")}" required>
                        </label>
                    </div>
                    <div class="form-toolbar">
                        <div class="inline-actions">
                            <button class="primary-btn" type="submit">查詢報表</button>
                            <button class="outline-btn" type="button" data-action="reset-admin-report">重設條件</button>
                        </div>
                        <div class="inline-actions">
                            <button class="secondary-btn" type="button" data-action="export-admin-report">匯出目前結果 CSV</button>
                            <button class="outline-btn" type="button" data-action="export-admin-report" data-template="payroll_leave">匯出薪資請假明細 CSV</button>
                        </div>
                    </div>
                </form>
            </article>

            <article class="workspace-card">
                <div class="list-toolbar">
                    <div>
                        <p class="sub-kicker">查詢摘要</p>
                        <h3>${escapeHtml(selectedEmployeeLabel)} / ${escapeHtml(reportState.filters.startDate)} 至 ${escapeHtml(reportState.filters.endDate)}</h3>
                    </div>
                    <div class="badge-row">
                        ${renderBadge(`正常 ${reportState.summary?.validCount ?? 0} 筆`, "success")}
                        ${renderBadge(`請假 ${reportState.summary?.leaveCount ?? 0} 筆`, reportState.summary?.leaveCount ? "success" : "")}
                        ${renderBadge(`異常 ${reportState.summary?.abnormalCount ?? 0} 筆`, reportState.summary?.abnormalCount ? "warning" : "success")}
                        ${renderBadge(`重複 ${reportState.summary?.duplicateCount ?? 0} 筆`)}
                        ${renderBadge(`上班 ${reportState.summary?.inCount ?? 0} 筆`)}
                        ${renderBadge(`下班 ${reportState.summary?.outCount ?? 0} 筆`)}
                    </div>
                </div>
                ${reportState.queried
                    ? renderStatsGrid(reportState.summary || {}, {
                        recordCount: "查詢筆數",
                        validCount: "正常筆數",
                        leaveCount: "請假筆數",
                        abnormalCount: "異常筆數",
                        duplicateCount: "重複筆數",
                        employeeCount: "涵蓋員工數",
                        inCount: "上班打卡",
                        outCount: "下班打卡"
                    })
                    : `<p class="helper-text">尚未查詢。請先設定日期區間與員工條件，再按「查詢報表」。</p>`}
            </article>

            <article class="table-card">
                <h3>考勤明細</h3>
                ${renderAdminReportRows(reportState)}
            </article>
        </div>
    `;
}

function renderSectionTabs(role, items) {
    const activeSection = state.activeSections[role];
    const orderedItems = orderWorkspaceMainSections(role, items);
    return `
        <div class="section-nav">
            ${orderedItems.map((item) => `
                <button
                    type="button"
                    class="section-tab ${activeSection === item.id ? "active" : ""}"
                    data-action="switch-section"
                    data-role="${role}"
                    data-section="${item.id}"
                >${escapeHtml(item.label)}</button>
            `).join("")}
        </div>
    `;
}

function renderAdminPeopleSection(datasets) {
    const filters = ensureAdminPeopleFilters();
    const filteredEmployees = filterAdminEmployees(datasets.employees);
    const departmentOptions = buildEmployeeDirectoryDepartmentOptions(datasets.employees, filters.department);
    const shiftOptions = renderOptions(datasets.shifts, {
        labelFn: (shift) => `${shift.name} (${shift.start} - ${shift.end})`
    });

    return `
        <div class="workspace-stack">
            <article class="workspace-card">
                <div class="list-toolbar">
                    <div>
                        <p class="sub-kicker">管理者設定</p>
                        <h3>員工資料與班別</h3>
                    </div>
                    <div class="badge-row">
                        ${renderBadge(`員工 ${datasets.employees.length} 人`, "success")}
                        <button class="secondary-btn" type="button" data-action="trigger-employee-import">匯入 CSV</button>
                        <button class="outline-btn" type="button" data-action="export-employees">匯出 CSV</button>
                        ${renderBadge(`班別 ${datasets.shifts.length} 組`)}
                    </div>
                </div>
                <p class="helper-text">可新增、編輯、刪除員工，並維護班別與手動補登。</p>
            </article>

            <article class="sub-panel">
                <h3>員工資料表單</h3>
                <form id="employee-form" class="stack-form">
                    <input type="hidden" name="editingId" value="">
                    <div class="field-grid">
                        <label class="field"><span>工號</span><input name="id" placeholder="工號" required></label>
                        <label class="field"><span>姓名</span><input name="name" placeholder="姓名" required></label>
                        <label class="field"><span>性別</span><input name="gender" placeholder="性別"></label>
                        <label class="field"><span>國籍</span><input name="nationality" placeholder="國籍"></label>
                        <label class="field"><span>部門</span><input name="department" placeholder="部門" required></label>
                        <label class="field"><span>職稱</span><input name="job_title" placeholder="職稱"></label>
                        <label class="field"><span>卡號</span><input name="card" placeholder="卡號" required></label>
                        <label class="field"><span>密碼</span><input name="password" placeholder="密碼" required></label>
                        <label class="field"><span>身分證字號</span><input name="national_id" placeholder="身分證字號"></label>
                        <label class="field"><span>生日</span><input name="birth_date" type="date"></label>
                        <label class="field"><span>到職日</span><input name="hire_date" type="date"></label>
                        <label class="field"><span>離職日</span><input name="termination_date" type="date"></label>
                        <label class="field"><span>備註</span><input name="notes" placeholder="備註"></label>
                    </div>
                    <div class="form-toolbar">
                        <div class="inline-actions">
                            <button class="primary-btn" type="submit">儲存員工</button>
                            <button class="outline-btn" type="button" data-action="reset-employee-form">清空表單</button>
                        </div>
                    </div>
                    <input id="employee-import-file" type="file" accept=".csv,text/csv" class="hidden">
                </form>
            </article>

            <article class="table-card">
                <div class="list-toolbar">
                    <div>
                        <h3>員工名冊</h3>
                        <p class="helper-text">支援工號、姓名、部門、職稱、卡號與備註篩選，表頭固定並改為內部卷軸瀏覽。</p>
                    </div>
                    <div class="badge-row">
                        <span id="employee-filter-badge">${renderBadge(`顯示 ${filteredEmployees.length} / ${datasets.employees.length} 人`, "success")}</span>
                    </div>
                </div>
                <div class="field-grid employee-filter-grid">
                    <label class="field">
                        <span>關鍵字篩選</span>
                        <input id="employee-filter-query" value="${escapeHtml(filters.query)}" placeholder="工號 / 姓名 / 部門 / 職稱 / 卡號 / 備註">
                    </label>
                    <label class="field">
                        <span>部門</span>
                        <select id="employee-filter-department">
                            <option value="">全部部門</option>
                            ${departmentOptions}
                        </select>
                    </label>
                    <label class="field">
                        <span>顯示視野</span>
                        <select id="employee-visible-rows">
                            <option value="25" ${filters.visibleRows === "25" ? "selected" : ""}>標準（約 25 列）</option>
                            <option value="50" ${filters.visibleRows === "50" ? "selected" : ""}>加大（約 50 列）</option>
                        </select>
                    </label>
                </div>
                <div class="list-toolbar">
                    <p id="employee-filter-summary" class="helper-text">目前顯示 ${filteredEmployees.length} 位員工。</p>
                    <button class="outline-btn" type="button" data-action="reset-employee-filters">清除篩選</button>
                </div>
                <div id="employee-table-host">${renderEmployeeRows(filteredEmployees, filters.visibleRows)}</div>
            </article>

            <article class="sub-panel">
                <h3>班別設定</h3>
                <form id="shift-form" class="stack-form">
                    ${renderShiftRows(datasets.shifts)}
                    <div class="form-toolbar">
                        <button class="primary-btn" type="submit">儲存班別設定</button>
                    </div>
                </form>
            </article>

            <article class="sub-panel">
                <h3>手動補登打卡</h3>
                <form id="manual-punch-form" class="stack-form">
                    <div class="field-grid">
                        <label class="field"><span>員工識別</span><input name="employeeQuery" placeholder="工號 / 卡號 / 密碼" required></label>
                        <label class="field"><span>日期</span><input name="date" type="date" required></label>
                        <label class="field"><span>時間</span><input name="time" type="time" step="1" required></label>
                        <label class="field"><span>班別</span><select name="shift"><option value="">手動補登</option>${shiftOptions}</select></label>
                        <label class="field"><span>狀態</span><select name="status"><option value="in">上班</option><option value="out">下班</option></select></label>
                    </div>
                    <button class="primary-btn" type="submit">送出補登</button>
                </form>
            </article>
        </div>
    `;
}

function refreshEmployeeDirectoryView() {
    const datasets = getDatasets();
    if (!datasets?.employees) return;

    const filters = ensureAdminPeopleFilters();
    const filteredEmployees = filterAdminEmployees(datasets.employees);
    const host = document.getElementById("employee-table-host");
    const summary = document.getElementById("employee-filter-summary");
    const badge = document.getElementById("employee-filter-badge");
    const columnSummary = document.getElementById("employee-column-summary");
    const columnToggleList = document.getElementById("employee-column-toggle-list");

    if (host) {
        host.innerHTML = renderEmployeeRows(filteredEmployees, filters.visibleRows);
        scheduleDataTableColumnFit(host);
    }
    if (summary) {
        summary.textContent = `目前顯示 ${filteredEmployees.length} / ${datasets.employees.length} 位員工。`;
    }
    if (badge) {
        badge.innerHTML = renderBadge(`顯示 ${filteredEmployees.length} / ${datasets.employees.length} 人`, "success");
    }
    if (columnSummary) {
        columnSummary.textContent = getEmployeeRosterColumnSummaryText();
    }
    if (columnToggleList) {
        columnToggleList.innerHTML = renderEmployeeRosterColumnControls();
    }
}

function renderGreetingItems(greetings, employees = []) {
    const employeeNameMap = new Map(
        (Array.isArray(employees) ? employees : []).map((employee) => [String(employee.id || "").trim(), employee.name || ""])
    );
    if (!greetings.length) return renderEmptyState("尚未設定任何問候語。");
    return `
        <div class="record-list">
            ${greetings.map((greeting) => {
                const employeeId = String(greeting.employee_id || "").trim();
                const employeeName = employeeId ? String(employeeNameMap.get(employeeId) || "").trim() : "";
                const employeeLabel = employeeId
                    ? employeeName
                        ? `${employeeId} / ${employeeName}`
                        : employeeId
                    : "通用";
                return `
                <div class="list-item">
                    <div class="list-item-top">
                        <span>${escapeHtml(employeeLabel)} / ${escapeHtml(greeting.type === "in" ? "上班" : "下班")}</span>
                        <div class="inline-actions">
                            <button class="mini-btn" type="button" data-action="edit-greeting" data-id="${escapeHtml(greeting.id)}">編輯</button>
                            <button class="mini-btn" type="button" data-action="delete-greeting" data-id="${escapeHtml(greeting.id)}">刪除</button>
                        </div>
                    </div>
                    <div class="record-subline">${escapeHtml(greeting.message)}</div>
                </div>
            `;
            }).join("")}
        </div>
    `;
}

function renderAdminSystemSection(datasets) {
    return `
        <div class="workspace-stack">
            <article class="workspace-card">
                <div class="list-toolbar">
                    <div>
                        <p class="sub-kicker">管理者設定</p>
                        <h3>資料設定與問候語</h3>
                    </div>
                    <div class="badge-row">
                        ${renderBadge(`問候語 ${datasets.greetings.length} 則`, "success")}
                    </div>
                </div>
            </article>

            <article class="sub-panel">
                <h3>主畫面資料設定</h3>
                <form id="data-settings-form" class="stack-form">
                    <div class="field-grid">
                        <label class="field"><span>主標題</span><input name="mainTitle" value="${escapeHtml(datasets.settings.mainTitle || "")}" required></label>
                        <label class="field"><span>副標題</span><input name="subtitle" value="${escapeHtml(datasets.settings.subtitle || "")}"></label>
                    </div>
                    <label class="field"><span>頁首說明</span><textarea name="heroDescription" rows="4" placeholder="輸入登入頁與工作台共用的說明文字">${escapeHtml(datasets.settings.heroDescription || "")}</textarea></label>
                    <button class="primary-btn" type="submit">儲存主畫面設定</button>
                </form>
            </article>

            <article class="sub-panel">
                <h3>變更管理者密碼</h3>
                <form id="admin-password-form" class="stack-form">
                    <div class="field-grid">
                        <label class="field"><span>目前系統密碼</span><input name="currentSystemPassword" type="password" required></label>
                        <label class="field"><span>新管理者密碼</span><input name="newPassword" type="password" required></label>
                    </div>
                    <button class="primary-btn" type="submit">更新管理者密碼</button>
                    <div class="inline-message" data-form-message-for="admin-password-form" aria-live="polite"></div>
                </form>
            </article>

            <article class="sub-panel">
                <h3>問候語管理</h3>
                <form id="greeting-form" class="stack-form">
                    <input type="hidden" name="editingId" value="">
                    <div class="field-grid">
                        <label class="field"><span>打卡類型</span><select name="type"><option value="in">上班</option><option value="out">下班</option></select></label>
                        <label class="field"><span>指定員工工號</span><input name="employee_id" placeholder="留空表示通用問候語"></label>
                    </div>
                    <label class="field"><span>問候語內容</span><textarea name="message" placeholder="可輸入多句問候語" required></textarea></label>
                    <div class="form-toolbar">
                        <button class="primary-btn" type="submit">儲存問候語</button>
                        <button class="outline-btn" type="button" data-action="reset-greeting-form">清空問候語表單</button>
                    </div>
                </form>
                ${renderGreetingItems(datasets.greetings, datasets.employees)}
            </article>
        </div>
    `;
}

function renderBellList(datasets) {
    if (!datasets.bellSchedules.length) return renderEmptyState("尚未建立任何響鈴場景。");
    return `
        <div class="record-list">
            ${datasets.bellSchedules.map((schedule) => {
                const soundName = datasets.customSounds.find((sound) => sound.path === schedule.sound)?.name || "未知聲音";
                const dayText = String(schedule.days || "").split(",").filter(Boolean).map((day) => dayLabels[Number(day)]).join("、");
                return `
                    <div class="list-item">
                        <div class="list-item-top">
                            <span>${escapeHtml(schedule.title)} / ${escapeHtml(schedule.time)}</span>
                            <div class="inline-actions">
                                <label class="switch-line"><input type="checkbox" data-action="toggle-bell" data-id="${escapeHtml(schedule.id)}" ${schedule.enabled ? "checked" : ""}>啟用</label>
                                <button class="mini-btn" type="button" data-action="edit-bell" data-id="${escapeHtml(schedule.id)}">編輯</button>
                                <button class="mini-btn" type="button" data-action="delete-bell" data-id="${escapeHtml(schedule.id)}">刪除</button>
                            </div>
                        </div>
                        <div class="record-subline">週期：${escapeHtml(dayText || "-")}，聲音：${escapeHtml(soundName)}，秒數：${escapeHtml(schedule.duration)}</div>
                    </div>
                `;
            }).join("")}
        </div>
    `;
}

function renderSoundList(customSounds) {
    if (!customSounds.length) return renderEmptyState("尚未建立自訂聲音。");
    return `
        <div class="record-list">
            ${customSounds.map((sound) => `
                <div class="list-item">
                    <div class="list-item-top">
                        <span>${escapeHtml(sound.name)}</span>
                        <div class="inline-actions">
                            <button class="mini-btn" type="button" data-action="play-sound" data-url="${escapeHtml(sound.browserUrl || "")}">播放</button>
                            <button class="mini-btn" type="button" data-action="delete-sound" data-id="${escapeHtml(sound.id)}">刪除</button>
                        </div>
                    </div>
                    <div class="record-subline">${escapeHtml(sound.path)}</div>
                </div>
            `).join("")}
        </div>
    `;
}

function renderBellHistory(history) {
    if (!history.length) return renderEmptyState("目前沒有響鈴歷史紀錄。");
    return `
        <div class="record-list">
            ${history.slice(0, 50).map((item) => `
                <div class="list-item">
                    <div class="list-item-top">
                        <span>${escapeHtml(new Date(item.timestamp).toLocaleString("zh-TW", { hour12: false }))}</span>
                        <span>${escapeHtml(item.soundName || "")}</span>
                    </div>
                    <div class="record-subline">場景：${escapeHtml(item.scheduleId)}，排程時間：${escapeHtml(item.time)}</div>
                </div>
            `).join("")}
        </div>
    `;
}

function renderAdminBellSection(datasets) {
    const soundOptions = renderOptions(datasets.customSounds, {
        valueKey: "path",
        labelFn: (sound) => sound.name
    });

    return `
        <div class="workspace-stack">
            <article class="workspace-card">
                <div class="list-toolbar">
                    <div>
                        <p class="sub-kicker">管理者設定</p>
                        <h3>響鈴管理</h3>
                    </div>
                    <div class="badge-row">
                        ${renderBadge(`場景 ${datasets.bellSchedules.length} 組`, "success")}
                        ${renderBadge(`聲音 ${datasets.customSounds.length} 筆`)}
                    </div>
                </div>
            </article>

            <article class="sub-panel">
                <h3>響鈴場景</h3>
                <form id="bell-form" class="stack-form">
                    <input type="hidden" name="editingId" value="">
                    <div class="field-grid">
                        <label class="field"><span>場景名稱</span><input name="title" placeholder="例如：上課鐘" required></label>
                        <label class="field"><span>響鈴時間</span><input name="time" type="time" required></label>
                        <label class="field"><span>聲音</span><select name="sound" required><option value="">請選擇聲音</option>${soundOptions}</select></label>
                        <label class="field"><span>播放秒數</span><input name="duration" type="number" min="1" value="5"></label>
                    </div>
                    <div class="checkbox-grid">
                        ${dayLabels.map((day, index) => `
                            <label class="checkbox-label"><input type="checkbox" name="days" value="${index}"> 週${day}</label>
                        `).join("")}
                    </div>
                    <div class="form-toolbar">
                        <button class="primary-btn" type="submit">儲存響鈴場景</button>
                        <button class="outline-btn" type="button" data-action="reset-bell-form">清空響鈴表單</button>
                    </div>
                </form>
                ${renderBellList(datasets)}
            </article>

            <article class="sub-panel">
                <div class="list-toolbar">
                    <h3>聲音庫</h3>
                    <button class="secondary-btn" type="button" data-action="trigger-sound-upload">上傳聲音檔</button>
                </div>
                <input id="sound-upload-file" type="file" accept=".mp3,.wav,.ogg,audio/*" class="hidden">
                ${renderSoundList(datasets.customSounds)}
            </article>

            <article class="sub-panel">
                <div class="list-toolbar">
                    <h3>響鈴歷史</h3>
                    <button class="danger-btn" type="button" data-action="clear-bell-history">清空歷史</button>
                </div>
                ${renderBellHistory(datasets.bellHistory)}
            </article>
        </div>
    `;
}

function renderSpecialEffects(source) {
    const effects = Array.isArray(source)
        ? source
        : Array.isArray(source?.specialEffects)
            ? source.specialEffects
            : [];
    if (!effects.length) return renderEmptyState("尚未建立節日特效。");
    return `
        <div class="record-list">
            ${effects.map((effect) => `
                <div class="list-item">
                    <div class="list-item-top">
                        <span>${escapeHtml(effect.name)}</span>
                        <div class="inline-actions">
                            <label class="switch-line"><input type="checkbox" data-action="toggle-effect" data-id="${escapeHtml(effect.id)}" ${effect.enabled ? "checked" : ""}>啟用</label>
                            <button class="mini-btn" type="button" data-action="edit-effect" data-id="${escapeHtml(effect.id)}">編輯</button>
                            <button class="mini-btn" type="button" data-action="delete-effect" data-id="${escapeHtml(effect.id)}">刪除</button>
                        </div>
                    </div>
                    <div class="record-subline">${escapeHtml(effect.start_date)} ~ ${escapeHtml(effect.end_date)}，前綴：${escapeHtml(effect.prefix || "-")}，後綴：${escapeHtml(effect.suffix || "-")}</div>
                </div>
            `).join("")}
        </div>
    `;
}

function renderThemeSchedules(source) {
    const datasets = source && typeof source === "object" && !Array.isArray(source) ? source : {};
    const themeSchedules = Array.isArray(datasets.themeSchedules) ? datasets.themeSchedules : [];
    const customThemes = Array.isArray(datasets.customThemes) ? datasets.customThemes : [];
    if (!themeSchedules.length) return renderEmptyState("尚未建立主題排程。");
    return `
        <div class="record-list">
            ${themeSchedules.map((schedule) => {
                const themeName = schedule.theme_name === "default"
                    ? "預設主題"
                    : (customThemes.find((theme) => theme.id === schedule.theme_name)?.name || "未知主題");
                return `
                    <div class="list-item">
                        <div class="list-item-top">
                            <span>${escapeHtml(schedule.name)}</span>
                            <div class="inline-actions">
                                <label class="switch-line"><input type="checkbox" data-action="toggle-theme-schedule" data-id="${escapeHtml(schedule.id)}" ${schedule.enabled ? "checked" : ""}>啟用</label>
                                <button class="mini-btn" type="button" data-action="edit-theme-schedule" data-id="${escapeHtml(schedule.id)}">編輯</button>
                                <button class="mini-btn" type="button" data-action="delete-theme-schedule" data-id="${escapeHtml(schedule.id)}">刪除</button>
                            </div>
                        </div>
                        <div class="record-subline">${escapeHtml(schedule.start_date)} ~ ${escapeHtml(schedule.end_date)}，主題：${escapeHtml(themeName)}</div>
                    </div>
                `;
            }).join("")}
        </div>
    `;
}

function renderThemePreview(styles) {
    const previewStyles = { ...defaultThemeStyles, ...styles };
    return `
        <div id="custom-theme-preview" class="preview-card" style="background-image: linear-gradient(135deg, ${escapeHtml(previewStyles.bgDayStart)} 0%, ${escapeHtml(previewStyles.bgDayEnd)} 100%); color: ${escapeHtml(previewStyles.mainTitleColor)};">
            <div class="preview-header">
                <strong>主題預覽</strong>
                <span class="badge">${escapeHtml(previewStyles.dayStartTime)} / ${escapeHtml(previewStyles.nightStartTime)}</span>
            </div>
            <div>震欣科技 AI 作息系統</div>
            <div class="preview-clock" style="background-color: ${escapeHtml(previewStyles.clockBg)}; color: ${escapeHtml(previewStyles.clockText)}; background-image: ${previewStyles.browserClockBgImage ? `url('${escapeHtml(previewStyles.browserClockBgImage)}')` : "none"};">
                <div>${escapeHtml(previewStyles.clockSymbolsLeft)} 06:15:02 ${escapeHtml(previewStyles.clockSymbolsRight)}</div>
            </div>
            <div class="preview-buttons">
                <button class="preview-button" type="button" style="--preview-btn-bg: ${escapeHtml(previewStyles.btnAdminBg)}; --preview-btn-text: ${escapeHtml(previewStyles.btnAdminText)};">管理</button>
                <button class="preview-button" type="button" style="--preview-btn-bg: ${escapeHtml(previewStyles.btnReportBg)}; --preview-btn-text: ${escapeHtml(previewStyles.btnReportText)};">報表</button>
                <button class="preview-button" type="button" style="--preview-btn-bg: ${escapeHtml(previewStyles.btnAiBg)}; --preview-btn-text: ${escapeHtml(previewStyles.btnAiText)};">AI</button>
            </div>
            ${previewStyles.browserClockBgImage ? `<img src="${escapeHtml(previewStyles.browserClockBgImage)}" alt="主題背景預覽">` : ""}
        </div>
    `;
}

function renderCustomThemes(datasets) {
    if (!datasets.customThemes.length) return renderEmptyState("尚未建立自訂主題。");
    return `
        <div class="record-list">
            ${datasets.customThemes.map((theme) => `
                <div class="list-item">
                    <div class="list-item-top">
                        <span>${escapeHtml(theme.name)}</span>
                        <div class="inline-actions">
                            <button class="mini-btn" type="button" data-action="edit-custom-theme" data-id="${escapeHtml(theme.id)}">載入編輯</button>
                            <button class="mini-btn" type="button" data-action="delete-custom-theme" data-id="${escapeHtml(theme.id)}">刪除</button>
                        </div>
                    </div>
                    <div class="record-subline">打卡特效：${escapeHtml(theme.styles.punchEffect || "none")}，背景圖：${escapeHtml(theme.styles.clockBgImage ? "已設定" : "未設定")}</div>
                </div>
            `).join("")}
        </div>
    `;
}

function renderAdminThemeSection(datasets) {
    const themeOptions = `
        <option value="default">預設主題</option>
        ${renderOptions(datasets.customThemes, { labelFn: (theme) => theme.name })}
    `;

    return `
        <div class="workspace-stack">
            <article class="workspace-card">
                <div class="list-toolbar">
                    <div>
                        <p class="sub-kicker">管理者設定</p>
                        <h3>主題與特效</h3>
                    </div>
                    <div class="badge-row">
                        ${renderBadge(`節日特效 ${datasets.specialEffects.length} 組`, "success")}
                        ${renderBadge(`主題排程 ${datasets.themeSchedules.length} 組`)}
                    </div>
                </div>
            </article>

            <article class="sub-panel">
                <h3>節日特效</h3>
                <form id="effect-form" class="stack-form">
                    <input type="hidden" name="editingId" value="">
                    <div class="field-grid">
                        <label class="field"><span>特效名稱</span><input name="name" required></label>
                        <label class="field"><span>前綴</span><input name="prefix"></label>
                        <label class="field"><span>後綴</span><input name="suffix"></label>
                        <label class="field"><span>開始日期</span><input name="start_date" type="date" required></label>
                        <label class="field"><span>結束日期</span><input name="end_date" type="date" required></label>
                    </div>
                    <div class="form-toolbar">
                        <button class="primary-btn" type="submit">儲存節日特效</button>
                        <button class="outline-btn" type="button" data-action="reset-effect-form">清空特效表單</button>
                    </div>
                </form>
                ${renderSpecialEffects(datasets.specialEffects)}
            </article>

            <article class="sub-panel">
                <h3>主題排程</h3>
                <form id="theme-schedule-form" class="stack-form">
                    <input type="hidden" name="editingId" value="">
                    <div class="field-grid">
                        <label class="field"><span>排程名稱</span><input name="name" required></label>
                        <label class="field"><span>主題</span><select name="theme_name">${themeOptions}</select></label>
                        <label class="field"><span>開始日期</span><input name="start_date" type="date" required></label>
                        <label class="field"><span>結束日期</span><input name="end_date" type="date" required></label>
                    </div>
                    <div class="form-toolbar">
                        <button class="primary-btn" type="submit">儲存主題排程</button>
                        <button class="outline-btn" type="button" data-action="reset-theme-schedule-form">清空排程表單</button>
                    </div>
                </form>
                ${renderThemeSchedules(datasets)}
            </article>

            <article class="sub-panel">
                <div class="list-toolbar">
                    <h3>自訂主題編輯器</h3>
                    <button class="secondary-btn" type="button" data-action="trigger-theme-image-upload">上傳背景圖</button>
                </div>
                <form id="custom-theme-form" class="stack-form">
                    <input type="hidden" name="editingId" value="">
                    <input type="hidden" name="clockBgImage" value="">
                    <input type="hidden" name="browserClockBgImage" value="">
                    <div class="field-grid">
                        <label class="field"><span>主題名稱</span><input name="name" required></label>
                        <label class="field"><span>時鐘背景位置</span><select name="clockBgPos"><option value="center">置中</option><option value="top">上方</option><option value="bottom">下方</option></select></label>
                    </div>
                    <div class="theme-grid">
                        <label class="field"><span>白天起色</span><input name="bgDayStart" type="color" value="${escapeHtml(defaultThemeStyles.bgDayStart)}"></label>
                        <label class="field"><span>白天終色</span><input name="bgDayEnd" type="color" value="${escapeHtml(defaultThemeStyles.bgDayEnd)}"></label>
                        <label class="field"><span>夜晚起色</span><input name="bgNightStart" type="color" value="${escapeHtml(defaultThemeStyles.bgNightStart)}"></label>
                        <label class="field"><span>夜晚終色</span><input name="bgNightEnd" type="color" value="${escapeHtml(defaultThemeStyles.bgNightEnd)}"></label>
                        <label class="field"><span>白天開始</span><input name="dayStartTime" type="time" value="${escapeHtml(defaultThemeStyles.dayStartTime)}"></label>
                        <label class="field"><span>夜晚開始</span><input name="nightStartTime" type="time" value="${escapeHtml(defaultThemeStyles.nightStartTime)}"></label>
                        <label class="field"><span>主標題色</span><input name="mainTitleColor" type="color" value="${escapeHtml(defaultThemeStyles.mainTitleColor)}"></label>
                        <label class="field"><span>時鐘底色</span><input name="clockBg" type="color" value="${escapeHtml(defaultThemeStyles.clockBg)}"></label>
                        <label class="field"><span>時鐘文字色</span><input name="clockText" type="color" value="${escapeHtml(defaultThemeStyles.clockText)}"></label>
                        <label class="field"><span>管理按鈕底色</span><input name="btnAdminBg" type="color" value="${escapeHtml(defaultThemeStyles.btnAdminBg)}"></label>
                        <label class="field"><span>管理按鈕字色</span><input name="btnAdminText" type="color" value="${escapeHtml(defaultThemeStyles.btnAdminText)}"></label>
                        <label class="field"><span>報表按鈕底色</span><input name="btnReportBg" type="color" value="${escapeHtml(defaultThemeStyles.btnReportBg)}"></label>
                        <label class="field"><span>報表按鈕字色</span><input name="btnReportText" type="color" value="${escapeHtml(defaultThemeStyles.btnReportText)}"></label>
                        <label class="field"><span>AI 按鈕底色</span><input name="btnAiBg" type="color" value="${escapeHtml(defaultThemeStyles.btnAiBg)}"></label>
                        <label class="field"><span>AI 按鈕字色</span><input name="btnAiText" type="color" value="${escapeHtml(defaultThemeStyles.btnAiText)}"></label>
                        <label class="field"><span>白天邊框色</span><input name="blinkDayColor" type="color" value="${escapeHtml(defaultThemeStyles.blinkDayColor)}"></label>
                        <label class="field"><span>夜晚邊框色</span><input name="blinkNightColor" type="color" value="${escapeHtml(defaultThemeStyles.blinkNightColor)}"></label>
                    </div>
                    <div class="field-grid">
                        <label class="field"><span>左側符號</span><input name="clockSymbolsLeft"></label>
                        <label class="field"><span>右側符號</span><input name="clockSymbolsRight"></label>
                        <label class="field"><span>閃爍邊框</span><select name="blinkEnabled"><option value="false">關閉</option><option value="true">開啟</option></select></label>
                        <label class="field"><span>打卡特效</span><select name="punchEffect"><option value="none">無</option><option value="fall">落下</option><option value="flash">閃現</option></select></label>
                    </div>
                    <div class="field-grid">
                        <label class="field"><span>落下內容</span><input name="punchFallContent" value="${escapeHtml(defaultThemeStyles.punchFallContent)}"></label>
                        <label class="field"><span>閃現內容</span><input name="punchFlashContent" value="${escapeHtml(defaultThemeStyles.punchFlashContent)}"></label>
                    </div>
                    <div class="form-toolbar">
                        <div class="inline-actions">
                            <button class="primary-btn" type="submit">儲存自訂主題</button>
                            <button class="outline-btn" type="button" data-action="reset-custom-theme-form">清空主題表單</button>
                        </div>
                        <div class="inline-actions">
                            <button class="outline-btn" type="button" data-action="clear-theme-image">清除背景圖</button>
                        </div>
                    </div>
                    <input id="theme-image-file" type="file" accept=".png,.jpg,.jpeg,.gif,.webp,image/*" class="hidden">
                </form>
                <div id="theme-preview-host">${renderThemePreview(defaultThemeStyles)}</div>
                ${renderCustomThemes(datasets)}
            </article>
        </div>
    `;
}

function renderAutomationTasks(tasks, exportConfig = getAttendanceExportConfig(), automationExportConfig = getAutomationExportConfig()) {
    if (!tasks.length) return renderEmptyState("尚未建立自動化任務。");
    return `
        <div class="record-list">
            ${tasks.map((task) => `
                <div class="list-item">
                    <div class="list-item-top">
                        <span>${escapeHtml(automationFrequencyLabels[task.frequency] || task.frequency)} / ${escapeHtml(automationTaskLabels[task.task_type] || task.task_type)}</span>
                        <div class="inline-actions">
                            <label class="switch-line"><input type="checkbox" data-action="toggle-automation-task" data-id="${escapeHtml(task.id)}" ${task.enabled ? "checked" : ""}>啟用</label>
                            <button class="mini-btn" type="button" data-action="edit-automation-task" data-id="${escapeHtml(task.id)}">編輯</button>
                            <button class="mini-btn" type="button" data-action="delete-automation-task" data-id="${escapeHtml(task.id)}">刪除</button>
                        </div>
                    </div>
                    <div class="record-subline">
                        目標：${escapeHtml(automationTargetLabels[task.target] || task.target)}，
                        時間：${escapeHtml(task.time || "立即")}，
                        日別：${escapeHtml(task.day || "-")}
                        ${isAttendanceExportTask(task.task_type, task.target)
                            ? `，模板：${escapeHtml(
                                exportConfig.templates.find((template) => template.id === task.export_template)?.label
                                || getAttendanceExportTemplateLabel(task.export_template)
                            )}`
                            : ""}
                        ${task.task_type === "export"
                            ? `，匯出資料夾：${escapeHtml(task.export_directory || automationExportConfig.defaultDirectory || automationExportConfig.fallbackDirectory || "桌面資料夾")}`
                            : ""}
                    </div>
                </div>
            `).join("")}
        </div>
    `;
}

function renderAutomationLogs(logs) {
    if (!logs.length) return renderEmptyState("目前沒有自動化日誌。");
    return `
        <div class="record-list">
            ${logs.slice(0, 80).map((log) => `
                <div class="list-item">
                    <div class="list-item-top">
                        <span>${escapeHtml(new Date(log.timestamp).toLocaleString("zh-TW", { hour12: false }))}</span>
                        ${renderBadge(log.status || "info", log.status === "error" ? "danger" : log.status === "success" ? "success" : "")}
                    </div>
                    <div class="record-subline">${escapeHtml(log.message)}</div>
                </div>
            `).join("")}
        </div>
    `;
}

function renderDeveloperAutomationSection(datasets) {
    const exportConfig = getAttendanceExportConfig(datasets);
    const automationExportConfig = getAutomationExportConfig(datasets);
    const templateOptions = exportConfig.templates.length
        ? exportConfig.templates.map((template) => `<option value="${escapeHtml(template.id)}">${escapeHtml(template.label)}</option>`).join("")
        : `<option value="full">完整格式</option>`;

    return `
        <div class="workspace-stack">
            <article class="workspace-card">
                <div class="list-toolbar">
                    <div>
                        <p class="sub-kicker">AI 系統控制</p>
                        <h3>自動化任務</h3>
                    </div>
                    <div class="badge-row">
                        ${renderBadge(`任務 ${datasets.automationTasks.length} 筆`, "success")}
                        ${renderBadge(`日誌 ${datasets.automationLog.length} 筆`)}
                    </div>
                </div>
            </article>

            <article class="sub-panel">
                <h3>任務表單</h3>
                <form id="automation-form" class="stack-form">
                    <input type="hidden" name="editingId" value="">
                    <div class="field-grid">
                        <label class="field"><span>頻率</span><select name="frequency" id="automation-frequency"><option value="immediate">立即</option><option value="daily">每日</option><option value="weekly">每週</option><option value="monthly">每月</option></select></label>
                        <label class="field"><span>時間</span><input name="time" id="automation-time" type="time"></label>
                        <label class="field"><span>每週星期</span><select name="weeklyDay" id="automation-weekly-day">${dayLabels.map((day, index) => `<option value="${index}">週${day}</option>`).join("")}</select></label>
                        <label class="field"><span>每月日期</span><select name="monthlyDay" id="automation-monthly-day">${Array.from({ length: 31 }, (_, index) => `<option value="${index + 1}">${index + 1}</option>`).join("")}</select></label>
                        <label class="field"><span>任務類型</span><select name="task_type" id="automation-task-type"><option value="export">匯出</option><option value="delete">刪除</option></select></label>
                        <label class="field"><span>任務目標</span><select name="target" id="automation-target">${Object.entries(automationTargetLabels).map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join("")}</select></label>
                        <label class="field hidden" id="automation-export-template-field"><span>考勤模板</span><select name="export_template" id="automation-export-template">${templateOptions}</select></label>
                        <label class="field"><span>啟用</span><select name="enabled"><option value="true">啟用</option><option value="false">停用</option></select></label>
                    </div>
                    <div class="form-toolbar">
                        <button class="primary-btn" type="submit">儲存 / 執行任務</button>
                        <button class="outline-btn" type="button" data-action="reset-automation-form">清空任務表單</button>
                    </div>
                </form>
                ${renderAutomationTasks(datasets.automationTasks, exportConfig)}
            </article>
        </div>
    `;
}

function renderDeveloperExportSection(datasets) {
    const exportConfig = getAttendanceExportConfig(datasets);
    const customTemplate = exportConfig.templates.find((template) => template.id === "custom");

    return `
        <div class="workspace-stack">
            <article class="workspace-card">
                <div class="list-toolbar">
                    <div>
                        <p class="sub-kicker">AI 系統控制</p>
                        <h3>考勤報表匯出欄位設定</h3>
                    </div>
                    <div class="badge-row">
                        ${renderBadge(`模板 ${exportConfig.templates.length} 組`, "success")}
                        ${renderBadge(`自訂欄位 ${exportConfig.customFields.length} 項`)}
                    </div>
                </div>
                <p class="helper-text">管理者工作台的考勤資料匯出固定使用「薪資系統」模板；AI 自動化任務可以在每一筆任務中自行選擇模板。</p>
            </article>

            <article class="sub-panel">
                <h3>內建模板</h3>
                <div class="record-list">
                    ${exportConfig.templates.filter((template) => template.id !== "custom").map((template) => `
                        <div class="list-item">
                            <div class="list-item-top">
                                <span>${escapeHtml(template.label)}</span>
                                ${renderBadge(`${template.fields.length} 欄`, "success")}
                            </div>
                            <div class="record-subline">${escapeHtml(template.description)}</div>
                            <div class="record-subline mono-text">${escapeHtml(template.fields.map((field) => field.label).join(" / "))}</div>
                        </div>
                    `).join("")}
                </div>
            </article>

            <article class="sub-panel">
                <h3>自訂格式</h3>
                <form id="attendance-export-settings-form" class="stack-form">
                    <div class="checkbox-grid">
                        ${exportConfig.fieldCatalog.map((field) => `
                            <label class="checkbox-label">
                                <input type="checkbox" name="customFields" value="${escapeHtml(field.id)}" ${exportConfig.customFields.includes(field.id) ? "checked" : ""}>
                                ${escapeHtml(field.label)}
                            </label>
                        `).join("")}
                    </div>
                    <p class="helper-text">自訂格式目前共選擇 ${exportConfig.customFields.length} 個欄位。用途：${escapeHtml(customTemplate?.description || "依勾選欄位匯出。")}</p>
                    <div class="form-toolbar">
                        <button class="primary-btn" type="submit">儲存自訂模板</button>
                        <button class="outline-btn" type="reset">還原目前設定</button>
                    </div>
                </form>
                <div class="record-subline mono-text">${escapeHtml((customTemplate?.fields || []).map((field) => field.label).join(" / "))}</div>
            </article>
        </div>
    `;
}

function renderDeveloperLogsSection(datasets) {
    return `
        <div class="workspace-stack">
            <article class="sub-panel">
                <div class="list-toolbar">
                    <h3>自動化日誌</h3>
                    <button class="danger-btn" type="button" data-action="clear-automation-log">清空日誌</button>
                </div>
                ${renderAutomationLogs(datasets.automationLog)}
            </article>

            <article class="sub-panel">
                <h3>變更系統密碼</h3>
                <form id="system-password-form" class="stack-form">
                    <div class="field-grid">
                        <label class="field"><span>目前系統密碼</span><input name="currentPassword" type="password" required></label>
                        <label class="field"><span>新系統密碼</span><input name="newPassword" type="password" required></label>
                    </div>
                    <button class="primary-btn" type="submit">更新系統密碼</button>
                    <div class="inline-message" data-form-message-for="system-password-form" aria-live="polite"></div>
                </form>
            </article>
        </div>
    `;
}

function renderApiCatalogTables(apiCatalog) {
    if (!apiCatalog.length) return renderEmptyState("目前沒有 API 清單資料。");

    const groupedCatalog = apiCatalog.reduce((groups, endpoint) => {
        const category = endpoint.category || "其他";
        if (!groups[category]) groups[category] = [];
        groups[category].push(endpoint);
        return groups;
    }, {});

    return Object.entries(groupedCatalog).map(([category, endpoints]) => `
        <article class="table-card">
            <div class="list-toolbar">
                <div>
                    <p class="sub-kicker">API 目錄</p>
                    <h3>${escapeHtml(category)}</h3>
                </div>
                <div class="badge-row">
                    ${renderBadge(`共 ${endpoints.length} 支`)}
                </div>
            </div>
            <div class="data-table-wrap">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>方法</th>
                            <th>路徑</th>
                            <th>權限</th>
                            <th>用途</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${endpoints.map((endpoint) => `
                            <tr>
                                <td>${escapeHtml(endpoint.method || "-")}</td>
                                <td><span class="mono-text">${escapeHtml(endpoint.path || "-")}</span></td>
                                <td>${escapeHtml(endpoint.auth || "-")}</td>
                                <td>${escapeHtml(endpoint.description || "-")}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        </article>
    `).join("");
}

function renderDeveloperStatusSection(datasets) {
    const health = datasets.systemHealth || {};
    const latestLogText = health.lastAutomationLog
        ? `${health.lastAutomationLog.timestampText} / ${health.lastAutomationLog.status} / ${health.lastAutomationLog.message}`
        : "目前沒有最近一次任務日誌。";

    return `
        <div class="workspace-stack">
            <article class="workspace-card">
                <div class="list-toolbar">
                    <div>
                        <p class="sub-kicker">AI 系統控制</p>
                        <h3>系統健康面板</h3>
                    </div>
                    <div class="badge-row">
                        ${renderBadge(`服務 ${health.statusText || "-"}`, health.status === "ok" ? "success" : "danger")}
                        ${renderBadge(`API ${health.apiCount ?? 0} 支`)}
                    </div>
                </div>
                <p class="helper-text">這裡會顯示目前 Express 服務、桌面主視窗、資料庫、自動化排程與 API 目錄的完整資訊，方便巡檢與外部整合。</p>
                ${renderStatsGrid({
                    statusText: health.statusText || "-",
                    port: health.port || "-",
                    uptimeText: health.uptimeText || "-",
                    browserSessionCount: health.browserSessionCount ?? 0,
                    enabledAutomationTaskCount: health.enabledAutomationTaskCount ?? 0,
                    apiCount: health.apiCount ?? 0
                }, {
                    statusText: "服務狀態",
                    port: "服務埠號",
                    uptimeText: "持續運行",
                    browserSessionCount: "瀏覽器 Session",
                    enabledAutomationTaskCount: "啟用中排程",
                    apiCount: "已登錄 API"
                })}
            </article>

            <article class="sub-panel">
                <div class="list-toolbar">
                    <div>
                        <p class="sub-kicker">服務細節</p>
                        <h3>運行資訊</h3>
                    </div>
                    <div class="badge-row">
                        ${renderBadge(`桌面主視窗 ${health.desktopWindowText || "-"}`, health.desktopWindowAttached ? "success" : "danger")}
                        ${renderBadge(`版本 ${health.appVersion || "-"}`)}
                    </div>
                </div>
                ${buildKeyValueGrid([
                    { label: "啟動時間", value: health.startedAtText || "-" },
                    { label: "資料庫位置", value: health.databasePath || "-", mono: true },
                    { label: "員工資料", value: `${health.employeeCount ?? 0} 筆` },
                    { label: "打卡紀錄", value: `${health.punchRecordCount ?? 0} 筆` },
                    { label: "響鈴排程", value: `${health.bellScheduleCount ?? 0} 組` },
                    { label: "響鈴歷史", value: `${health.bellHistoryCount ?? 0} 筆` },
                    { label: "自訂聲音", value: `${health.customSoundCount ?? 0} 筆` },
                    { label: "自訂主題", value: `${health.customThemeCount ?? 0} 筆` },
                    { label: "自動化任務", value: `${health.automationTaskCount ?? 0} 筆` },
                    { label: "自動化日誌", value: `${health.automationLogCount ?? 0} 筆` },
                    { label: "系統密碼狀態", value: health.systemPasswordSet ? "已設定" : "未設定" },
                    { label: "最近一次任務日誌", value: latestLogText }
                ])}
            </article>

            ${renderApiCatalogTables(datasets.apiCatalog || [])}
        </div>
    `;
}

function renderAdminDashboard(dashboard) {
    const sections = [
        { id: "people", label: "員工與班別" },
        { id: "reports", label: "考勤報表" },
        { id: "system", label: "資料與問候語" },
        { id: "bells", label: "響鈴管理" },
        { id: "themes", label: "主題與特效" }
    ];

    const activeSection = state.activeSections.admin;
    const content = activeSection === "people"
        ? renderAdminPeopleSection(dashboard.datasets)
        : activeSection === "reports"
            ? renderAdminReportSection(dashboard.datasets)
        : activeSection === "system"
            ? renderAdminSystemSection(dashboard.datasets)
            : activeSection === "bells"
                ? renderAdminBellSection(dashboard.datasets)
                : renderAdminThemeSection(dashboard.datasets);

    return `
        <div class="workspace-shell">
            ${renderStatsGrid(dashboard.summary, {
                employeeCount: "員工數",
                shiftCount: "班別數",
                todayPunchCount: "今日正常打卡",
                todayAbnormalPunchCount: "今日異常打卡",
                bellScheduleCount: "響鈴場景",
                greetingCount: "問候語",
                customThemeCount: "自訂主題"
            })}
            ${renderSuggestions(dashboard.suggestions)}
            ${renderSectionTabs("admin", sections)}
            ${content}
        </div>
    `;
}

function renderDeveloperDashboard(dashboard) {
    const sections = [
        { id: "automation", label: "自動化任務" },
        { id: "export", label: "匯出模板" },
        { id: "logs", label: "日誌與密碼" },
        { id: "status", label: "系統狀態" }
    ];

    const activeSection = state.activeSections.developer;
    const content = activeSection === "automation"
        ? renderDeveloperAutomationSection(dashboard.datasets)
        : activeSection === "export"
            ? renderDeveloperExportSection(dashboard.datasets)
        : activeSection === "logs"
            ? renderDeveloperLogsSection(dashboard.datasets)
            : renderDeveloperStatusSection(dashboard.datasets);

    return `
        <div class="workspace-shell">
            ${renderStatsGrid(dashboard.summary, {
                automationTaskCount: "任務數",
                enabledTaskCount: "啟用中任務",
                automationLogCount: "日誌數",
                activeSessionCount: "瀏覽器 Session"
            })}
            ${renderSectionTabs("developer", sections)}
            ${content}
        </div>
    `;
}

function startClock() {
    stopClock();
    const clockNode = document.getElementById("employee-live-clock");
    const subTextNode = document.getElementById("employee-clock-subtext");
    if (!clockNode || !subTextNode) return;

    const tick = () => {
        const now = new Date();
        clockNode.textContent = now.toLocaleTimeString("zh-TW", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });
        subTextNode.textContent = now.toLocaleDateString("zh-TW", {
            year: "numeric",
            month: "long",
            day: "numeric",
            weekday: "long"
        });
    };

    tick();
    state.clockTimer = setInterval(tick, 1000);
}

function stopClock() {
    if (state.clockTimer) {
        clearInterval(state.clockTimer);
        state.clockTimer = null;
    }
}

function renderDashboard(dashboard) {
    state.dashboard = dashboard;
    syncHeroHeader(dashboard);
    ui.dashboardTitle.textContent = dashboard.role === "developer"
        ? "開發者工作台"
        : dashboard.role === "admin"
            ? "管理者工作台"
            : dashboard.role === "system_admin"
                ? "系統管理者工作台"
                : "員工工作台";
    syncDashboardIdentityPill(dashboard);
    syncDashboardVersionPill(dashboard);
    syncDashboardHelpButton(dashboard);
    ui.dashboardContent.innerHTML = dashboard.role === "employee"
        ? renderEmployeeDashboard(dashboard)
        : dashboard.role === "admin"
            ? renderAdminDashboard(dashboard)
            : dashboard.role === "system_admin"
                ? renderSystemAdminDashboard(dashboard)
                : renderDeveloperDashboard(dashboard);

    if (dashboard.role === "employee") startClock();
    else stopClock();

    postRenderSetup();
}

function setActiveRole(role) {
    state.activeRole = roleConfig[role] ? role : "employee";
    const config = roleConfig[state.activeRole];
    ui.roleSelector.querySelectorAll(".role-chip").forEach((button) => {
        button.classList.toggle("active", button.dataset.role === state.activeRole);
    });
    if (ui.employeeIdLabel) ui.employeeIdLabel.textContent = config.accountLabel || "員工編號";
    ui.employeeIdInput.placeholder = config.accountPlaceholder || "輸入員工編號";
    ui.secretLabel.textContent = config.secretLabel;
    ui.secretInput.placeholder = config.secretPlaceholder;
    ui.roleHelp.textContent = config.help;
    ui.loginSubmitBtn.textContent = config.title;
    setMessage(ui.loginMessage, "");
}

function postRenderSetup() {
    const manualForm = document.getElementById("manual-punch-form");
    if (manualForm && !manualForm.elements.date.value) {
        const now = new Date();
        manualForm.elements.date.value = formatDateInputValue(now);
        manualForm.elements.time.value = now.toTimeString().slice(0, 8);
    }
    const reportForm = document.getElementById("attendance-report-form");
    if (reportForm) {
        const reportState = ensureAdminReportState();
        if (!reportForm.elements.startDate.value) reportForm.elements.startDate.value = reportState.filters.startDate;
        if (!reportForm.elements.endDate.value) reportForm.elements.endDate.value = reportState.filters.endDate;
        if (!reportForm.elements.employeeId.value) reportForm.elements.employeeId.value = reportState.filters.employeeId;
    }
    syncAutomationFormVisibility();
    updateThemePreviewFromForm();
    setupCollapsibleSections();
    scheduleDataTableColumnFit(ui.dashboardContent);
}

function setupCollapsibleSections() {
    const cards = document.querySelectorAll([
        "#dashboard-content article.info-card",
        "#dashboard-content article.record-card",
        "#dashboard-content article.workspace-card",
        "#dashboard-content article.sub-panel",
        "#dashboard-content article.table-card",
        "#dashboard-content article.list-card"
    ].join(","));

    cards.forEach((card, index) => {
        if (card.dataset.noCollapsible === "true" || card.closest(".employee-workbench")) return;
        if (card.dataset.collapsibleReady === "true") return;

        const title = card.querySelector("h3");
        if (!title) return;

        let header = title.closest(".list-toolbar");
        if (!header || !card.contains(header)) {
            header = title.parentElement?.parentElement === card ? title.parentElement : null;
        }

        if (!header || header === card) {
            header = document.createElement("div");
            header.className = "collapsible-header";
            title.parentNode.insertBefore(header, title);
            header.appendChild(title);
        } else {
            header.classList.add("collapsible-header");
        }

        const content = document.createElement("div");
        content.className = "collapsible-content";

        Array.from(card.children)
            .filter((child) => child !== header)
            .forEach((child) => content.appendChild(child));

        const contentId = `collapsible-section-${Date.now()}-${index}`;
        content.id = contentId;
        content.setAttribute("aria-hidden", "true");
        card.appendChild(content);

        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "outline-btn collapsible-toggle";
        toggle.dataset.action = "toggle-collapsible-section";
        toggle.setAttribute("aria-controls", contentId);
        toggle.setAttribute("aria-expanded", "false");
        toggle.textContent = "展開";

        header.appendChild(toggle);
        card.classList.add("is-collapsed");
        card.dataset.collapsibleReady = "true";
    });
}

function getDatasets() {
    return state.dashboard?.datasets || {};
}

function buildThemeStylesFromForm(form) {
    const values = Object.fromEntries(new FormData(form).entries());
    return {
        ...defaultThemeStyles,
        bgDayStart: values.bgDayStart,
        bgDayEnd: values.bgDayEnd,
        bgNightStart: values.bgNightStart,
        bgNightEnd: values.bgNightEnd,
        dayStartTime: values.dayStartTime,
        nightStartTime: values.nightStartTime,
        mainTitleColor: values.mainTitleColor,
        btnAdminBg: values.btnAdminBg,
        btnAdminText: values.btnAdminText,
        btnReportBg: values.btnReportBg,
        btnReportText: values.btnReportText,
        btnAiBg: values.btnAiBg,
        btnAiText: values.btnAiText,
        clockBg: values.clockBg,
        clockText: values.clockText,
        clockBgImage: values.clockBgImage || "",
        browserClockBgImage: values.browserClockBgImage || "",
        clockBgPos: values.clockBgPos,
        clockSymbolsLeft: values.clockSymbolsLeft || "",
        clockSymbolsRight: values.clockSymbolsRight || "",
        blinkEnabled: values.blinkEnabled === "true",
        blinkDayColor: values.blinkDayColor,
        blinkNightColor: values.blinkNightColor,
        punchEffect: values.punchEffect,
        punchFallContent: values.punchFallContent || "",
        punchFlashContent: values.punchFlashContent || ""
    };
}

function updateThemePreviewFromForm() {
    const form = document.getElementById("custom-theme-form");
    const host = document.getElementById("theme-preview-host");
    if (!form || !host) return;
    host.innerHTML = renderThemePreview(buildThemeStylesFromForm(form));
}

function syncAutomationFormVisibility() {
    const form = document.getElementById("automation-form");
    if (!form) return;
    const frequency = form.elements.frequency.value;
    const taskType = form.elements.task_type.value;
    const target = form.elements.target.value;
    const timeField = document.getElementById("automation-time")?.closest(".field");
    const weeklyField = document.getElementById("automation-weekly-day")?.closest(".field");
    const monthlyField = document.getElementById("automation-monthly-day")?.closest(".field");
    const exportTemplateField = document.getElementById("automation-export-template-field");
    if (timeField) timeField.classList.toggle("hidden", frequency === "immediate");
    if (weeklyField) weeklyField.classList.toggle("hidden", frequency !== "weekly");
    if (monthlyField) monthlyField.classList.toggle("hidden", frequency !== "monthly");
    if (exportTemplateField) exportTemplateField.classList.toggle("hidden", !isAttendanceExportTask(taskType, target));
}

function downloadTextFile(filename, content) {
    const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("讀取檔案失敗。"));
        reader.readAsText(file, "utf-8");
    });
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("讀取檔案失敗。"));
        reader.readAsDataURL(file);
    });
}

function escapeCsvCell(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function parseCsv(text) {
    const rows = [];
    let current = "";
    let row = [];
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        const next = text[index + 1];

        if (char === '"') {
            if (inQuotes && next === '"') {
                current += '"';
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === "," && !inQuotes) {
            row.push(current);
            current = "";
        } else if ((char === "\n" || char === "\r") && !inQuotes) {
            if (char === "\r" && next === "\n") index += 1;
            row.push(current);
            if (row.some((value) => value.trim() !== "")) rows.push(row);
            row = [];
            current = "";
        } else {
            current += char;
        }
    }

    if (current.length || row.length) {
        row.push(current);
        if (row.some((value) => value.trim() !== "")) rows.push(row);
    }
    return rows;
}

function normalizeCsvHeader(header) {
    return String(header ?? "")
        .replace(/^\uFEFF/, "")
        .trim();
}

function mergeImportedEmployees(currentEmployees, importedEmployees) {
    const mergedById = new Map(
        currentEmployees.map((employee) => [String(employee.id || ""), { ...employee }])
    );
    const incomingById = new Map();

    for (const employee of importedEmployees) {
        incomingById.set(employee.id, employee);
    }

    let added = 0;
    let updated = 0;

    incomingById.forEach((employee, employeeId) => {
        const existing = mergedById.get(employeeId);
        if (existing) {
            updated += 1;
            mergedById.set(employeeId, { ...existing, ...employee });
            return;
        }

        const matchedByCard = Array.from(mergedById.values()).find((currentEmployee) =>
            currentEmployee.card === employee.card && currentEmployee.id !== employee.id
        );
        if (matchedByCard) {
            updated += 1;
            mergedById.set(matchedByCard.id, {
                ...matchedByCard,
                ...employee,
                id: matchedByCard.id
            });
            return;
        }

        added += 1;
        mergedById.set(employeeId, employee);
    });

    const mergedEmployees = Array.from(mergedById.values())
        .sort((left, right) => String(left.id || "").localeCompare(String(right.id || "")));

    const cardOwners = new Map();
    const duplicateCards = [];
    mergedEmployees.forEach((employee) => {
        const card = String(employee.card || "").trim();
        if (!card) return;
        const owner = cardOwners.get(card);
        if (owner && owner !== employee.id) {
            duplicateCards.push(`${card} (${owner}/${employee.id})`);
            return;
        }
        cardOwners.set(card, employee.id);
    });

    if (duplicateCards.length) {
        const sample = duplicateCards.slice(0, 5).join("、");
        const suffix = duplicateCards.length > 5 ? " 等" : "";
        throw new Error(`CSV 匯入失敗，卡號重複：${sample}${suffix}`);
    }

    return {
        employees: mergedEmployees,
        added,
        updated
    };
}

function buildEmployeeCsv(employees) {
    const headers = ["工號", "姓名", "性別", "部門", "職稱", "卡號", "密碼", "國籍", "身分證字號", "生日", "到職日", "離職日", "銀行帳戶號碼", "聯絡手機", "緊急聯絡人", "緊急聯絡電話", "聯絡地址", "戶籍地址", "家庭概況", "備註"];
    const rows = employees.map((employee) => [
        employee.id,
        employee.name,
        employee.gender || "",
        employee.department || "",
        employee.job_title || "",
        employee.card || "",
        employee.password || "",
        employee.nationality || "",
        employee.national_id || "",
        employee.birth_date || "",
        employee.hire_date || "",
        employee.termination_date || "",
        employee.bank_account || "",
        employee.mobile_phone || "",
        employee.emergency_contact || "",
        employee.emergency_phone || "",
        employee.contact_address || "",
        employee.registered_address || "",
        employee.family_status || "",
        employee.notes || ""
    ].map(escapeCsvCell).join(","));
    return `${headers.join(",")}\r\n${rows.join("\r\n")}`;
}

function buildAttendanceReportCsv(records) {
    const headers = ["工號", "姓名", "部門", "職稱", "日期", "時間", "時間戳", "班別", "打卡類型", "系統狀態", "來源"];
    const rows = records.map((record) => [
        record.employeeId || "",
        record.employeeName || "",
        record.department || "",
        record.jobTitle || "",
        record.dateText || "",
        record.timeText || "",
        record.timestamp || "",
        record.shift || "",
        record.typeText || "",
        record.attendanceStatusText || "",
        record.sourceText || ""
    ].map(escapeCsvCell).join(","));
    return `${headers.join(",")}\r\n${rows.join("\r\n")}`;
}

function resetEmployeeForm() {
    const form = document.getElementById("employee-form");
    if (!form) return;
    form.reset();
    form.elements.editingId.value = "";
}

function resetGreetingForm() {
    const form = document.getElementById("greeting-form");
    if (!form) return;
    form.reset();
    form.elements.editingId.value = "";
    form.elements.type.value = "in";
}

function resetBellForm() {
    const form = document.getElementById("bell-form");
    if (!form) return;
    form.reset();
    form.elements.editingId.value = "";
    Array.from(form.querySelectorAll('input[name="days"]')).forEach((checkbox) => {
        checkbox.checked = false;
    });
    form.elements.duration.value = "5";
}

function resetEffectForm() {
    const form = document.getElementById("effect-form");
    if (!form) return;
    form.reset();
    form.elements.editingId.value = "";
}

function resetThemeScheduleForm() {
    const form = document.getElementById("theme-schedule-form");
    if (!form) return;
    form.reset();
    form.elements.editingId.value = "";
    form.elements.theme_name.value = "default";
}

function resetCustomThemeForm() {
    const form = document.getElementById("custom-theme-form");
    if (!form) return;
    form.reset();
    form.elements.editingId.value = "";
    form.elements.clockBgImage.value = "";
    form.elements.browserClockBgImage.value = "";
    Object.entries(defaultThemeStyles).forEach(([key, value]) => {
        if (form.elements[key]) form.elements[key].value = String(value);
    });
    form.elements.blinkEnabled.value = "false";
    updateThemePreviewFromForm();
}

function resetAutomationForm() {
    const form = document.getElementById("automation-form");
    if (!form) return;
    form.reset();
    form.elements.editingId.value = "";
    form.elements.frequency.value = "immediate";
    form.elements.weeklyDay.value = "1";
    form.elements.monthlyDay.value = "1";
    form.elements.task_type.value = "export";
    form.elements.target.value = "last_week_records";
    form.elements.export_template.value = getAttendanceExportConfig().defaultTemplateId || "full";
    form.elements.enabled.value = "true";
    syncAutomationFormVisibility();
}

function fillEmployeeForm(employeeId) {
    const employee = getDatasets().employees.find((item) => item.id === employeeId);
    const form = document.getElementById("employee-form");
    if (!employee || !form) return;
    Object.entries(employee).forEach(([key, value]) => {
        if (form.elements[key]) form.elements[key].value = value || "";
    });
    form.elements.editingId.value = employee.id;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function fillGreetingForm(greetingId) {
    const greeting = getDatasets().greetings.find((item) => item.id === greetingId);
    const form = document.getElementById("greeting-form");
    if (!greeting || !form) return;
    form.elements.editingId.value = greeting.id;
    form.elements.type.value = greeting.type;
    form.elements.employee_id.value = greeting.employee_id || "";
    form.elements.message.value = greeting.message || "";
    form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function fillBellForm(scheduleId) {
    const schedule = getDatasets().bellSchedules.find((item) => item.id === scheduleId);
    const form = document.getElementById("bell-form");
    if (!schedule || !form) return;
    form.elements.editingId.value = schedule.id;
    form.elements.title.value = schedule.title || "";
    form.elements.time.value = schedule.time || "";
    form.elements.sound.value = schedule.sound || "";
    form.elements.duration.value = String(schedule.duration || 5);
    const activeDays = String(schedule.days || "").split(",");
    Array.from(form.querySelectorAll('input[name="days"]')).forEach((checkbox) => {
        checkbox.checked = activeDays.includes(checkbox.value);
    });
    form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function fillEffectForm(effectId) {
    const effect = getDatasets().specialEffects.find((item) => item.id === effectId);
    const form = document.getElementById("effect-form");
    if (!effect || !form) return;
    form.elements.editingId.value = effect.id;
    form.elements.name.value = effect.name || "";
    form.elements.prefix.value = effect.prefix || "";
    form.elements.suffix.value = effect.suffix || "";
    form.elements.start_date.value = effect.start_date || "";
    form.elements.end_date.value = effect.end_date || "";
    form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function fillThemeScheduleForm(scheduleId) {
    const schedule = getDatasets().themeSchedules.find((item) => item.id === scheduleId);
    const form = document.getElementById("theme-schedule-form");
    if (!schedule || !form) return;
    form.elements.editingId.value = schedule.id;
    form.elements.name.value = schedule.name || "";
    form.elements.theme_name.value = schedule.theme_name || "default";
    form.elements.start_date.value = schedule.start_date || "";
    form.elements.end_date.value = schedule.end_date || "";
    form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function fillCustomThemeForm(themeId) {
    const theme = getDatasets().customThemes.find((item) => item.id === themeId);
    const form = document.getElementById("custom-theme-form");
    if (!theme || !form) return;
    const styles = { ...defaultThemeStyles, ...theme.styles };
    form.elements.editingId.value = theme.id;
    form.elements.name.value = theme.name || "";
    Object.entries(styles).forEach(([key, value]) => {
        if (form.elements[key]) form.elements[key].value = String(value ?? "");
    });
    form.elements.clockBgImage.value = styles.clockBgImage || "";
    form.elements.browserClockBgImage.value = styles.browserClockBgImage || "";
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    updateThemePreviewFromForm();
}

function fillAutomationForm(taskId) {
    const task = getDatasets().automationTasks.find((item) => item.id === taskId);
    const form = document.getElementById("automation-form");
    if (!task || !form) return;
    form.elements.editingId.value = task.id;
    form.elements.frequency.value = task.frequency;
    form.elements.time.value = task.time || "";
    form.elements.weeklyDay.value = task.day || "1";
    form.elements.monthlyDay.value = task.day || "1";
    form.elements.task_type.value = task.task_type;
    form.elements.target.value = task.target;
    form.elements.export_template.value = task.export_template || getAttendanceExportConfig().defaultTemplateId || "full";
    form.elements.enabled.value = String(Boolean(task.enabled));
    syncAutomationFormVisibility();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function handleLoginSubmit(event) {
    event.preventDefault();
    setMessage(ui.loginMessage, "");
    ui.loginSubmitBtn.disabled = true;

    try {
        const result = await requestJson("/api/browser/login", {
            method: "POST",
            body: {
                role: state.activeRole,
                employeeId: ui.employeeIdInput.value.trim(),
                secret: ui.secretInput.value.trim()
            }
        });

        state.token = result.token;
        sessionStorage.setItem("browserPortalToken", state.token);
        ui.loginView.classList.add("hidden");
        ui.dashboardView.classList.remove("hidden");
        renderDashboard(result.dashboard);
        initializeRealtimeSync();
        setMessage(ui.dashboardMessage, "登入成功。", "success");
    } catch (error) {
        setMessage(ui.loginMessage, error.message, "error");
    } finally {
        ui.loginSubmitBtn.disabled = false;
    }
}

async function handleEmployeePunch() {
    const result = await requestJson("/api/browser/punch", {
        method: "POST",
        auth: true
    });
    renderDashboard(result.data.dashboard);
    setMessage(ui.dashboardMessage, result.message, result.message.includes("重複打卡") ? "info" : "success");
}

async function handleLogout(isSilent = false) {
    try {
        if (state.token && !isSilent) {
            await requestJson("/api/browser/logout", {
                method: "POST",
                auth: true
            });
        }
    } catch (error) {
        console.error(error);
    }

    stopClock();
    closeRealtimeSync();
    closeDashboardHelpModal();
    closeDashboardInsightModal();
    state.token = "";
    state.dashboard = null;
    state.adminReport = null;
    state.employeeWorkspacePanel = "";
    state.adminPeopleFilters = createDefaultAdminPeopleFilterState();
    state.activeSections.admin = "people";
    state.activeSections.developer = "automation";
    state.collapsibleStates = {};
    sessionStorage.removeItem("browserPortalToken");
    ui.dashboardContent.innerHTML = "";
    syncDashboardIdentityPill(null);
    syncDashboardVersionPill(null);
    syncDashboardHelpButton(null);
    setMessage(ui.dashboardMessage, "");
    ui.dashboardView.classList.add("hidden");
    ui.loginView.classList.remove("hidden");
    ui.secretInput.value = "";
    syncHeroHeader();
}

async function restoreSessionIfNeeded() {
    if (!state.token) return;
    try {
        const dashboard = await fetchDashboard();
        ui.loginView.classList.add("hidden");
        ui.dashboardView.classList.remove("hidden");
        renderDashboard(dashboard);
        initializeRealtimeSync();
        setMessage(ui.dashboardMessage, "已恢復上次登入狀態。", "info");
    } catch (error) {
        await handleLogout(true);
    }
}

async function saveAndReload(url, body, message) {
    await requestJson(url, {
        method: "POST",
        body,
        auth: true
    });
    await reloadDashboard(message);
}

async function handleDashboardClick(event) {
    const insightTarget = event.target.closest("[data-insight-key]");
    if (insightTarget) {
        openAdminDashboardInsight(insightTarget.dataset.insightKey);
        return;
    }

    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) return;

    const action = actionTarget.dataset.action;
    const datasets = getDatasets();

    try {
        if (action === "employee-punch") return handleEmployeePunch();
        if (action === "refresh-dashboard") return reloadDashboard("資料已更新。");
        if (action === "select-employee-workspace-panel") {
            const panelId = actionTarget.dataset.panel || "";
            state.employeeWorkspacePanel = state.employeeWorkspacePanel === panelId ? "" : panelId;
            renderDashboard(state.dashboard);
            return;
        }
        if (action === "switch-section") {
            state.activeSections[actionTarget.dataset.role] = actionTarget.dataset.section;
            renderDashboard(state.dashboard);
            return;
        }
        if (action === "reset-admin-report") {
            state.adminReport = createDefaultAdminReportState();
            renderDashboard(state.dashboard);
            setMessage(ui.dashboardMessage, "考勤報表條件已重設。", "info");
            return;
        }
        if (action === "jump-leave-routes") {
            state.activeSections.admin = "leave";
            renderDashboard(state.dashboard);
            const employee = datasets.employees.find((item) => item.id === actionTarget.dataset.id);
            const supervisorDepartments = getSupervisorDepartmentsForEmployee(actionTarget.dataset.id, datasets);
            const suffix = supervisorDepartments.length
                ? `目前負責：${supervisorDepartments.join("、")}`
                : "可在主管審核路徑中設定這位員工負責的部門。";
            setMessage(ui.dashboardMessage, `${employee?.name || actionTarget.dataset.id} 的請假主管設定已開啟。${suffix}`, "info");
            return;
        }
        if (action === "export-admin-report") {
            const reportState = ensureAdminReportState();
            const templateId = actionTarget.dataset.template || "payroll";
            if (!reportState.queried) {
                throw new Error("請先查詢考勤報表，再進行匯出。");
            }
            if (!reportState.records.length) {
                throw new Error("目前查詢結果沒有可匯出的資料。");
            }
            const result = await requestJson("/api/browser/admin/reports/export", {
                method: "POST",
                body: {
                    employeeId: reportState.filters.employeeId || "",
                    startDate: reportState.filters.startDate,
                    endDate: reportState.filters.endDate,
                    templateId
                },
                auth: true
            });
            downloadTextFile(result.data.fileName, result.data.csvContent);
            setMessage(ui.dashboardMessage, templateId === "payroll_leave" ? "薪資請假明細已匯出為 CSV。" : "考勤報表已匯出為 CSV。", "success");
            return;
        }
        if (action === "reset-employee-form") return resetEmployeeForm();
        if (action === "reset-employee-filters") {
            state.adminPeopleFilters = createDefaultAdminPeopleFilterState();
            renderDashboard(state.dashboard);
            setMessage(ui.dashboardMessage, "員工名冊篩選已清除。", "info");
            return;
        }
        if (action === "reset-employee-columns") {
            resetEmployeeRosterVisibleColumns();
            refreshEmployeeDirectoryView();
            setMessage(ui.dashboardMessage, "名冊欄位已還原為最精簡顯示。", "info");
            return;
        }
        if (action === "trigger-employee-import") return document.getElementById("employee-import-file")?.click();
        if (action === "export-employees") {
            downloadTextFile(`員工資料_${formatDateInputValue(new Date())}.csv`, buildEmployeeCsv(datasets.employees));
            setMessage(ui.dashboardMessage, "已產生員工 CSV。", "success");
            return;
        }
        if (action === "edit-employee") return fillEmployeeForm(actionTarget.dataset.id);
        if (action === "delete-employee") {
            if (!window.confirm("確定要刪除這位員工嗎？")) return;
            return saveAndReload("/api/browser/admin/employee/delete", {
                employeeId: actionTarget.dataset.id
            }, "員工已刪除。");
        }
        if (action === "reset-greeting-form") return resetGreetingForm();
        if (action === "edit-greeting") return fillGreetingForm(actionTarget.dataset.id);
        if (action === "delete-greeting") {
            if (!window.confirm("確定要刪除這則問候語嗎？")) return;
            return saveAndReload("/api/browser/admin/greetings/save", {
                greetings: datasets.greetings.filter((greeting) => greeting.id !== actionTarget.dataset.id)
            }, "問候語已刪除。");
        }
        if (action === "reset-bell-form") return resetBellForm();
        if (action === "edit-bell") return fillBellForm(actionTarget.dataset.id);
        if (action === "delete-bell") {
            if (!window.confirm("確定要刪除這個響鈴場景嗎？")) return;
            return saveAndReload("/api/browser/admin/bell-schedules/save", {
                bellSchedules: datasets.bellSchedules.filter((schedule) => schedule.id !== actionTarget.dataset.id)
            }, "響鈴場景已刪除。");
        }
        if (action === "trigger-sound-upload") return document.getElementById("sound-upload-file")?.click();
        if (action === "play-sound") {
            ui.audioPlayer.src = actionTarget.dataset.url || "";
            await ui.audioPlayer.play();
            return;
        }
        if (action === "delete-sound") {
            if (!window.confirm("確定要刪除這個聲音嗎？")) return;
            return saveAndReload("/api/browser/admin/custom-sounds/save", {
                customSounds: datasets.customSounds.filter((sound) => sound.id !== actionTarget.dataset.id)
            }, "聲音已刪除。");
        }
        if (action === "clear-bell-history") {
            if (!window.confirm("確定要清空響鈴歷史嗎？")) return;
            return saveAndReload("/api/browser/admin/bell-history/clear", {}, "響鈴歷史已清空。");
        }
        if (action === "reset-effect-form") return resetEffectForm();
        if (action === "edit-effect") return fillEffectForm(actionTarget.dataset.id);
        if (action === "delete-effect") {
            if (!window.confirm("確定要刪除這個節日特效嗎？")) return;
            return saveAndReload("/api/browser/admin/special-effects/save", {
                specialEffects: datasets.specialEffects.filter((effect) => effect.id !== actionTarget.dataset.id)
            }, "節日特效已刪除。");
        }
        if (action === "reset-theme-schedule-form") return resetThemeScheduleForm();
        if (action === "edit-theme-schedule") return fillThemeScheduleForm(actionTarget.dataset.id);
        if (action === "delete-theme-schedule") {
            if (!window.confirm("確定要刪除這個主題排程嗎？")) return;
            return saveAndReload("/api/browser/admin/theme-schedules/save", {
                themeSchedules: datasets.themeSchedules.filter((schedule) => schedule.id !== actionTarget.dataset.id)
            }, "主題排程已刪除。");
        }
        if (action === "trigger-theme-image-upload") return document.getElementById("theme-image-file")?.click();
        if (action === "reset-custom-theme-form") return resetCustomThemeForm();
        if (action === "clear-theme-image") {
            const form = document.getElementById("custom-theme-form");
            if (form) {
                form.elements.clockBgImage.value = "";
                form.elements.browserClockBgImage.value = "";
                updateThemePreviewFromForm();
            }
            return;
        }
        if (action === "edit-custom-theme") return fillCustomThemeForm(actionTarget.dataset.id);
        if (action === "delete-custom-theme") {
            if (!window.confirm("確定要刪除這個自訂主題嗎？")) return;
            return saveAndReload("/api/browser/admin/custom-themes/save", {
                customThemes: datasets.customThemes.filter((theme) => theme.id !== actionTarget.dataset.id)
            }, "自訂主題已刪除。");
        }
        if (action === "reset-automation-form") return resetAutomationForm();
        if (action === "edit-automation-task") return fillAutomationForm(actionTarget.dataset.id);
        if (action === "delete-automation-task") {
            if (!window.confirm("確定要刪除這個自動化任務嗎？")) return;
            return saveAndReload("/api/browser/developer/automation-tasks/save", {
                automationTasks: datasets.automationTasks.filter((task) => task.id !== actionTarget.dataset.id)
            }, "自動化任務已刪除。");
        }
        if (action === "clear-automation-log") {
            if (!window.confirm("確定要清空自動化日誌嗎？")) return;
            return saveAndReload("/api/browser/developer/automation-log/clear", {}, "自動化日誌已清空。");
        }
    } catch (error) {
        setMessage(ui.dashboardMessage, error.message, "error");
    }
}

async function handleDashboardChange(event) {
    const target = event.target;
    const datasets = getDatasets();

    try {
        if (target.matches(".employee-column-toggle")) {
            const columnKey = String(target.dataset.column || "").trim();
            const allowedKeys = new Set(EMPLOYEE_ROSTER_OPTIONAL_COLUMNS.map((column) => column.key));
            if (!allowedKeys.has(columnKey)) return;

            const nextColumns = new Set(getEmployeeRosterVisibleColumns());
            if (target.checked) nextColumns.add(columnKey);
            else nextColumns.delete(columnKey);

            setEmployeeRosterVisibleColumns(Array.from(nextColumns));
            refreshEmployeeDirectoryView();
            return;
        }
        if (target.id === "employee-filter-department" || target.id === "employee-visible-rows") {
            const filters = ensureAdminPeopleFilters();
            if (target.id === "employee-filter-department") filters.department = target.value || "";
            if (target.id === "employee-visible-rows") filters.visibleRows = target.value === "50" ? "50" : "25";
            refreshEmployeeDirectoryView();
            return;
        }
        if (target.matches('[data-action="toggle-bell"]')) {
            const updated = datasets.bellSchedules.map((item) => item.id === target.dataset.id ? { ...item, enabled: target.checked } : item);
            return saveAndReload("/api/browser/admin/bell-schedules/save", { bellSchedules: updated }, "響鈴場景狀態已更新。");
        }
        if (target.matches('[data-action="toggle-effect"]')) {
            const updated = datasets.specialEffects.map((item) => item.id === target.dataset.id ? { ...item, enabled: target.checked } : item);
            return saveAndReload("/api/browser/admin/special-effects/save", { specialEffects: updated }, "節日特效狀態已更新。");
        }
        if (target.matches('[data-action="toggle-theme-schedule"]')) {
            const updated = datasets.themeSchedules.map((item) => item.id === target.dataset.id ? { ...item, enabled: target.checked } : item);
            return saveAndReload("/api/browser/admin/theme-schedules/save", { themeSchedules: updated }, "主題排程狀態已更新。");
        }
        if (target.matches('[data-action="toggle-automation-task"]')) {
            const updated = datasets.automationTasks.map((item) => item.id === target.dataset.id ? { ...item, enabled: target.checked } : item);
            return saveAndReload("/api/browser/developer/automation-tasks/save", { automationTasks: updated }, "自動化任務狀態已更新。");
        }
        if (target.id === "employee-import-file" && target.files?.[0]) {
            const csvText = await readFileAsText(target.files[0]);
            const rows = parseCsv(csvText);
            const headers = (rows[0] || []).map(normalizeCsvHeader);
            const keyMap = {
                "工號": "id", "id": "id",
                "姓名": "name", "name": "name",
                "性別": "gender", "gender": "gender",
                "部門": "department", "department": "department",
                "職稱": "job_title", "job_title": "job_title",
                "卡號": "card", "card": "card",
                "密碼": "password", "password": "password",
                "國籍": "nationality", "nationality": "nationality",
                "身分證字號": "national_id", "national_id": "national_id",
                "生日": "birth_date", "birth_date": "birth_date",
                "出生日": "birth_date",
                "到職日": "hire_date", "hire_date": "hire_date",
                "離職日": "termination_date", "termination_date": "termination_date",
                "銀行帳戶號碼": "bank_account", "bank_account": "bank_account",
                "聯絡手機": "mobile_phone", "mobile_phone": "mobile_phone",
                "緊急聯絡人": "emergency_contact", "emergency_contact": "emergency_contact",
                "緊急聯絡電話": "emergency_phone", "emergency_phone": "emergency_phone",
                "聯絡地址": "contact_address", "contact_address": "contact_address",
                "戶籍地址": "registered_address", "registered_address": "registered_address",
                "家庭概況": "family_status", "family_status": "family_status",
                "備註": "notes", "notes": "notes"
            };
            const parsedEmployees = rows.slice(1).map((row) => {
                const employee = {};
                headers.forEach((header, index) => {
                    const key = keyMap[header];
                    if (key) employee[key] = row[index] || "";
                });
                return employee;
            });
            const incoming = parsedEmployees
                .map((employee) => ({
                    id: String(employee.id || "").trim(),
                    name: String(employee.name || "").trim(),
                    gender: String(employee.gender || "").trim(),
                    nationality: String(employee.nationality || "").trim(),
                    department: String(employee.department || "").trim(),
                    job_title: String(employee.job_title || "").trim(),
                    card: String(employee.card || "").trim(),
                    password: String(employee.password || "").trim(),
                    national_id: String(employee.national_id || "").trim(),
                    birth_date: String(employee.birth_date || "").trim(),
                    hire_date: String(employee.hire_date || "").trim(),
                    termination_date: String(employee.termination_date || "").trim(),
                    bank_account: String(employee.bank_account || "").trim(),
                    mobile_phone: String(employee.mobile_phone || "").trim(),
                    emergency_contact: String(employee.emergency_contact || "").trim(),
                    emergency_phone: String(employee.emergency_phone || "").trim(),
                    contact_address: String(employee.contact_address || "").trim(),
                    registered_address: String(employee.registered_address || "").trim(),
                    family_status: String(employee.family_status || "").trim(),
                    notes: String(employee.notes || "").trim()
                }))
                .filter((employee) => employee.id && employee.name && employee.card && employee.password && employee.department);
            const skipped = parsedEmployees.length - incoming.length;

            if (!incoming.length) {
                target.value = "";
                setMessage(ui.dashboardMessage, "CSV 內沒有符合格式的員工資料，或必要欄位不足。", "error");
                return;
            }

            const mergedResult = mergeImportedEmployees(datasets.employees, incoming);
            const summary = skipped > 0
                ? `CSV 匯入完成：新增 ${mergedResult.added} 筆、更新 ${mergedResult.updated} 筆、略過 ${skipped} 筆。`
                : `CSV 匯入完成：新增 ${mergedResult.added} 筆、更新 ${mergedResult.updated} 筆。`;

            target.value = "";
            return saveAndReload("/api/browser/admin/employees/save", { employees: mergedResult.employees }, summary);
        }
        if (target.id === "sound-upload-file" && target.files?.[0]) {
            const file = target.files[0];
            const dataUrl = await readFileAsDataUrl(file);
            target.value = "";
            await requestJson("/api/browser/admin/custom-sounds/upload", {
                method: "POST",
                body: { dataUrl, fileName: file.name },
                auth: true
            });
            return reloadDashboard("聲音檔已上傳。");
        }
        if (target.id === "theme-image-file" && target.files?.[0]) {
            const file = target.files[0];
            const dataUrl = await readFileAsDataUrl(file);
            const result = await requestJson("/api/browser/admin/custom-themes/upload-image", {
                method: "POST",
                body: { dataUrl, fileName: file.name },
                auth: true
            });
            const form = document.getElementById("custom-theme-form");
            if (form) {
                form.elements.clockBgImage.value = result.data.path;
                form.elements.browserClockBgImage.value = result.data.browserUrl;
                updateThemePreviewFromForm();
            }
            target.value = "";
            setMessage(ui.dashboardMessage, "主題背景圖已上傳，記得再儲存主題。", "success");
            return;
        }
        if (["automation-frequency", "automation-task-type", "automation-target"].includes(target.id)) syncAutomationFormVisibility();
        if (target.closest("#custom-theme-form")) updateThemePreviewFromForm();
    } catch (error) {
        setMessage(ui.dashboardMessage, error.message, "error");
    }
}

async function handleDashboardSubmit(event) {
    event.preventDefault();
    const form = event.target instanceof HTMLFormElement
        ? event.target
        : event.target?.closest?.("form");
    if (!form) return;
    const formId = form.getAttribute("id") || "";
    const datasets = getDatasets();
    setFormMessage(formId, "");

    try {
        if (formId === "hero-description-form") {
            const values = Object.fromEntries(new FormData(form).entries());
            const result = await requestJson("/api/browser/developer/hero-description/save", {
                method: "POST",
                body: {
                    heroDescription: values.heroDescription?.trim() || ""
                },
                auth: true
            });
            await reloadDashboard(result.message || "頁首頁說明已更新。");
            return;
        }
        if (formId === "employee-form") {
            const values = Object.fromEntries(new FormData(form).entries());
            const originalId = values.editingId?.trim() || "";
            const employee = {
                id: values.id?.trim(),
                name: values.name?.trim(),
                gender: values.gender?.trim(),
                nationality: values.nationality?.trim(),
                department: values.department?.trim(),
                job_title: values.job_title?.trim(),
                card: values.card?.trim(),
                password: values.password?.trim(),
                national_id: values.national_id?.trim() || "",
                birth_date: values.birth_date || "",
                hire_date: values.hire_date || "",
                termination_date: values.termination_date || "",
                bank_account: values.bank_account?.trim() || "",
                mobile_phone: values.mobile_phone?.trim() || "",
                emergency_contact: values.emergency_contact?.trim() || "",
                emergency_phone: values.emergency_phone?.trim() || "",
                contact_address: values.contact_address?.trim() || "",
                registered_address: values.registered_address?.trim() || "",
                family_status: values.family_status?.trim() || "",
                notes: values.notes?.trim() || ""
            };
            if (!employee.id || !employee.name || !employee.department || !employee.card || !employee.password) {
                throw new Error("工號、姓名、部門、卡號與密碼為必填。");
            }
            if (datasets.employees.some((item) => item.card === employee.card && item.id !== (originalId || employee.id))) {
                throw new Error("卡號不可與其他員工重複。");
            }
            await saveAndReload("/api/browser/admin/employee/save", { employee, originalId }, "員工資料已儲存。");
            return;
        }
        if (formId === "attendance-report-form") {
            const values = Object.fromEntries(new FormData(form).entries());
            const result = await requestJson("/api/browser/admin/reports/query", {
                method: "POST",
                body: {
                    employeeId: values.employeeId?.trim() || "",
                    startDate: values.startDate,
                    endDate: values.endDate
                },
                auth: true
            });
            state.adminReport = {
                ...result.data,
                queried: true
            };
            renderDashboard(state.dashboard);
            setMessage(ui.dashboardMessage, result.message || "考勤報表查詢完成。", "success");
            return;
        }
        if (formId === "shift-form") {
            const shifts = Array.from(form.querySelectorAll(".shift-row")).map((row) => ({
                name: row.querySelector('[name="shift-name"]').value.trim(),
                start: row.querySelector('[name="shift-start"]').value,
                end: row.querySelector('[name="shift-end"]').value
            })).filter((shift) => shift.name && shift.start && shift.end);
            return saveAndReload("/api/browser/admin/shifts/save", { shifts }, "班別設定已更新。");
        }
        if (formId === "manual-punch-form") {
            const values = Object.fromEntries(new FormData(form).entries());
            return saveAndReload("/api/browser/admin/manual-punch", values, "手動補登完成。");
        }
        if (formId === "data-settings-form") {
            const values = Object.fromEntries(new FormData(form).entries());
            return saveAndReload("/api/browser/admin/data-settings", values, "主畫面設定已更新。");
        }
        if (formId === "admin-password-form") {
            const values = Object.fromEntries(new FormData(form).entries());
            await saveAndReload("/api/browser/admin/change-admin-password", values, "管理者密碼已更新。");
            form.reset();
            setFormMessage(formId, "管理者密碼已更新。", "success");
            return;
        }
        if (formId === "greeting-form") {
            const values = Object.fromEntries(new FormData(form).entries());
            const nextGreeting = {
                id: values.editingId || `greeting_${Date.now()}`,
                type: values.type,
                employee_id: values.employee_id?.trim() || null,
                message: values.message?.trim()
            };
            const updated = values.editingId
                ? datasets.greetings.map((item) => item.id === values.editingId ? nextGreeting : item)
                : [...datasets.greetings, nextGreeting];
            await saveAndReload("/api/browser/admin/greetings/save", { greetings: updated }, "問候語已更新。");
            return;
        }
        if (formId === "bell-form") {
            const values = Object.fromEntries(new FormData(form).entries());
            const days = Array.from(form.querySelectorAll('input[name="days"]:checked')).map((checkbox) => checkbox.value);
            if (!days.length) throw new Error("請至少選擇一個啟用星期。");
            const nextBell = {
                id: values.editingId || `schedule_${Date.now()}`,
                title: values.title?.trim(),
                time: values.time,
                sound: values.sound,
                duration: Number(values.duration) || 5,
                days,
                enabled: values.editingId ? datasets.bellSchedules.find((item) => item.id === values.editingId)?.enabled : true
            };
            const updated = values.editingId
                ? datasets.bellSchedules.map((item) => item.id === values.editingId ? nextBell : item)
                : [...datasets.bellSchedules, nextBell];
            await saveAndReload("/api/browser/admin/bell-schedules/save", { bellSchedules: updated }, "響鈴場景已更新。");
            return;
        }
        if (formId === "effect-form") {
            const values = Object.fromEntries(new FormData(form).entries());
            const existingEffect = values.editingId
                ? datasets.specialEffects.find((item) => item.id === values.editingId)
                : null;
            const nextEffect = {
                id: values.editingId || `effect_${Date.now()}`,
                name: values.name?.trim(),
                prefix: values.prefix?.trim() || "",
                suffix: values.suffix?.trim() || "",
                start_date: values.start_date,
                end_date: values.end_date,
                enabled: existingEffect ? Boolean(existingEffect.enabled) : true
            };
            const updated = values.editingId
                ? datasets.specialEffects.map((item) => item.id === values.editingId ? nextEffect : item)
                : [...datasets.specialEffects, nextEffect];
            await saveAndReload("/api/browser/admin/special-effects/save", { specialEffects: updated }, "節日特效已更新。");
            return;
        }
        if (formId === "theme-schedule-form") {
            const values = Object.fromEntries(new FormData(form).entries());
            const existingSchedule = values.editingId
                ? datasets.themeSchedules.find((item) => item.id === values.editingId)
                : null;
            const nextSchedule = {
                id: values.editingId || `theme_schedule_${Date.now()}`,
                name: values.name?.trim(),
                theme_name: values.theme_name,
                start_date: values.start_date,
                end_date: values.end_date,
                enabled: existingSchedule ? Boolean(existingSchedule.enabled) : true
            };
            const updated = values.editingId
                ? datasets.themeSchedules.map((item) => item.id === values.editingId ? nextSchedule : item)
                : [...datasets.themeSchedules, nextSchedule];
            await saveAndReload("/api/browser/admin/theme-schedules/save", { themeSchedules: updated }, "主題排程已更新。");
            return;
        }
        if (formId === "custom-theme-form") {
            const values = Object.fromEntries(new FormData(form).entries());
            const nextTheme = {
                id: values.editingId || `custom_${Date.now()}`,
                name: values.name?.trim(),
                styles: buildThemeStylesFromForm(form)
            };
            if (!nextTheme.name) throw new Error("請輸入主題名稱。");
            const updated = values.editingId
                ? datasets.customThemes.map((item) => item.id === values.editingId ? nextTheme : item)
                : [...datasets.customThemes, nextTheme];
            await saveAndReload("/api/browser/admin/custom-themes/save", { customThemes: updated }, "自訂主題已更新。");
            return;
        }
        if (formId === "automation-form") {
            const values = Object.fromEntries(new FormData(form).entries());
            const frequency = values.frequency;
            const task = {
                id: values.editingId || `auto_task_${Date.now()}`,
                frequency,
                day: frequency === "monthly" ? values.monthlyDay : values.weeklyDay,
                time: frequency === "immediate" ? "" : values.time,
                task_type: values.task_type,
                target: values.target,
                export_template: isAttendanceExportTask(values.task_type, values.target)
                    ? (values.export_template || getAttendanceExportConfig(datasets).defaultTemplateId || "full")
                    : "full",
                enabled: values.enabled === "true"
            };

            if (frequency === "immediate" && !values.editingId) {
                const result = await requestJson("/api/browser/developer/automation-tasks/execute", {
                    method: "POST",
                    body: task,
                    auth: true
                });
                await reloadDashboard(result.message || "立即任務已執行。");
                return;
            }

            const updated = values.editingId
                ? datasets.automationTasks.map((item) => item.id === values.editingId ? task : item)
                : [...datasets.automationTasks, task];
            await saveAndReload("/api/browser/developer/automation-tasks/save", { automationTasks: updated }, "自動化任務已更新。");
            return;
        }
        if (formId === "attendance-export-settings-form") {
            const customFields = Array.from(form.querySelectorAll('input[name="customFields"]:checked'))
                .map((checkbox) => checkbox.value);
            if (!customFields.length) {
                throw new Error("自訂格式至少要保留一個欄位。");
            }
            return saveAndReload("/api/browser/developer/attendance-export-settings/save", { customFields }, "考勤報表匯出欄位設定已更新。");
        }
        if (formId === "system-password-form") {
            const values = Object.fromEntries(new FormData(form).entries());
            await saveAndReload("/api/browser/developer/change-system-password", values, "系統密碼已更新。");
            form.reset();
            setFormMessage(formId, "系統密碼已更新。", "success");
            return;
        }
    } catch (error) {
        setMessage(ui.dashboardMessage, error.message, "error");
        setFormMessage(formId, error.message, "error");
    }
}

renderAutomationTasks = function renderAutomationTasksOverride(tasks, exportConfig = getAttendanceExportConfig(), automationExportConfig = getAutomationExportConfig()) {
    if (!tasks.length) return renderEmptyState("目前尚未建立任何自動化任務。");
    return `
        <div class="record-list">
            ${tasks.map((task) => {
                const exportDirectory = task.export_directory || automationExportConfig.defaultDirectory || automationExportConfig.fallbackDirectory || "桌面";
                const exportDirectoryLabel = task.export_directory
                    ? "任務專用"
                    : automationExportConfig.defaultDirectory
                        ? "預設資料夾"
                        : "桌面回退";

                return `
                    <div class="list-item">
                        <div class="list-item-top">
                            <span>${escapeHtml(automationFrequencyLabels[task.frequency] || task.frequency)} / ${escapeHtml(automationTaskLabels[task.task_type] || task.task_type)}</span>
                            <div class="inline-actions">
                                <label class="switch-line"><input type="checkbox" data-action="toggle-automation-task" data-id="${escapeHtml(task.id)}" ${task.enabled ? "checked" : ""}>啟用</label>
                                <button class="mini-btn" type="button" data-action="edit-automation-task" data-id="${escapeHtml(task.id)}">編輯</button>
                                <button class="mini-btn" type="button" data-action="delete-automation-task" data-id="${escapeHtml(task.id)}">刪除</button>
                            </div>
                        </div>
                        <div class="record-subline">
                            目標：${escapeHtml(automationTargetLabels[task.target] || task.target)}
                            ｜時間：${escapeHtml(task.time || "立即執行")}
                            ｜執行日：${escapeHtml(task.day || "-")}
                            ${isAttendanceExportTask(task.task_type, task.target)
                                ? `｜考勤模板：${escapeHtml(
                                    exportConfig.templates.find((template) => template.id === task.export_template)?.label
                                    || getAttendanceExportTemplateLabel(task.export_template)
                                )}`
                                : ""}
                            ${task.task_type === "export"
                                ? `｜匯出資料夾：${escapeHtml(exportDirectory)} (${escapeHtml(exportDirectoryLabel)})`
                                : ""}
                        </div>
                    </div>
                `;
            }).join("")}
        </div>
    `;
};

renderDeveloperAutomationSection = function renderDeveloperAutomationSectionOverride(datasets) {
    const exportConfig = getAttendanceExportConfig(datasets);
    const automationExportConfig = getAutomationExportConfig(datasets);
    const templateOptions = exportConfig.templates.length
        ? exportConfig.templates.map((template) => `<option value="${escapeHtml(template.id)}">${escapeHtml(template.label)}</option>`).join("")
        : `<option value="full">完整格式</option>`;
    const effectiveDirectory = automationExportConfig.effectiveDirectory || automationExportConfig.fallbackDirectory || "";
    const defaultDirectory = automationExportConfig.defaultDirectory || "";

    return `
        <div class="workspace-stack">
            <article class="workspace-card">
                <div class="list-toolbar">
                    <div>
                        <p class="sub-kicker">AI 系統控制</p>
                        <h3>自動化任務</h3>
                    </div>
                    <div class="badge-row">
                        ${renderBadge(`任務 ${datasets.automationTasks.length} 筆`, "success")}
                        ${renderBadge(`日誌 ${datasets.automationLog.length} 筆`)}
                    </div>
                </div>
                <p class="helper-text">排程匯出時會優先使用任務專用資料夾，其次使用預設匯出資料夾；若都沒有設定，就會回退到桌面。</p>
                <div class="record-subline mono-text">${escapeHtml(defaultDirectory || effectiveDirectory || "桌面")}</div>
            </article>

            <article class="sub-panel">
                <h3>任務設定</h3>
                <form id="automation-form" class="stack-form">
                    <input type="hidden" name="editingId" value="">
                    <div class="field-grid">
                        <label class="field"><span>頻率</span><select name="frequency" id="automation-frequency"><option value="immediate">立即</option><option value="daily">每日</option><option value="weekly">每週</option><option value="monthly">每月</option></select></label>
                        <label class="field"><span>時間</span><input name="time" id="automation-time" type="time"></label>
                        <label class="field"><span>每週執行日</span><select name="weeklyDay" id="automation-weekly-day">${dayLabels.map((day, index) => `<option value="${index}">${day}</option>`).join("")}</select></label>
                        <label class="field"><span>每月幾號</span><select name="monthlyDay" id="automation-monthly-day">${Array.from({ length: 31 }, (_, index) => `<option value="${index + 1}">${index + 1}</option>`).join("")}</select></label>
                        <label class="field"><span>任務類型</span><select name="task_type" id="automation-task-type"><option value="export">匯出</option><option value="delete">刪除</option></select></label>
                        <label class="field"><span>任務目標</span><select name="target" id="automation-target">${Object.entries(automationTargetLabels).map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join("")}</select></label>
                        <label class="field hidden" id="automation-export-template-field"><span>考勤模板</span><select name="export_template" id="automation-export-template">${templateOptions}</select></label>
                        <label class="field hidden" id="automation-export-directory-field"><span>任務專用資料夾</span><input name="export_directory" id="automation-export-directory-input" type="text" placeholder="留空時使用預設匯出資料夾"></label>
                        <label class="field"><span>啟用狀態</span><select name="enabled"><option value="true">啟用</option><option value="false">停用</option></select></label>
                    </div>
                    <div class="inline-actions hidden" id="automation-export-directory-actions">
                        <button class="outline-btn" type="button" data-action="pick-automation-task-directory">選擇任務資料夾</button>
                        <button class="outline-btn" type="button" data-action="clear-automation-task-directory">清空任務資料夾</button>
                    </div>
                    <p class="helper-text">目前有效匯出位置：<span class="mono-text">${escapeHtml(effectiveDirectory || "桌面")}</span></p>
                    <div class="form-toolbar">
                        <button class="primary-btn" type="submit">儲存 / 執行任務</button>
                        <button class="outline-btn" type="button" data-action="reset-automation-form">重設任務表單</button>
                    </div>
                    <div class="inline-message" data-form-message-for="automation-form" aria-live="polite"></div>
                </form>
                ${renderAutomationTasks(datasets.automationTasks, exportConfig, automationExportConfig)}
            </article>
        </div>
    `;
};

renderDeveloperExportSection = function renderDeveloperExportSectionOverride(datasets) {
    const exportConfig = getAttendanceExportConfig(datasets);
    const customTemplate = exportConfig.templates.find((template) => template.id === "custom");
    const automationExportConfig = getAutomationExportConfig(datasets);
    const auditArchiveConfig = getAuditArchiveConfig(datasets);
    const defaultDirectory = automationExportConfig.defaultDirectory || "";
    const fallbackDirectory = automationExportConfig.fallbackDirectory || "";
    const effectiveDirectory = automationExportConfig.effectiveDirectory || fallbackDirectory || "";
    const archiveDefaultDirectory = auditArchiveConfig.defaultDirectory || "";
    const archiveFallbackDirectory = auditArchiveConfig.fallbackDirectory || "";
    const archiveEffectiveDirectory = auditArchiveConfig.effectiveDirectory || archiveFallbackDirectory || "";
    const recentArchives = Array.isArray(auditArchiveConfig.recentArchives) ? auditArchiveConfig.recentArchives : [];

    return `
        <div class="workspace-stack">
            <article class="workspace-card">
                <div class="list-toolbar">
                    <div>
                        <p class="sub-kicker">AI 系統控制</p>
                        <h3>考勤報表匯出設定</h3>
                    </div>
                    <div class="badge-row">
                        ${renderBadge(`模板 ${exportConfig.templates.length} 組`, "success")}
                        ${renderBadge(`自訂欄位 ${exportConfig.customFields.length} 項`)}
                    </div>
                </div>
                <p class="helper-text">這裡同時管理考勤報表匯出模板，以及 AI 自動化匯出的預設資料夾。</p>
            </article>

            <article class="sub-panel">
                <h3>自動化匯出資料夾</h3>
                ${buildKeyValueGrid([
                    { label: "預設匯出資料夾", value: defaultDirectory || "(未設定)", mono: true },
                    { label: "目前有效匯出位置", value: effectiveDirectory || "-", mono: true },
                    { label: "桌面回退位置", value: fallbackDirectory || "-", mono: true },
                    { label: "目前狀態", value: automationExportConfig.usingFallback ? "未設定預設資料夾，將回退到桌面" : "已啟用預設匯出資料夾" }
                ])}
                <form id="automation-export-directory-form" class="stack-form">
                    <label class="field">
                        <span>預設匯出資料夾</span>
                        <input name="defaultDirectory" id="automation-default-directory" type="text" value="${escapeHtml(defaultDirectory)}" placeholder="留空時回退到桌面">
                    </label>
                    <div class="form-toolbar">
                        <button class="primary-btn" type="submit">儲存預設資料夾</button>
                        <button class="outline-btn" type="button" data-action="pick-automation-default-directory">選擇資料夾</button>
                        <button class="outline-btn" type="button" data-action="clear-automation-default-directory">清空資料夾</button>
                    </div>
                    <div class="inline-message" data-form-message-for="automation-export-directory-form" aria-live="polite"></div>
                </form>
            </article>

            <article class="sub-panel">
                <h3>操作稽核封存策略</h3>
                ${buildKeyValueGrid([
                    { label: "保留天數", value: `${auditArchiveConfig.retentionDays || 180} 天` },
                    { label: "預設封存資料夾", value: archiveDefaultDirectory || "(未設定)", mono: true },
                    { label: "目前有效封存位置", value: archiveEffectiveDirectory || "-", mono: true },
                    { label: "回退封存位置", value: archiveFallbackDirectory || "-", mono: true },
                    { label: "目前狀態", value: auditArchiveConfig.usingFallback ? "未設定自訂封存資料夾，將使用系統預設封存路徑" : "已啟用自訂封存資料夾" }
                ])}
                <form id="audit-archive-settings-form" class="stack-form">
                    <div class="field-grid">
                        <label class="field">
                            <span>保留天數</span>
                            <input name="retentionDays" type="number" min="30" max="3650" step="1" value="${escapeHtml(String(auditArchiveConfig.retentionDays || 180))}">
                        </label>
                        <label class="field">
                            <span>封存資料夾</span>
                            <input name="archiveDirectory" type="text" value="${escapeHtml(archiveDefaultDirectory)}" placeholder="留空則使用系統預設封存路徑">
                        </label>
                    </div>
                    <div class="form-toolbar">
                        <div class="inline-actions">
                            <button class="primary-btn" type="submit">儲存封存設定</button>
                            <button class="outline-btn" type="button" data-action="pick-audit-archive-directory">選擇資料夾</button>
                            <button class="outline-btn" type="button" data-action="clear-audit-archive-directory">清空路徑</button>
                        </div>
                        <div class="inline-actions">
                            <button class="secondary-btn" type="button" data-action="run-audit-archive-now">立即執行封存</button>
                        </div>
                    </div>
                    <div class="inline-message" data-form-message-for="audit-archive-settings-form" aria-live="polite"></div>
                </form>
                <div class="record-list">
                    ${recentArchives.length ? recentArchives.map((archive) => `
                        <div class="list-item">
                            <div class="list-item-top">
                                <span>${escapeHtml(archive.archive_month || archive.fileName || "封存檔")}</span>
                                ${renderBadge(`${archive.record_count || 0} 筆`, "success")}
                            </div>
                            <div class="record-subline">建立時間：${escapeHtml(archive.createdAtText || "-")}</div>
                            <div class="record-subline">時間範圍：${escapeHtml(archive.startText || "-")} ~ ${escapeHtml(archive.endText || "-")}</div>
                            <div class="record-subline mono-text">${escapeHtml(archive.file_path || "-")}</div>
                        </div>
                    `).join("") : renderEmptyState("目前尚無稽核封存紀錄。")}
                </div>
            </article>

            <article class="sub-panel">
                <h3>內建模板</h3>
                <div class="record-list">
                    ${exportConfig.templates.filter((template) => template.id !== "custom").map((template) => `
                        <div class="list-item">
                            <div class="list-item-top">
                                <span>${escapeHtml(template.label)}</span>
                                ${renderBadge(`${template.fields.length} 欄`, "success")}
                            </div>
                            <div class="record-subline">${escapeHtml(template.description)}</div>
                            <div class="record-subline mono-text">${escapeHtml(template.fields.map((field) => field.label).join(" / "))}</div>
                        </div>
                    `).join("")}
                </div>
            </article>

            <article class="sub-panel">
                <h3>自訂格式</h3>
                <form id="attendance-export-settings-form" class="stack-form">
                    <div class="checkbox-grid">
                        ${exportConfig.fieldCatalog.map((field) => `
                            <label class="checkbox-label">
                                <input type="checkbox" name="customFields" value="${escapeHtml(field.id)}" ${exportConfig.customFields.includes(field.id) ? "checked" : ""}>
                                ${escapeHtml(field.label)}
                            </label>
                        `).join("")}
                    </div>
                    <p class="helper-text">自訂格式目前已勾選 ${exportConfig.customFields.length} 項欄位；說明：${escapeHtml(customTemplate?.description || "請依需求勾選要匯出的欄位。")}</p>
                    <div class="form-toolbar">
                        <button class="primary-btn" type="submit">儲存自訂模板</button>
                        <button class="outline-btn" type="reset">還原目前設定</button>
                    </div>
                </form>
                <div class="record-subline mono-text">${escapeHtml((customTemplate?.fields || []).map((field) => field.label).join(" / "))}</div>
            </article>
        </div>
    `;
};

renderDeveloperStatusSection = function renderDeveloperStatusSectionOverride(datasets) {
    const health = datasets.systemHealth || {};
    const latestLogText = health.lastAutomationLog
        ? `${health.lastAutomationLog.timestampText} / ${health.lastAutomationLog.status} / ${health.lastAutomationLog.message}`
        : "目前尚無最近一次自動化日誌。";

    return `
        <div class="workspace-stack">
            <article class="workspace-card">
                <div class="list-toolbar">
                    <div>
                        <p class="sub-kicker">AI 系統控制</p>
                        <h3>系統健康面板</h3>
                    </div>
                    <div class="badge-row">
                        ${renderBadge(`狀態 ${health.statusText || "-"}`, health.status === "ok" ? "success" : "danger")}
                        ${renderBadge(`API ${health.apiCount ?? 0} 支`)}
                    </div>
                </div>
                <p class="helper-text">這裡會顯示目前桌面主程式、Express 服務、資料庫與自動化任務的即時摘要。</p>
                ${renderStatsGrid({
                    statusText: health.statusText || "-",
                    port: health.port || "-",
                    uptimeText: health.uptimeText || "-",
                    browserSessionCount: health.browserSessionCount ?? 0,
                    enabledAutomationTaskCount: health.enabledAutomationTaskCount ?? 0,
                    apiCount: health.apiCount ?? 0
                }, {
                    statusText: "服務狀態",
                    port: "服務埠號",
                    uptimeText: "運行時間",
                    browserSessionCount: "瀏覽器 Session",
                    enabledAutomationTaskCount: "啟用中的任務",
                    apiCount: "已列出的 API"
                })}
            </article>

            <article class="sub-panel">
                <div class="list-toolbar">
                    <div>
                        <p class="sub-kicker">系統細節</p>
                        <h3>主機與資料狀態</h3>
                    </div>
                    <div class="badge-row">
                        ${renderBadge(`桌面主窗 ${health.desktopWindowText || "-"}`, health.desktopWindowAttached ? "success" : "danger")}
                        ${renderBadge(`版本 ${health.appVersion || "-"}`)}
                    </div>
                </div>
                ${buildKeyValueGrid([
                    { label: "啟動時間", value: health.startedAtText || "-" },
                    { label: "資料庫位置", value: health.databasePath || "-", mono: true },
                    { label: "預設匯出資料夾", value: health.automationExportDirectory || "(未設定)", mono: true },
                    { label: "目前有效匯出位置", value: health.automationExportEffectiveDirectory || "-", mono: true },
                    { label: "桌面回退位置", value: health.automationExportFallbackDirectory || "-", mono: true },
                    { label: "員工資料", value: `${health.employeeCount ?? 0} 筆` },
                    { label: "打卡紀錄", value: `${health.punchRecordCount ?? 0} 筆` },
                    { label: "響鈴排程", value: `${health.bellScheduleCount ?? 0} 組` },
                    { label: "響鈴歷史", value: `${health.bellHistoryCount ?? 0} 筆` },
                    { label: "自訂聲音", value: `${health.customSoundCount ?? 0} 筆` },
                    { label: "自訂主題", value: `${health.customThemeCount ?? 0} 筆` },
                    { label: "自動化任務", value: `${health.automationTaskCount ?? 0} 筆` },
                    { label: "自動化日誌", value: `${health.automationLogCount ?? 0} 筆` },
                    { label: "系統密碼狀態", value: health.systemPasswordSet ? "已設定" : "未設定" },
                    { label: "最近一次任務日誌", value: latestLogText }
                ])}
            </article>

            ${renderApiCatalogTables(datasets.apiCatalog || [])}
        </div>
    `;
};

renderAdminPeopleSection = function renderAdminPeopleSectionOverride(datasets) {
    const filters = ensureAdminPeopleFilters();
    const filteredEmployees = filterAdminEmployees(datasets.employees);
    const departmentOptions = buildEmployeeDirectoryDepartmentOptions(datasets.employees, filters.department);
    const shiftOptions = renderOptions(datasets.shifts, {
        labelFn: (shift) => `${shift.name} (${shift.start} - ${shift.end})`
    });

    return `
        <div class="workspace-stack">
            <article class="workspace-card">
                <div class="list-toolbar">
                    <div>
                        <p class="sub-kicker">管理者工作台</p>
                        <h3>員工資料與班別管理</h3>
                    </div>
                    <div class="badge-row">
                        ${renderBadge(`員工 ${datasets.employees.length} 筆`, "success")}
                        <button class="secondary-btn" type="button" data-action="trigger-employee-import">匯入 CSV</button>
                        <button class="outline-btn" type="button" data-action="export-employees">匯出 CSV</button>
                        ${renderBadge(`班別 ${datasets.shifts.length} 組`)}
                    </div>
                </div>
                <p class="helper-text">把新增員工、名冊維護、班別設定與手動補登放在同一區，但表單改成雙欄與分組，閱讀和操作都會更輕鬆。</p>
            </article>

            <article class="sub-panel">
                <div class="list-toolbar">
                    <div>
                        <h3>員工資料表單</h3>
                        <p class="helper-text">常用欄位改為雙欄併排，保留備註全寬顯示，避免表單拉太長。</p>
                    </div>
                </div>
                <form id="employee-form" class="stack-form">
                    <input type="hidden" name="editingId" value="">
                    <div class="form-section-card">
                        <div class="form-section-heading">
                            <h4>基本資料</h4>
                            <p class="helper-text">工號、姓名、部門與職稱放在前面，方便快速建立員工主檔。</p>
                        </div>
                        <div class="form-section-grid four-up">
                            <label class="field"><span>工號</span><input name="id" placeholder="工號" required></label>
                            <label class="field"><span>姓名</span><input name="name" placeholder="姓名" required></label>
                            <label class="field"><span>部門</span><input name="department" placeholder="部門" required></label>
                            <label class="field"><span>職稱</span><input name="job_title" placeholder="職稱"></label>
                            <label class="field"><span>性別</span><input name="gender" placeholder="性別"></label>
                            <label class="field"><span>國籍</span><input name="nationality" placeholder="國籍"></label>
                        </div>
                    </div>

                    <div class="form-section-card">
                        <div class="form-section-heading">
                            <h4>識別與任職資訊</h4>
                            <p class="helper-text">卡號、密碼與任職日期在同一組，方便管理打卡與人事狀態。</p>
                        </div>
                        <div class="form-section-grid four-up">
                            <label class="field"><span>卡號</span><input name="card" placeholder="卡號" required></label>
                            <label class="field"><span>密碼</span><input name="password" placeholder="密碼" required></label>
                            <label class="field"><span>身分證字號</span><input name="national_id" placeholder="身分證字號"></label>
                            <label class="field"><span>生日</span><input name="birth_date" type="date"></label>
                            <label class="field"><span>到職日</span><input name="hire_date" type="date"></label>
                            <label class="field"><span>離職日</span><input name="termination_date" type="date"></label>
                            <label class="field span-2-cols"><span>備註</span><input name="notes" placeholder="備註"></label>
                        </div>
                    </div>

                    <div class="form-toolbar">
                        <div class="inline-actions">
                            <button class="primary-btn" type="submit">儲存員工資料</button>
                            <button class="outline-btn" type="button" data-action="reset-employee-form">清空表單</button>
                        </div>
                    </div>
                    <input id="employee-import-file" type="file" accept=".csv,text/csv" class="hidden">
                </form>
            </article>

            <article class="table-card">
                <div class="list-toolbar">
                    <div>
                        <h3>員工名冊</h3>
                        <p class="helper-text">可依工號、姓名、部門、職稱、卡號與備註快速篩選，保留內部卷軸與固定列數切換。</p>
                    </div>
                    <div class="badge-row">
                        <span id="employee-filter-badge">${renderBadge(`顯示 ${filteredEmployees.length} / ${datasets.employees.length} 筆`, "success")}</span>
                    </div>
                </div>
                <div class="field-grid employee-filter-grid">
                    <label class="field">
                        <span>關鍵字篩選</span>
                        <input id="employee-filter-query" value="${escapeHtml(filters.query)}" placeholder="工號 / 姓名 / 部門 / 職稱 / 卡號 / 備註">
                    </label>
                    <label class="field">
                        <span>部門</span>
                        <select id="employee-filter-department">
                            <option value="">全部部門</option>
                            ${departmentOptions}
                        </select>
                    </label>
                    <label class="field">
                        <span>顯示列數</span>
                        <select id="employee-visible-rows">
                            <option value="25" ${filters.visibleRows === "25" ? "selected" : ""}>預設 25 列</option>
                            <option value="50" ${filters.visibleRows === "50" ? "selected" : ""}>加大 50 列</option>
                        </select>
                    </label>
                </div>
                <div class="list-toolbar">
                    <p id="employee-filter-summary" class="helper-text">目前顯示 ${filteredEmployees.length} / ${datasets.employees.length} 筆員工資料。</p>
                    <button class="outline-btn" type="button" data-action="reset-employee-filters">清除篩選</button>
                </div>
                <div id="employee-table-host">${renderEmployeeRows(filteredEmployees, filters.visibleRows)}</div>
            </article>

            <div class="split-panels">
                <article class="sub-panel">
                    <div class="list-toolbar">
                        <div>
                            <h3>班別設定</h3>
                            <p class="helper-text">保留每組班別的起訖時間，常用編輯放在同一塊。</p>
                        </div>
                    </div>
                    <form id="shift-form" class="stack-form">
                        ${renderShiftRows(datasets.shifts)}
                        <div class="form-toolbar">
                            <button class="primary-btn" type="submit">儲存班別設定</button>
                        </div>
                    </form>
                </article>

                <article class="sub-panel">
                    <div class="list-toolbar">
                        <div>
                            <h3>手動補登打卡</h3>
                            <p class="helper-text">把常用欄位重新分組，避免每個輸入欄位都拉成整排。</p>
                        </div>
                    </div>
                    <form id="manual-punch-form" class="stack-form">
                        <div class="form-section-card">
                            <div class="form-section-grid five-up">
                                <label class="field span-2"><span>員工識別</span><input name="employeeQuery" placeholder="工號 / 卡號 / 密碼" required></label>
                                <label class="field"><span>日期</span><input name="date" type="date" required></label>
                                <label class="field"><span>時間</span><input name="time" type="time" step="1" required></label>
                                <label class="field"><span>班別</span><select name="shift"><option value="">手動補登</option>${shiftOptions}</select></label>
                                <label class="field"><span>打卡狀態</span><select name="status"><option value="in">上班</option><option value="out">下班</option></select></label>
                            </div>
                        </div>
                        <div class="form-toolbar">
                            <button class="primary-btn" type="submit">送出補登打卡</button>
                        </div>
                    </form>
                </article>
            </div>
        </div>
    `;
};

renderAdminThemeSection = function renderAdminThemeSectionOverride(datasets) {
    const themeOptions = `
        <option value="default">預設主題</option>
        ${renderOptions(datasets.customThemes, { labelFn: (theme) => theme.name })}
    `;
    const currentImageSummary = datasets.customThemes.length
        ? "可搭配右側預覽與已儲存主題清單，快速確認顏色與效果。"
        : "目前還沒有自訂主題，建議先建立一組常用主題樣式。";

    return `
        <div class="workspace-stack">
            <article class="workspace-card">
                <div class="list-toolbar">
                    <div>
                        <p class="sub-kicker">管理者工作台</p>
                        <h3>主題與特效設定</h3>
                    </div>
                    <div class="badge-row">
                        ${renderBadge(`節日特效 ${datasets.specialEffects.length} 組`, "success")}
                        ${renderBadge(`主題排程 ${datasets.themeSchedules.length} 組`)}
                        ${renderBadge(`自訂主題 ${datasets.customThemes.length} 組`)}
                    </div>
                </div>
                <p class="helper-text">將特效、主題排程與自訂主題編輯器改成分組式版面，保留完整功能，但閱讀和操作不再一路往下拉。</p>
            </article>

            <div class="split-panels">
                <article class="sub-panel">
                    <div class="list-toolbar">
                        <div>
                            <h3>節日特效</h3>
                            <p class="helper-text">建立後會先預設啟用，如需停用可直接在下方清單切換。</p>
                        </div>
                    </div>
                    <form id="effect-form" class="stack-form">
                        <input type="hidden" name="editingId" value="">
                        <div class="form-section-card">
                            <div class="form-section-grid five-up">
                                <label class="field"><span>特效名稱</span><input name="name" required></label>
                                <label class="field"><span>前綴文字</span><input name="prefix"></label>
                                <label class="field"><span>後綴文字</span><input name="suffix"></label>
                                <label class="field"><span>開始日期</span><input name="start_date" type="date" required></label>
                                <label class="field"><span>結束日期</span><input name="end_date" type="date" required></label>
                            </div>
                        </div>
                        <div class="form-toolbar">
                            <button class="primary-btn" type="submit">儲存節日特效</button>
                            <button class="outline-btn" type="button" data-action="reset-effect-form">重設特效表單</button>
                        </div>
                    </form>
                    ${renderSpecialEffects(datasets.specialEffects)}
                </article>

                <article class="sub-panel">
                    <div class="list-toolbar">
                        <div>
                            <h3>主題排程</h3>
                            <p class="helper-text">建立後會先預設啟用，如需停用可直接在下方清單切換。</p>
                        </div>
                    </div>
                    <form id="theme-schedule-form" class="stack-form">
                        <input type="hidden" name="editingId" value="">
                        <div class="form-section-card">
                            <div class="form-section-grid five-up">
                                <label class="field"><span>排程名稱</span><input name="name" required></label>
                                <label class="field"><span>主題</span><select name="theme_name">${themeOptions}</select></label>
                                <label class="field"><span>開始日期</span><input name="start_date" type="date" required></label>
                                <label class="field"><span>結束日期</span><input name="end_date" type="date" required></label>
                            </div>
                        </div>
                        <div class="form-toolbar">
                            <button class="primary-btn" type="submit">儲存主題排程</button>
                            <button class="outline-btn" type="button" data-action="reset-theme-schedule-form">重設排程表單</button>
                        </div>
                    </form>
                    ${renderThemeSchedules(datasets)}
                </article>
            </div>

            <article class="sub-panel">
                <div class="list-toolbar">
                    <div>
                        <h3>自訂主題編輯器</h3>
                        <p class="helper-text">${escapeHtml(currentImageSummary)}</p>
                    </div>
                    <div class="inline-actions">
                        <button class="secondary-btn" type="button" data-action="trigger-theme-image-upload">上傳背景圖片</button>
                        <button class="outline-btn" type="button" data-action="clear-theme-image">清除背景圖片</button>
                    </div>
                </div>

                <div class="theme-editor-layout">
                    <form id="custom-theme-form" class="stack-form theme-editor-panel">
                        <input type="hidden" name="editingId" value="">
                        <input type="hidden" name="clockBgImage" value="">
                        <input type="hidden" name="browserClockBgImage" value="">

                        <div class="form-section-card">
                            <div class="form-section-heading">
                                <h4>主題基本設定</h4>
                                <p class="helper-text">先決定名稱、背景圖位置與日夜切換時間。</p>
                            </div>
                            <div class="form-section-grid five-up">
                                <label class="field"><span>主題名稱</span><input name="name" required></label>
                                <label class="field"><span>背景圖位置</span><select name="clockBgPos"><option value="center">置中</option><option value="top">靠上</option><option value="bottom">靠下</option></select></label>
                                <label class="field"><span>白天開始時間</span><input name="dayStartTime" type="time" value="${escapeHtml(defaultThemeStyles.dayStartTime)}"></label>
                                <label class="field"><span>夜晚開始時間</span><input name="nightStartTime" type="time" value="${escapeHtml(defaultThemeStyles.nightStartTime)}"></label>
                            </div>
                        </div>

                        <div class="form-section-card">
                            <div class="form-section-heading">
                                <h4>背景與標題</h4>
                                <p class="helper-text">把主要配色放在同一區，調整時更容易觀察整體風格。</p>
                            </div>
                            <div class="form-section-grid five-up">
                                <label class="field color-field"><span>白天背景起點</span><input name="bgDayStart" type="color" value="${escapeHtml(defaultThemeStyles.bgDayStart)}"></label>
                                <label class="field color-field"><span>白天背景終點</span><input name="bgDayEnd" type="color" value="${escapeHtml(defaultThemeStyles.bgDayEnd)}"></label>
                                <label class="field color-field"><span>夜晚背景起點</span><input name="bgNightStart" type="color" value="${escapeHtml(defaultThemeStyles.bgNightStart)}"></label>
                                <label class="field color-field"><span>夜晚背景終點</span><input name="bgNightEnd" type="color" value="${escapeHtml(defaultThemeStyles.bgNightEnd)}"></label>
                                <label class="field color-field"><span>主標題顏色</span><input name="mainTitleColor" type="color" value="${escapeHtml(defaultThemeStyles.mainTitleColor)}"></label>
                            </div>
                        </div>

                        <div class="form-section-card">
                            <div class="form-section-heading">
                                <h4>時鐘與按鈕色彩</h4>
                                <p class="helper-text">常用操作按鈕與時鐘面板放在一起，比較容易整體搭色。</p>
                            </div>
                            <div class="form-section-grid">
                                <label class="field color-field"><span>時鐘背景</span><input name="clockBg" type="color" value="${escapeHtml(defaultThemeStyles.clockBg)}"></label>
                                <label class="field color-field"><span>時鐘文字</span><input name="clockText" type="color" value="${escapeHtml(defaultThemeStyles.clockText)}"></label>
                                <label class="field color-field"><span>管理按鈕背景</span><input name="btnAdminBg" type="color" value="${escapeHtml(defaultThemeStyles.btnAdminBg)}"></label>
                                <label class="field color-field"><span>管理按鈕文字</span><input name="btnAdminText" type="color" value="${escapeHtml(defaultThemeStyles.btnAdminText)}"></label>
                                <label class="field color-field"><span>報表按鈕背景</span><input name="btnReportBg" type="color" value="${escapeHtml(defaultThemeStyles.btnReportBg)}"></label>
                                <label class="field color-field"><span>報表按鈕文字</span><input name="btnReportText" type="color" value="${escapeHtml(defaultThemeStyles.btnReportText)}"></label>
                                <label class="field color-field"><span>AI 按鈕背景</span><input name="btnAiBg" type="color" value="${escapeHtml(defaultThemeStyles.btnAiBg)}"></label>
                                <label class="field color-field"><span>AI 按鈕文字</span><input name="btnAiText" type="color" value="${escapeHtml(defaultThemeStyles.btnAiText)}"></label>
                            </div>
                        </div>

                        <div class="form-section-card">
                            <div class="form-section-heading">
                                <h4>符號與打卡效果</h4>
                                <p class="helper-text">把裝飾符號、閃爍邊框與打卡動畫集中管理，減少來回捲動。</p>
                            </div>
                            <div class="form-section-grid">
                                <label class="field"><span>左側符號</span><input name="clockSymbolsLeft"></label>
                                <label class="field"><span>右側符號</span><input name="clockSymbolsRight"></label>
                                <label class="field"><span>閃爍邊框</span><select name="blinkEnabled"><option value="false">停用</option><option value="true">啟用</option></select></label>
                                <label class="field"><span>打卡效果</span><select name="punchEffect"><option value="none">無</option><option value="fall">落下</option><option value="flash">閃現</option></select></label>
                                <label class="field color-field"><span>白天閃爍色</span><input name="blinkDayColor" type="color" value="${escapeHtml(defaultThemeStyles.blinkDayColor)}"></label>
                                <label class="field color-field"><span>夜晚閃爍色</span><input name="blinkNightColor" type="color" value="${escapeHtml(defaultThemeStyles.blinkNightColor)}"></label>
                                <label class="field"><span>落下效果內容</span><input name="punchFallContent" value="${escapeHtml(defaultThemeStyles.punchFallContent)}"></label>
                                <label class="field"><span>閃現效果內容</span><input name="punchFlashContent" value="${escapeHtml(defaultThemeStyles.punchFlashContent)}"></label>
                            </div>
                            <div class="status-box">
                                <strong>背景圖片狀態：</strong>
                                <span>${datasets.customThemes.length ? "可透過上方按鈕上傳或替換圖片，預覽區會即時反映。" : "尚未指定背景圖片，若不設定則只使用純色與漸層背景。"}</span>
                            </div>
                        </div>

                        <div class="form-toolbar">
                            <div class="inline-actions">
                                <button class="primary-btn" type="submit">儲存自訂主題</button>
                                <button class="outline-btn" type="button" data-action="reset-custom-theme-form">重設主題表單</button>
                            </div>
                        </div>
                    </form>

                    <div class="theme-preview-stack">
                        <div class="form-section-card preview-shell">
                            <div class="form-section-heading">
                                <h4>即時預覽</h4>
                                <p class="helper-text">預覽會依照表單當前值即時更新。</p>
                            </div>
                            <div id="theme-preview-host">${renderThemePreview(defaultThemeStyles)}</div>
                        </div>

                        <div class="form-section-card">
                            <div class="form-section-heading">
                                <h4>已儲存主題</h4>
                                <p class="helper-text">可直接載入、編輯或刪除既有主題。</p>
                            </div>
                            ${renderCustomThemes(datasets)}
                        </div>
                    </div>
                </div>

                <input id="theme-image-file" type="file" accept=".png,.jpg,.jpeg,.gif,.webp,image/*" class="hidden">
            </article>
        </div>
    `;
};

renderAdminPeopleSection = function renderAdminPeopleSectionTabsOverride(datasets) {
    const filters = ensureAdminPeopleFilters();
    const filteredEmployees = filterAdminEmployees(datasets.employees);
    const departmentOptions = buildEmployeeDirectoryDepartmentOptions(datasets.employees, filters.department);

    return `
        <div class="workspace-stack">
            <article class="workspace-card">
                <div class="list-toolbar">
                    <div>
                        <p class="sub-kicker">管理者工作台</p>
                        <h3>員工與名冊</h3>
                    </div>
                    <div class="badge-row">
                        ${renderBadge(`員工 ${datasets.employees.length} 筆`, "success")}
                        <button class="secondary-btn" type="button" data-action="trigger-employee-import">匯入 CSV</button>
                        <button class="outline-btn" type="button" data-action="export-employees">匯出 CSV</button>
                    </div>
                </div>
                <p class="helper-text">這一頁專心處理員工主檔與名冊查找，班別設定與手動補登已分出去獨立頁籤。</p>
            </article>

            <article class="sub-panel">
                <div class="list-toolbar">
                    <div>
                        <h3>員工資料表單</h3>
                        <p class="helper-text">保留雙欄分組版面，讓新增或編輯員工資料時更集中。</p>
                    </div>
                </div>
                <form id="employee-form" class="stack-form">
                    <input type="hidden" name="editingId" value="">
                    <div class="form-section-card">
                        <div class="form-section-heading">
                            <h4>基本資料</h4>
                            <p class="helper-text">工號、姓名與個人基本身分欄位集中在同一組，建立與校對都更直覺。</p>
                        </div>
                        <div class="form-section-grid four-up">
                            <label class="field"><span>工號</span><input name="id" placeholder="工號" required></label>
                            <label class="field"><span>姓名</span><input name="name" placeholder="姓名" required></label>
                            <label class="field"><span>部門</span><input name="department" placeholder="部門" required></label>
                            <label class="field"><span>職稱</span><input name="job_title" placeholder="職稱"></label>
                            <label class="field"><span>性別</span><input name="gender" placeholder="性別"></label>
                            <label class="field"><span>國籍</span><input name="nationality" placeholder="國籍"></label>
                            <label class="field"><span>身分證字號</span><input name="national_id" placeholder="身分證字號"></label>
                            <label class="field"><span>生日</span><input name="birth_date" type="date"></label>
                        </div>
                    </div>

                    <div class="form-section-card">
                        <div class="form-section-heading">
                            <h4>識別與聯絡資訊</h4>
                            <p class="helper-text">卡號、密碼、到離職日期與聯絡方式集中管理，方便人事維護與資料查核。</p>
                        </div>
                        <div class="form-section-grid four-up">
                            <label class="field"><span>卡號</span><input name="card" placeholder="卡號" required></label>
                            <label class="field"><span>密碼</span><input name="password" placeholder="密碼" required></label>
                            <label class="field"><span>到職日</span><input name="hire_date" type="date"></label>
                            <label class="field"><span>離職日</span><input name="termination_date" type="date"></label>
                            <label class="field"><span>銀行帳戶號碼</span><input name="bank_account" placeholder="銀行帳戶號碼"></label>
                            <label class="field"><span>聯絡手機</span><input name="mobile_phone" placeholder="聯絡手機"></label>
                            <label class="field"><span>緊急聯絡人</span><input name="emergency_contact" placeholder="緊急聯絡人"></label>
                            <label class="field"><span>緊急聯絡電話</span><input name="emergency_phone" placeholder="緊急聯絡電話"></label>
                        </div>
                        <div class="card-capture-panel">
                            <div class="card-capture-toolbar">
                                <div>
                                    <p class="sub-kicker">卡片註冊 / 讀卡測試</p>
                                    <p class="helper-text">點選讀取後感應卡片，系統會顯示完整卡號並填入上方卡號欄位；這不會產生正式打卡紀錄。</p>
                                </div>
                                <div class="inline-actions">
                                    <button class="secondary-btn" type="button" data-action="start-card-capture">讀取卡片</button>
                                    <button class="outline-btn" type="button" data-action="clear-card-capture">清除讀卡結果</button>
                                </div>
                            </div>
                            <label class="field">
                                <span>讀卡輸入</span>
                                <input id="employee-card-capture-input" type="text" autocomplete="off" inputmode="numeric" spellcheck="false" placeholder="點選此欄或按「讀取卡片」後感應卡片" readonly>
                            </label>
                            <div id="employee-card-capture-result" class="card-capture-result hidden"></div>
                            <p id="employee-card-capture-message" class="helper-text">尚未讀取卡片。</p>
                        </div>
                    </div>

                    <div class="form-section-card">
                        <div class="form-section-heading">
                            <h4>地址與家庭資訊</h4>
                            <p class="helper-text">把聯絡地址、戶籍地址與家庭概況獨立整理，員工登入後也能查看自己的私人資訊。</p>
                        </div>
                        <div class="form-section-grid four-up">
                            <label class="field span-2-cols"><span>聯絡地址</span><textarea name="contact_address" rows="3" placeholder="聯絡地址"></textarea></label>
                            <label class="field span-2-cols"><span>戶籍地址</span><textarea name="registered_address" rows="3" placeholder="戶籍地址"></textarea></label>
                            <label class="field span-2-cols"><span>家庭概況</span><textarea name="family_status" rows="3" placeholder="家庭概況"></textarea></label>
                            <label class="field span-2-cols"><span>備註</span><textarea name="notes" rows="3" placeholder="備註"></textarea></label>
                        </div>
                    </div>

                    <div class="form-toolbar">
                        <div class="inline-actions">
                            <button class="primary-btn" type="submit">儲存員工資料</button>
                            <button class="outline-btn" type="button" data-action="reset-employee-form">清空表單</button>
                        </div>
                    </div>
                    <input id="employee-import-file" type="file" accept=".csv,text/csv" class="hidden">
                </form>
            </article>

            <article class="table-card">
                <div class="list-toolbar">
                    <div>
                        <h3>員工名冊</h3>
                        <p class="helper-text">固定顯示核心 8 欄，其它表頭可自由勾選，篩選與列數切換會即時更新名冊內容。</p>
                    </div>
                    <div class="badge-row">
                        <span id="employee-filter-badge">${renderBadge(`顯示 ${filteredEmployees.length} / ${datasets.employees.length} 筆`, "success")}</span>
                    </div>
                </div>
                <div class="field-grid employee-filter-grid">
                    <label class="field">
                        <span>關鍵字篩選</span>
                        <input id="employee-filter-query" value="${escapeHtml(filters.query)}" placeholder="工號 / 姓名 / 性別 / 部門 / 職稱 / 卡號 / 國籍 / 身分證 / 手機 / 地址 / 備註">
                    </label>
                    <label class="field">
                        <span>部門</span>
                        <select id="employee-filter-department">
                            <option value="">全部部門</option>
                            ${departmentOptions}
                        </select>
                    </label>
                    <label class="field">
                        <span>顯示列數</span>
                        <select id="employee-visible-rows">
                            <option value="25" ${filters.visibleRows === "25" ? "selected" : ""}>預設 25 列</option>
                            <option value="50" ${filters.visibleRows === "50" ? "selected" : ""}>加大 50 列</option>
                        </select>
                    </label>
                </div>
                <div class="employee-column-panel">
                    <div class="list-toolbar">
                        <div>
                            <p class="sub-kicker">欄位顯示設定</p>
                            <p id="employee-column-summary" class="helper-text">${getEmployeeRosterColumnSummaryText()}</p>
                        </div>
                        <button class="outline-btn" type="button" data-action="reset-employee-columns">還原最精簡欄位</button>
                    </div>
                    <div id="employee-column-toggle-list">${renderEmployeeRosterColumnControls()}</div>
                </div>
                <div class="list-toolbar">
                    <p id="employee-filter-summary" class="helper-text">目前顯示 ${filteredEmployees.length} / ${datasets.employees.length} 筆員工資料。</p>
                    <button class="outline-btn" type="button" data-action="reset-employee-filters">清除篩選</button>
                </div>
                <div id="employee-table-host">${renderEmployeeRows(filteredEmployees, filters.visibleRows)}</div>
            </article>
        </div>
    `;
};

let employeeCardCaptureTimer = null;
let employeeCardCaptureAutoFinishTimer = null;

function clearEmployeeCardCaptureAutoFinishTimer() {
    if (!employeeCardCaptureAutoFinishTimer) return;
    clearTimeout(employeeCardCaptureAutoFinishTimer);
    employeeCardCaptureAutoFinishTimer = null;
}

function clearEmployeeCardCaptureTimer() {
    clearEmployeeCardCaptureAutoFinishTimer();
    if (!employeeCardCaptureTimer) return;
    clearTimeout(employeeCardCaptureTimer);
    employeeCardCaptureTimer = null;
}

async function writeEmployeeCardCaptureDiagnostic({
    success = true,
    code = "",
    reason = "",
    cardNumber = "",
    duplicateEmployee = null
} = {}) {
    const trimmedCard = String(cardNumber || "").trim();
    const meta = getCardIdentifierMeta(trimmedCard);
    const cardHash = trimmedCard ? await hashCardIdentifier(trimmedCard) : "";
    try {
        await requestJson("/api/browser/admin/card-reader-test-log", {
            method: "POST",
            auth: true,
            body: {
                success,
                failureCode: success ? "" : code,
                failureReason: success ? "" : reason,
                warningCode: success && code ? code : "",
                warningReason: success && code ? reason : "",
                credentialInput: trimmedCard,
                inputLength: meta.length,
                inputSuffix: meta.suffix,
                cardHash,
                duplicateEmployeeId: duplicateEmployee?.id || "",
                duplicateEmployeeName: duplicateEmployee?.name || ""
            }
        });
    } catch (error) {
        console.warn("Failed to write card reader diagnostic log:", error);
    }
}

function getEmployeeForm() {
    return document.getElementById("employee-form");
}

function getEmployeeCardCaptureNodes() {
    return {
        form: getEmployeeForm(),
        input: document.getElementById("employee-card-capture-input"),
        result: document.getElementById("employee-card-capture-result"),
        message: document.getElementById("employee-card-capture-message")
    };
}

function setEmployeeCardCaptureMessage(text, type = "info") {
    const { message } = getEmployeeCardCaptureNodes();
    if (!message) return;
    message.textContent = text || "";
    message.className = `helper-text card-capture-message ${type}`;
}

function clearEmployeeCardCaptureResult() {
    clearEmployeeCardCaptureTimer();
    const { input, result } = getEmployeeCardCaptureNodes();
    if (input) {
        input.value = "";
        input.disabled = false;
        input.readOnly = true;
        input.dataset.active = "";
        input.dataset.timedOut = "";
    }
    if (result) {
        result.classList.add("hidden");
        result.innerHTML = "";
    }
    setEmployeeCardCaptureMessage("尚未讀取卡片。");
}

function startEmployeeCardCapture() {
    const { input, result } = getEmployeeCardCaptureNodes();
    if (!input) return;
    clearEmployeeCardCaptureTimer();
    input.disabled = false;
    input.readOnly = false;
    input.dataset.active = "true";
    input.dataset.timedOut = "";
    input.value = "";
    if (result) {
        result.classList.add("hidden");
        result.innerHTML = "";
    }
    setEmployeeCardCaptureMessage("正在等待讀卡，請感應卡片。若讀卡器以 Tab 結尾，系統也會自動接收。", "info");
    employeeCardCaptureTimer = setTimeout(() => {
        const { input: activeInput } = getEmployeeCardCaptureNodes();
        if (activeInput?.dataset.active === "true" && !String(activeInput.value || "").trim()) {
            activeInput.dataset.timedOut = "true";
            setEmployeeCardCaptureMessage("15 秒內沒有收到卡號。請確認讀卡器已連線、游標仍在讀卡欄位，再重新感應。", "error");
            void writeEmployeeCardCaptureDiagnostic({
                success: false,
                code: "R001",
                reason: "讀卡逾時，未收到任何卡號輸入。"
            });
        }
        employeeCardCaptureTimer = null;
    }, 15000);
    input.focus({ preventScroll: true });
    input.select();
    setTimeout(() => {
        if (document.activeElement !== input) input.focus({ preventScroll: true });
    }, 0);
}

async function finishEmployeeCardCapture(rawValue) {
    clearEmployeeCardCaptureTimer();
    const { form, input, result } = getEmployeeCardCaptureNodes();
    const cardNumber = String(rawValue || "").trim();
    if (!form || !input) return;
    if (!cardNumber) {
        setEmployeeCardCaptureMessage("沒有讀到卡號，請確認讀卡器已連線並重新感應。", "error");
        await writeEmployeeCardCaptureDiagnostic({
            success: false,
            code: "R002",
            reason: "讀卡欄位送出時沒有卡號。"
        });
        input.focus();
        return;
    }

    const cardField = form.elements.card;
    if (cardField) cardField.value = cardNumber;

    const editingId = String(form.elements.editingId?.value || form.elements.id?.value || "").trim();
    const employees = state.dashboard?.datasets?.employees || [];
    const duplicateEmployee = employees.find((employee) =>
        String(employee.card || "").trim() === cardNumber && String(employee.id || "").trim() !== editingId
    );
    const meta = getCardIdentifierMeta(cardNumber);
    const cardHash = await hashCardIdentifier(cardNumber);
    const hashPreview = cardHash ? `${cardHash.slice(0, 12)}...` : "-";

    if (result) {
        result.classList.remove("hidden");
        result.innerHTML = `
            <div><dt>完整卡號</dt><dd class="mono-text">${escapeHtml(cardNumber)}</dd></div>
            <div><dt>長度</dt><dd>${escapeHtml(String(meta.length))}</dd></div>
            <div><dt>後 4 碼</dt><dd class="mono-text">${escapeHtml(meta.suffix || "-")}</dd></div>
            <div><dt>雜湊前綴</dt><dd class="mono-text">${escapeHtml(hashPreview)}</dd></div>
            <div><dt>名冊檢查</dt><dd>${duplicateEmployee ? escapeHtml(`已被 ${duplicateEmployee.id} ${duplicateEmployee.name} 使用`) : "目前未重複"}</dd></div>
        `;
    }

    input.disabled = false;
    input.readOnly = true;
    input.dataset.active = "";
    input.dataset.timedOut = "";
    if (duplicateEmployee) {
        await writeEmployeeCardCaptureDiagnostic({
            success: true,
            code: "R003",
            reason: "讀卡成功，但卡號已被其他員工使用。",
            cardNumber,
            duplicateEmployee
        });
        setEmployeeCardCaptureMessage(`已讀取卡片，但這張卡已被 ${duplicateEmployee.id} ${duplicateEmployee.name} 使用，請勿直接儲存。`, "error");
        setFormMessage("employee-form", `卡號重複：${duplicateEmployee.id} ${duplicateEmployee.name}`, "error");
    } else {
        await writeEmployeeCardCaptureDiagnostic({
            success: true,
            reason: "讀卡測試成功。",
            cardNumber
        });
        setEmployeeCardCaptureMessage("已讀取並填入卡號欄位，請確認其它員工資料後儲存。", "success");
        setFormMessage("employee-form", "卡號已由讀卡器填入，請確認後儲存員工資料。", "success");
    }
    cardField?.focus();
}

function queueEmployeeCardCaptureAutoFinish(input) {
    if (!input || input.dataset.active !== "true") return;
    clearEmployeeCardCaptureAutoFinishTimer();
    if (!String(input.value || "").trim()) return;
    employeeCardCaptureAutoFinishTimer = setTimeout(() => {
        const { input: activeInput } = getEmployeeCardCaptureNodes();
        if (activeInput?.dataset.active === "true" && String(activeInput.value || "").trim()) {
            void finishEmployeeCardCapture(activeInput.value);
        }
    }, 800);
}

function handleEmployeeCardCaptureInput(event) {
    if (event.target?.id !== "employee-card-capture-input") return;
    queueEmployeeCardCaptureAutoFinish(event.target);
}

function handleEmployeeCardCaptureFocus(event) {
    const input = event.target;
    if (input?.id !== "employee-card-capture-input" || input.dataset.active === "true") return;
    startEmployeeCardCapture();
}

function renderAdminShiftSection(datasets) {
    return `
        <div class="workspace-stack">
            <article class="workspace-card">
                <div class="list-toolbar">
                    <div>
                        <p class="sub-kicker">管理者工作台</p>
                        <h3>班別設定</h3>
                    </div>
                    <div class="badge-row">
                        ${renderBadge(`班別 ${datasets.shifts.length} 組`, "success")}
                    </div>
                </div>
                <p class="helper-text">這裡只保留班別名稱與起訖時間，方便你專心處理班別表，不會和員工表單混在一起。</p>
            </article>

            <article class="sub-panel">
                <form id="shift-form" class="stack-form">
                    ${renderShiftRows(datasets.shifts)}
                    <div class="form-toolbar">
                        <button class="primary-btn" type="submit">儲存班別設定</button>
                    </div>
                </form>
            </article>
        </div>
    `;
}

function renderAdminManualPunchSection(datasets) {
    const shiftOptions = renderOptions(datasets.shifts, {
        labelFn: (shift) => `${shift.name} (${shift.start} - ${shift.end})`
    });

    return `
        <div class="workspace-stack">
            <article class="workspace-card">
                <div class="list-toolbar">
                    <div>
                        <p class="sub-kicker">管理者工作台</p>
                        <h3>補登打卡</h3>
                    </div>
                    <div class="badge-row">
                        ${renderBadge(`班別 ${datasets.shifts.length} 組`, "success")}
                    </div>
                </div>
                <p class="helper-text">把補登打卡獨立成單一頁籤後，流程會更直接，也比較不容易和員工主檔操作混在一起。</p>
            </article>

            <article class="sub-panel">
                <form id="manual-punch-form" class="stack-form">
                    <div class="form-section-card">
                        <div class="form-section-heading">
                            <h4>補登資訊</h4>
                            <p class="helper-text">用工號、卡號或密碼找人，並指定日期、時間、班別與打卡狀態。</p>
                        </div>
                        <div class="form-section-grid">
                            <label class="field span-2"><span>員工識別</span><input name="employeeQuery" placeholder="工號 / 卡號 / 密碼" required></label>
                            <label class="field"><span>日期</span><input name="date" type="date" required></label>
                            <label class="field"><span>時間</span><input name="time" type="time" step="1" required></label>
                            <label class="field"><span>班別</span><select name="shift"><option value="">手動補登</option>${shiftOptions}</select></label>
                            <label class="field"><span>打卡狀態</span><select name="status"><option value="in">上班</option><option value="out">下班</option></select></label>
                        </div>
                    </div>
                    <div class="form-toolbar">
                        <button class="primary-btn" type="submit">送出補登打卡</button>
                    </div>
                </form>
            </article>
        </div>
    `;
}

renderAdminDashboard = function renderAdminDashboardOverride(dashboard) {
    const sections = [
        { id: "people", label: "員工與名冊" },
        { id: "shifts", label: "班別設定" },
        { id: "manualPunch", label: "補登打卡" },
        { id: "reports", label: "考勤報表" },
        { id: "system", label: "資料與問候語" },
        { id: "bells", label: "響鈴管理" },
        { id: "themes", label: "主題特效" }
    ];

    const activeSection = state.activeSections.admin;
    const content = activeSection === "people"
        ? renderAdminPeopleSection(dashboard.datasets)
        : activeSection === "shifts"
            ? renderAdminShiftSection(dashboard.datasets)
        : activeSection === "manualPunch"
            ? renderAdminManualPunchSection(dashboard.datasets)
        : activeSection === "reports"
            ? renderAdminReportSection(dashboard.datasets)
        : activeSection === "system"
            ? renderAdminSystemSection(dashboard.datasets)
        : activeSection === "bells"
            ? renderAdminBellSection(dashboard.datasets)
            : renderAdminThemeSection(dashboard.datasets);

    return `
        <div class="workspace-shell">
            ${renderStatsGrid(dashboard.summary, {
                employeeCount: "員工總數",
                shiftCount: "班別總數",
                todayPunchCount: "今日正常打卡",
                todayAbnormalPunchCount: "今日異常打卡",
                bellScheduleCount: "響鈴排程",
                greetingCount: "問候語",
                customThemeCount: "自訂主題"
            })}
            ${renderSuggestions(dashboard.suggestions)}
            ${renderSectionTabs("admin", sections)}
            ${content}
        </div>
    `;
};

renderDeveloperAutomationSection = function renderDeveloperAutomationSectionCompactOverride(datasets) {
    const exportConfig = getAttendanceExportConfig(datasets);
    const automationExportConfig = getAutomationExportConfig(datasets);
    const templateOptions = exportConfig.templates.length
        ? exportConfig.templates.map((template) => `<option value="${escapeHtml(template.id)}">${escapeHtml(template.label)}</option>`).join("")
        : `<option value="full">完整格式</option>`;
    const effectiveDirectory = automationExportConfig.effectiveDirectory || automationExportConfig.fallbackDirectory || "";
    const defaultDirectory = automationExportConfig.defaultDirectory || "";

    return `
        <div class="workspace-stack">
            <article class="workspace-card">
                <div class="list-toolbar">
                    <div>
                        <p class="sub-kicker">AI 系統控制</p>
                        <h3>自動化任務</h3>
                    </div>
                    <div class="badge-row">
                        ${renderBadge(`任務 ${datasets.automationTasks.length} 筆`, "success")}
                        ${renderBadge(`日誌 ${datasets.automationLog.length} 筆`)}
                    </div>
                </div>
                <p class="helper-text">改成左右分組後，左邊專心編輯任務，右邊直接看目前任務清單，畫面會更短也更容易掃描。</p>
            </article>

            <div class="split-panels">
                <article class="sub-panel">
                    <div class="list-toolbar">
                        <div>
                            <h3>任務設定</h3>
                            <p class="helper-text">排程設定和任務內容分開，欄位保持雙欄排列。</p>
                        </div>
                    </div>
                    <form id="automation-form" class="stack-form">
                        <input type="hidden" name="editingId" value="">

                        <div class="form-section-card">
                            <div class="form-section-heading">
                                <h4>排程條件</h4>
                                <p class="helper-text">先決定頻率、執行時間與每週或每月的觸發日。</p>
                            </div>
                            <div class="form-section-grid">
                                <label class="field"><span>頻率</span><select name="frequency" id="automation-frequency"><option value="immediate">立即</option><option value="daily">每日</option><option value="weekly">每週</option><option value="monthly">每月</option></select></label>
                                <label class="field"><span>時間</span><input name="time" id="automation-time" type="time"></label>
                                <label class="field"><span>每週執行日</span><select name="weeklyDay" id="automation-weekly-day">${dayLabels.map((day, index) => `<option value="${index}">${day}</option>`).join("")}</select></label>
                                <label class="field"><span>每月幾號</span><select name="monthlyDay" id="automation-monthly-day">${Array.from({ length: 31 }, (_, index) => `<option value="${index + 1}">${index + 1}</option>`).join("")}</select></label>
                            </div>
                        </div>

                        <div class="form-section-card">
                            <div class="form-section-heading">
                                <h4>任務內容</h4>
                                <p class="helper-text">匯出任務可另外指定考勤模板與任務專用資料夾。</p>
                            </div>
                            <div class="form-section-grid">
                                <label class="field"><span>任務類型</span><select name="task_type" id="automation-task-type"><option value="export">匯出</option><option value="delete">刪除</option></select></label>
                                <label class="field"><span>任務目標</span><select name="target" id="automation-target">${Object.entries(automationTargetLabels).map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join("")}</select></label>
                                <label class="field hidden span-2" id="automation-export-template-field"><span>考勤模板</span><select name="export_template" id="automation-export-template">${templateOptions}</select></label>
                                <label class="field hidden span-2" id="automation-export-directory-field"><span>任務專用資料夾</span><input name="export_directory" id="automation-export-directory-input" type="text" placeholder="留空時使用預設匯出資料夾"></label>
                                <label class="field span-2"><span>啟用狀態</span><select name="enabled"><option value="true">啟用</option><option value="false">停用</option></select></label>
                            </div>
                            <div class="inline-actions hidden" id="automation-export-directory-actions">
                                <button class="outline-btn" type="button" data-action="pick-automation-task-directory">選擇任務資料夾</button>
                                <button class="outline-btn" type="button" data-action="clear-automation-task-directory">清空任務資料夾</button>
                            </div>
                            <div class="status-box">
                                <strong>目前有效匯出位置：</strong>
                                <span class="mono-text">${escapeHtml(defaultDirectory || effectiveDirectory || "桌面")}</span>
                            </div>
                        </div>

                        <div class="form-toolbar">
                            <button class="primary-btn" type="submit">儲存 / 執行任務</button>
                            <button class="outline-btn" type="button" data-action="reset-automation-form">重設任務表單</button>
                        </div>
                        <div class="inline-message" data-form-message-for="automation-form" aria-live="polite"></div>
                    </form>
                </article>

                <article class="sub-panel">
                    <div class="list-toolbar">
                        <div>
                            <h3>目前任務清單</h3>
                            <p class="helper-text">直接查看每個任務的頻率、目標、模板與匯出資料夾來源。</p>
                        </div>
                        <div class="badge-row">
                            ${renderBadge(`預設資料夾 ${defaultDirectory ? "已設定" : "未設定"}`, defaultDirectory ? "success" : "warning")}
                        </div>
                    </div>
                    ${renderAutomationTasks(datasets.automationTasks, exportConfig, automationExportConfig)}
                </article>
            </div>
        </div>
    `;
};

const originalGetFormMessageNode = getFormMessageNode;
getFormMessageNode = function getFormMessageNodeWithAutoCreate(formOrId) {
    const existingNode = originalGetFormMessageNode(formOrId);
    if (existingNode) return existingNode;

    const formId = typeof formOrId === "string"
        ? formOrId
        : formOrId?.getAttribute?.("id") || "";
    if (!formId) return null;

    const form = document.getElementById(formId);
    if (!form) return null;

    const messageNode = document.createElement("div");
    messageNode.className = "inline-message";
    messageNode.setAttribute("data-form-message-for", formId);
    messageNode.setAttribute("aria-live", "polite");
    form.appendChild(messageNode);
    return messageNode;
};

async function saveAndReloadWithFormFeedback(url, body, message, formId) {
    await saveAndReload(url, body, message);
    setFormMessage(formId, message, "success");
}

const previousHandleDashboardSubmit = handleDashboardSubmit;
handleDashboardSubmit = async function handleDashboardSubmitAdminFeedbackOverride(event) {
    const form = event.target instanceof HTMLFormElement
        ? event.target
        : event.target?.closest?.("form");
    const formId = form?.getAttribute("id") || "";
    const managedAdminForms = new Set([
        "employee-form",
        "shift-form",
        "manual-punch-form",
        "data-settings-form",
        "greeting-form",
        "bell-form",
        "effect-form",
        "theme-schedule-form",
        "custom-theme-form"
    ]);

    if (!managedAdminForms.has(formId)) {
        return previousHandleDashboardSubmit(event);
    }

    event.preventDefault();
    if (!form) return;

    const datasets = getDatasets();
    setFormMessage(formId, "");

    try {
        if (formId === "employee-form") {
            const values = Object.fromEntries(new FormData(form).entries());
            const originalId = values.editingId?.trim() || "";
            const employee = {
                id: values.id?.trim(),
                name: values.name?.trim(),
                gender: values.gender?.trim(),
                nationality: values.nationality?.trim(),
                department: values.department?.trim(),
                job_title: values.job_title?.trim(),
                card: values.card?.trim(),
                password: values.password?.trim(),
                national_id: values.national_id?.trim() || "",
                birth_date: values.birth_date || "",
                hire_date: values.hire_date || "",
                termination_date: values.termination_date || "",
                bank_account: values.bank_account?.trim() || "",
                mobile_phone: values.mobile_phone?.trim() || "",
                emergency_contact: values.emergency_contact?.trim() || "",
                emergency_phone: values.emergency_phone?.trim() || "",
                contact_address: values.contact_address?.trim() || "",
                registered_address: values.registered_address?.trim() || "",
                family_status: values.family_status?.trim() || "",
                notes: values.notes?.trim() || ""
            };
            if (!employee.id || !employee.name || !employee.department || !employee.card || !employee.password) {
                throw new Error("工號、姓名、部門、卡號與密碼都是必填欄位。");
            }
            if (datasets.employees.some((item) => item.card === employee.card && item.id !== (originalId || employee.id))) {
                throw new Error("這個卡號已經被其他員工使用。");
            }
            await saveAndReloadWithFormFeedback("/api/browser/admin/employee/save", { employee, originalId }, "員工資料已儲存。", formId);
            return;
        }

        if (formId === "shift-form") {
            const shifts = Array.from(form.querySelectorAll(".shift-row")).map((row) => ({
                name: row.querySelector('[name="shift-name"]').value.trim(),
                start: row.querySelector('[name="shift-start"]').value,
                end: row.querySelector('[name="shift-end"]').value
            })).filter((shift) => shift.name && shift.start && shift.end);
            await saveAndReloadWithFormFeedback("/api/browser/admin/shifts/save", { shifts }, "班別設定已儲存。", formId);
            return;
        }

        if (formId === "manual-punch-form") {
            const values = Object.fromEntries(new FormData(form).entries());
            await saveAndReloadWithFormFeedback("/api/browser/admin/manual-punch", values, "補登打卡已儲存。", formId);
            return;
        }

        if (formId === "data-settings-form") {
            const values = Object.fromEntries(new FormData(form).entries());
            await saveAndReloadWithFormFeedback("/api/browser/admin/data-settings", values, "資料設定已儲存。", formId);
            return;
        }

        if (formId === "greeting-form") {
            const values = Object.fromEntries(new FormData(form).entries());
            const nextGreeting = {
                id: values.editingId || `greeting_${Date.now()}`,
                type: values.type,
                employee_id: values.employee_id?.trim() || null,
                message: values.message?.trim()
            };
            const updated = values.editingId
                ? datasets.greetings.map((item) => item.id === values.editingId ? nextGreeting : item)
                : [...datasets.greetings, nextGreeting];
            await saveAndReloadWithFormFeedback("/api/browser/admin/greetings/save", { greetings: updated }, "問候語設定已儲存。", formId);
            return;
        }

        if (formId === "bell-form") {
            const values = Object.fromEntries(new FormData(form).entries());
            const days = Array.from(form.querySelectorAll('input[name="days"]:checked')).map((checkbox) => checkbox.value);
            if (!days.length) {
                throw new Error("請至少選擇一個要啟用的星期。");
            }
            const nextBell = {
                id: values.editingId || `schedule_${Date.now()}`,
                title: values.title?.trim(),
                time: values.time,
                sound: values.sound,
                duration: Number(values.duration) || 5,
                days,
                enabled: values.editingId ? datasets.bellSchedules.find((item) => item.id === values.editingId)?.enabled : true
            };
            const updated = values.editingId
                ? datasets.bellSchedules.map((item) => item.id === values.editingId ? nextBell : item)
                : [...datasets.bellSchedules, nextBell];
            await saveAndReloadWithFormFeedback("/api/browser/admin/bell-schedules/save", { bellSchedules: updated }, "響鈴設定已儲存。", formId);
            return;
        }

        if (formId === "effect-form") {
            const values = Object.fromEntries(new FormData(form).entries());
            const existingEffect = values.editingId
                ? datasets.specialEffects.find((item) => item.id === values.editingId)
                : null;
            const nextEffect = {
                id: values.editingId || `effect_${Date.now()}`,
                name: values.name?.trim(),
                prefix: values.prefix?.trim() || "",
                suffix: values.suffix?.trim() || "",
                start_date: values.start_date,
                end_date: values.end_date,
                enabled: existingEffect ? Boolean(existingEffect.enabled) : true
            };
            const updated = values.editingId
                ? datasets.specialEffects.map((item) => item.id === values.editingId ? nextEffect : item)
                : [...datasets.specialEffects, nextEffect];
            await saveAndReloadWithFormFeedback("/api/browser/admin/special-effects/save", { specialEffects: updated }, "節日特效已儲存。", formId);
            return;
        }

        if (formId === "theme-schedule-form") {
            const values = Object.fromEntries(new FormData(form).entries());
            const existingSchedule = values.editingId
                ? datasets.themeSchedules.find((item) => item.id === values.editingId)
                : null;
            const nextSchedule = {
                id: values.editingId || `theme_schedule_${Date.now()}`,
                name: values.name?.trim(),
                theme_name: values.theme_name,
                start_date: values.start_date,
                end_date: values.end_date,
                enabled: existingSchedule ? Boolean(existingSchedule.enabled) : true
            };
            const updated = values.editingId
                ? datasets.themeSchedules.map((item) => item.id === values.editingId ? nextSchedule : item)
                : [...datasets.themeSchedules, nextSchedule];
            await saveAndReloadWithFormFeedback("/api/browser/admin/theme-schedules/save", { themeSchedules: updated }, "主題排程已儲存。", formId);
            return;
        }

        if (formId === "custom-theme-form") {
            const values = Object.fromEntries(new FormData(form).entries());
            const nextTheme = {
                id: values.editingId || `custom_${Date.now()}`,
                name: values.name?.trim(),
                styles: buildThemeStylesFromForm(form)
            };
            if (!nextTheme.name) {
                throw new Error("請先輸入主題名稱。");
            }
            const updated = values.editingId
                ? datasets.customThemes.map((item) => item.id === values.editingId ? nextTheme : item)
                : [...datasets.customThemes, nextTheme];
            await saveAndReloadWithFormFeedback("/api/browser/admin/custom-themes/save", { customThemes: updated }, "自訂主題已儲存。", formId);
            return;
        }
    } catch (error) {
        setMessage(ui.dashboardMessage, error.message, "error");
        setFormMessage(formId, error.message, "error");
    }
};

const originalSyncAutomationFormVisibility = syncAutomationFormVisibility;
syncAutomationFormVisibility = function syncAutomationFormVisibilityOverride() {
    originalSyncAutomationFormVisibility();
    const form = document.getElementById("automation-form");
    if (!form) return;
    const taskType = form.elements.task_type?.value;
    const exportDirectoryField = document.getElementById("automation-export-directory-field");
    const exportDirectoryActions = document.getElementById("automation-export-directory-actions");
    const showExportDirectory = taskType === "export";
    if (exportDirectoryField) exportDirectoryField.classList.toggle("hidden", !showExportDirectory);
    if (exportDirectoryActions) exportDirectoryActions.classList.toggle("hidden", !showExportDirectory);
};

const originalResetAutomationForm = resetAutomationForm;
resetAutomationForm = function resetAutomationFormOverride() {
    originalResetAutomationForm();
    const form = document.getElementById("automation-form");
    if (form?.elements.export_directory) form.elements.export_directory.value = "";
    setFormMessage("automation-form", "");
};

const originalFillAutomationForm = fillAutomationForm;
fillAutomationForm = function fillAutomationFormOverride(taskId) {
    originalFillAutomationForm(taskId);
    const task = getDatasets().automationTasks.find((item) => item.id === taskId);
    const form = document.getElementById("automation-form");
    if (task && form?.elements.export_directory) {
        form.elements.export_directory.value = task.export_directory || "";
    }
    setFormMessage("automation-form", "");
};

const originalHandleDashboardClick = handleDashboardClick;
handleDashboardClick = async function handleDashboardClickOverride(event) {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) return originalHandleDashboardClick(event);

    const action = actionTarget.dataset.action;

    try {
        if (action === "pick-automation-default-directory") {
            const form = document.getElementById("automation-export-directory-form");
            if (!form) return;
            const pickedPath = await pickAutomationExportDirectory(form.elements.defaultDirectory?.value?.trim() || "");
            if (!pickedPath) return;
            form.elements.defaultDirectory.value = pickedPath;
            setFormMessage("automation-export-directory-form", `已選擇資料夾：${pickedPath}`, "info");
            return;
        }
        if (action === "clear-automation-default-directory") {
            const form = document.getElementById("automation-export-directory-form");
            if (!form) return;
            form.elements.defaultDirectory.value = "";
            setFormMessage("automation-export-directory-form", "已清空預設資料夾，儲存後會回退到桌面。", "info");
            return;
        }
        if (action === "pick-automation-task-directory") {
            const form = document.getElementById("automation-form");
            if (!form) return;
            const pickedPath = await pickAutomationExportDirectory(form.elements.export_directory?.value?.trim() || "");
            if (!pickedPath) return;
            form.elements.export_directory.value = pickedPath;
            setFormMessage("automation-form", `已選擇任務資料夾：${pickedPath}`, "info");
            return;
        }
        if (action === "clear-automation-task-directory") {
            const form = document.getElementById("automation-form");
            if (!form) return;
            form.elements.export_directory.value = "";
            setFormMessage("automation-form", "已清空任務專用資料夾，儲存後會改用預設資料夾。", "info");
            return;
        }
    } catch (error) {
        setMessage(ui.dashboardMessage, error.message, "error");
        return;
    }

    return originalHandleDashboardClick(event);
};

const originalHandleDashboardSubmit = handleDashboardSubmit;
handleDashboardSubmit = async function handleDashboardSubmitOverride(event) {
    const form = event.target instanceof HTMLFormElement
        ? event.target
        : event.target?.closest?.("form");
    const formId = form?.getAttribute("id") || "";

    if (formId !== "automation-form" && formId !== "automation-export-directory-form") {
        return originalHandleDashboardSubmit(event);
    }

    event.preventDefault();
    if (!form) return;

    const datasets = getDatasets();
    setFormMessage(formId, "");

    try {
        if (formId === "automation-export-directory-form") {
            const values = Object.fromEntries(new FormData(form).entries());
            const result = await requestJson("/api/browser/developer/automation-export-directory/save", {
                method: "POST",
                body: {
                    defaultDirectory: values.defaultDirectory?.trim() || ""
                },
                auth: true
            });
            await reloadDashboard(result.message || "預設匯出資料夾已儲存。");
            setFormMessage(formId, result.message || "預設匯出資料夾已儲存。", "success");
            return;
        }

        const values = Object.fromEntries(new FormData(form).entries());
        const frequency = values.frequency;
        if (frequency !== "immediate" && !values.time) {
            throw new Error("每日、每週、每月任務都需要設定執行時間。");
        }

        const exportConfig = getAttendanceExportConfig(datasets);
        const task = {
            id: values.editingId || `auto_task_${Date.now()}`,
            frequency,
            day: frequency === "monthly" ? values.monthlyDay : values.weeklyDay,
            time: frequency === "immediate" ? "" : values.time,
            task_type: values.task_type,
            target: values.target,
            export_template: isAttendanceExportTask(values.task_type, values.target)
                ? (values.export_template || exportConfig.defaultTemplateId || "full")
                : "full",
            export_directory: ["export", "backup"].includes(values.task_type) ? (values.export_directory?.trim() || "") : "",
            enabled: values.enabled === "true"
        };

        if (frequency === "immediate" && !values.editingId) {
            const result = await requestJson("/api/browser/developer/automation-tasks/execute", {
                method: "POST",
                body: task,
                auth: true
            });
            await reloadDashboard(result.message || "立即任務已完成。");
            setFormMessage(formId, result.message || "立即任務已完成。", "success");
            return;
        }

        const updatedTasks = values.editingId
            ? datasets.automationTasks.map((item) => item.id === values.editingId ? task : item)
            : [...datasets.automationTasks, task];

        const result = await requestJson("/api/browser/developer/automation-tasks/save", {
            method: "POST",
            body: { automationTasks: updatedTasks },
            auth: true
        });
        await reloadDashboard(result.message || "自動化任務已儲存。");
        setFormMessage(formId, result.message || "自動化任務已儲存。", "success");
    } catch (error) {
        setMessage(ui.dashboardMessage, error.message, "error");
        setFormMessage(formId, error.message, "error");
    }
};

const SAVE_FEEDBACK_FORM_IDS = new Set([
    "hero-description-form",
    "employee-form",
    "shift-form",
    "manual-punch-form",
    "data-settings-form",
    "admin-password-form",
    "greeting-form",
    "bell-form",
    "effect-form",
    "theme-schedule-form",
    "custom-theme-form",
    "automation-form",
    "attendance-export-settings-form",
    "automation-export-directory-form",
    "system-password-form"
]);

function formatFeedbackTimestamp(date = new Date()) {
    return date.toLocaleTimeString("zh-TW", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}

function ensureFeedbackToastHost() {
    let host = document.getElementById("browser-feedback-toast-host");
    if (host) return host;

    host = document.createElement("div");
    host.id = "browser-feedback-toast-host";
    host.className = "feedback-toast-host";
    document.body.appendChild(host);
    return host;
}

function showFeedbackToast(message, type = "info") {
    const normalizedMessage = String(message || "").trim();
    if (!normalizedMessage) return;

    const host = ensureFeedbackToastHost();
    const toast = document.createElement("div");
    toast.className = `feedback-toast ${type}`;
    toast.textContent = `${normalizedMessage} ${formatFeedbackTimestamp()}`;
    host.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add("show");
    });

    const closeToast = () => {
        toast.classList.remove("show");
        window.setTimeout(() => toast.remove(), 220);
    };

    window.setTimeout(closeToast, 2200);
}

function triggerFeedbackPulse(target) {
    if (!target) return;
    target.classList.remove("feedback-pulse");
    void target.offsetWidth;
    target.classList.add("feedback-pulse");
    window.setTimeout(() => target.classList.remove("feedback-pulse"), 460);
}

const originalSetFormMessageWithAutoCreate = setFormMessage;
setFormMessage = function setFormMessageEnhanced(formOrId, text, type = "info", options = {}) {
    const normalizedText = String(text || "").trim();
    if (!normalizedText) {
        originalSetFormMessageWithAutoCreate(formOrId, "", type);
        return;
    }

    const includeTimestamp = options.includeTimestamp ?? true;
    const shouldToast = options.toast ?? (type === "success" || type === "error");
    const renderedText = includeTimestamp
        ? `${normalizedText} ${formatFeedbackTimestamp()}`
        : normalizedText;

    originalSetFormMessageWithAutoCreate(formOrId, renderedText, type);
    const target = getFormMessageNode(formOrId);
    triggerFeedbackPulse(target);

    if (shouldToast) {
        showFeedbackToast(normalizedText, type);
    }
};

function getSubmittingLabelForForm(form) {
    const formId = form?.getAttribute?.("id") || "";
    if (formId === "manual-punch-form") return "送出中...";
    if (formId === "admin-password-form" || formId === "system-password-form") return "更新中...";
    if (formId === "automation-form") {
        const editingId = String(form.elements.editingId?.value || "").trim();
        const frequency = String(form.elements.frequency?.value || "").trim();
        return frequency === "immediate" && !editingId ? "執行中..." : "儲存中...";
    }
    return "儲存中...";
}

function setFormSubmittingState(form, isSubmitting) {
    if (!form) return;
    const pendingLabel = getSubmittingLabelForForm(form);
    const submitButtons = Array.from(form.querySelectorAll('button[type="submit"], input[type="submit"]'));

    submitButtons.forEach((button) => {
        const isInput = button.tagName === "INPUT";
        if (isSubmitting) {
            if (!button.dataset.originalLabel) {
                button.dataset.originalLabel = isInput ? button.value : button.textContent;
            }
            if (isInput) button.value = pendingLabel;
            else button.textContent = pendingLabel;
            button.disabled = true;
            button.classList.add("is-submitting");
            return;
        }

        const originalLabel = button.dataset.originalLabel;
        if (originalLabel !== undefined) {
            if (isInput) button.value = originalLabel;
            else button.textContent = originalLabel;
            delete button.dataset.originalLabel;
        }
        button.disabled = false;
        button.classList.remove("is-submitting");
    });
}

const originalHandleDashboardSubmitWithFeedback = handleDashboardSubmit;
handleDashboardSubmit = async function handleDashboardSubmitBusyWrapper(event) {
    const form = event.target instanceof HTMLFormElement
        ? event.target
        : event.target?.closest?.("form");
    const formId = form?.getAttribute?.("id") || "";

    if (!SAVE_FEEDBACK_FORM_IDS.has(formId)) {
        return originalHandleDashboardSubmitWithFeedback(event);
    }

    setFormSubmittingState(form, true);
    try {
        await originalHandleDashboardSubmitWithFeedback(event);
        if (formId === "attendance-export-settings-form") {
            setFormMessage(formId, "考勤報表匯出設定已儲存。", "success");
        }
    } finally {
        setFormSubmittingState(form, false);
    }
};

const EXTENDED_THEME_STYLE_DEFAULTS = {
    ...defaultThemeStyles,
    pageBgImage: "",
    browserPageBgImage: "",
    titleBgImage: "",
    browserTitleBgImage: ""
};

const THEME_IMAGE_TARGETS = {
    page: {
        storedField: "pageBgImage",
        browserField: "browserPageBgImage",
        label: "主畫面背景圖片"
    },
    title: {
        storedField: "titleBgImage",
        browserField: "browserTitleBgImage",
        label: "標題區圖片"
    },
    clock: {
        storedField: "clockBgImage",
        browserField: "browserClockBgImage",
        label: "時鐘背景圖片"
    }
};

function getResolvedThemeStyles(styles = {}) {
    return { ...EXTENDED_THEME_STYLE_DEFAULTS, ...styles };
}

function themeHexToRgba(color, alpha) {
    const value = String(color || "").trim();
    const normalized = value.replace("#", "");
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return value || "transparent";
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildThemeSurfaceStyle(startColor, endColor, imageUrl) {
    const gradientOnly = `linear-gradient(to top, ${escapeHtml(startColor)} 0%, ${escapeHtml(endColor)} 100%)`;
    if (!imageUrl) {
        return `background-image:${gradientOnly};background-size:cover;background-position:center;background-repeat:no-repeat;`;
    }

    return `background-image:linear-gradient(to top, ${themeHexToRgba(startColor, 0.84)} 0%, ${themeHexToRgba(endColor, 0.44)} 100%), url('${escapeHtml(imageUrl)}');background-size:cover, cover;background-position:center, center;background-repeat:no-repeat, no-repeat;`;
}

function buildThemeTitleStyle(imageUrl) {
    if (!imageUrl) return "";
    return `background-image:linear-gradient(135deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0.08) 100%), url('${escapeHtml(imageUrl)}');background-size:cover, cover;background-position:center, center;background-repeat:no-repeat, no-repeat;box-shadow:0 18px 34px rgba(15,23,42,0.16);`;
}

function getThemeImageTargetConfig(targetName) {
    return THEME_IMAGE_TARGETS[targetName] || THEME_IMAGE_TARGETS.clock;
}

function getThemeImageFileName(value) {
    const normalized = String(value || "").trim();
    if (!normalized) return "";
    return normalized.split(/[\\/]/).pop() || normalized;
}

function setThemeImageValues(form, targetName, storedPath, browserUrl) {
    const config = getThemeImageTargetConfig(targetName);
    if (!form?.elements?.[config.storedField] || !form?.elements?.[config.browserField]) return;
    form.elements[config.storedField].value = storedPath || "";
    form.elements[config.browserField].value = browserUrl || "";
}

function syncThemeImageControlState(form) {
    if (!form) return;
    Object.entries(THEME_IMAGE_TARGETS).forEach(([targetName, config]) => {
        const statusNode = form.querySelector(`[data-image-status="${targetName}"]`);
        if (!statusNode) return;
        const currentValue = form.elements?.[config.storedField]?.value || "";
        const fileName = getThemeImageFileName(currentValue);
        statusNode.textContent = fileName ? `已設定：${fileName}` : "尚未設定";
    });
}

function renderThemeImageControl(targetName, title, helpText) {
    return `
        <div class="theme-image-control">
            <div class="theme-image-control-header">
                <div>
                    <strong>${escapeHtml(title)}</strong>
                    <span>${escapeHtml(helpText)}</span>
                </div>
            </div>
            <div class="status-box">
                <strong>目前狀態</strong>
                <span data-image-status="${escapeHtml(targetName)}">尚未設定</span>
            </div>
            <div class="inline-actions">
                <button class="secondary-btn" type="button" data-action="trigger-theme-image-upload" data-image-target="${escapeHtml(targetName)}">上傳圖片</button>
                <button class="outline-btn" type="button" data-action="clear-theme-image" data-image-target="${escapeHtml(targetName)}">清除圖片</button>
            </div>
        </div>
    `;
}

renderCustomThemes = function renderCustomThemesEnhanced(datasets) {
    if (!datasets.customThemes.length) return renderEmptyState("目前還沒有儲存任何自訂主題。");
    return `
        <div class="record-list">
            ${datasets.customThemes.map((theme) => {
                const styles = getResolvedThemeStyles(theme.styles);
                const imageAreas = [];
                if (styles.pageBgImage) imageAreas.push("背景");
                if (styles.titleBgImage) imageAreas.push("標題");
                if (styles.clockBgImage) imageAreas.push("時鐘");
                return `
                    <div class="list-item">
                        <div class="list-item-top">
                            <span>${escapeHtml(theme.name)}</span>
                            <div class="inline-actions">
                                <button class="mini-btn" type="button" data-action="edit-custom-theme" data-id="${escapeHtml(theme.id)}">載入編輯</button>
                                <button class="mini-btn" type="button" data-action="delete-custom-theme" data-id="${escapeHtml(theme.id)}">刪除</button>
                            </div>
                        </div>
                        <div class="record-subline">打卡特效：${escapeHtml(styles.punchEffect || "none")}，圖片區域：${escapeHtml(imageAreas.length ? imageAreas.join(" / ") : "未設定")}</div>
                    </div>
                `;
            }).join("")}
        </div>
    `;
};

renderThemePreview = function renderThemePreviewEnhanced(styles) {
    const previewStyles = getResolvedThemeStyles(styles);
    const settings = getDatasets().settings || {};
    const mainTitle = settings.mainTitle || "震欣科技AI作息系統";
    const subtitle = settings.subtitle || "您的 AI 智慧好夥伴";
    const pageStyle = buildThemeSurfaceStyle(previewStyles.bgDayStart, previewStyles.bgDayEnd, previewStyles.browserPageBgImage);
    const titleStyle = buildThemeTitleStyle(previewStyles.browserTitleBgImage);
    const clockStyle = [
        `background-color:${escapeHtml(previewStyles.clockBg)}`,
        `color:${escapeHtml(previewStyles.clockText)}`,
        previewStyles.browserClockBgImage ? `background-image:url('${escapeHtml(previewStyles.browserClockBgImage)}')` : "background-image:none",
        "background-size:cover",
        `background-position:${escapeHtml(previewStyles.clockBgPos || "center")}`,
        "background-repeat:no-repeat"
    ].join(";");

    return `
        <div id="custom-theme-preview" class="theme-preview-stage">
            <div class="theme-preview-page" style="${pageStyle}">
                <div class="theme-preview-surface">
                    <header class="theme-preview-header">
                        <div class="theme-preview-title-banner" style="${titleStyle}">
                            <strong style="color:${escapeHtml(previewStyles.mainTitleColor)};">${escapeHtml(mainTitle)}</strong>
                            <span>${escapeHtml(subtitle)}</span>
                        </div>
                        <div class="theme-preview-clock" style="${clockStyle}">
                            <div class="theme-preview-clock-symbols">
                                <span>${escapeHtml(previewStyles.clockSymbolsLeft || "")}</span>
                                <span>${escapeHtml(previewStyles.clockSymbolsRight || "")}</span>
                            </div>
                            <div class="theme-preview-clock-date" style="color:${escapeHtml(previewStyles.clockText)};">2026年03月23日 星期一</div>
                            <div class="theme-preview-clock-time" style="color:${escapeHtml(previewStyles.clockText)};">14:36:08</div>
                        </div>
                    </header>

                    <div class="theme-preview-field">
                        <label>員工編號 / 卡號 / 密碼</label>
                        <div class="preview-input">A001234567</div>
                    </div>

                    <div class="theme-preview-fields">
                        <div class="theme-preview-field">
                            <label>目前班別</label>
                            <div class="preview-select">日班 (08:00 - 17:00)</div>
                        </div>
                        <div class="theme-preview-field">
                            <label>打卡模式</label>
                            <div class="preview-select">系統自動判定</div>
                        </div>
                    </div>

                    <div class="theme-preview-message">歡迎回來，資料已準備完成。</div>

                    <div class="theme-preview-actions">
                        <button class="theme-preview-action" type="button" style="background:${escapeHtml(previewStyles.btnAdminBg)};color:${escapeHtml(previewStyles.btnAdminText)};">管理者設定</button>
                        <button class="theme-preview-action" type="button" style="background:${escapeHtml(previewStyles.btnReportBg)};color:${escapeHtml(previewStyles.btnReportText)};">考勤報表</button>
                        <button class="theme-preview-action" type="button" style="background:${escapeHtml(previewStyles.btnAiBg)};color:${escapeHtml(previewStyles.btnAiText)};">AI 系統控制</button>
                    </div>
                </div>
            </div>
        </div>
    `;
};

buildThemeStylesFromForm = function buildThemeStylesFromFormEnhanced(form) {
    const values = Object.fromEntries(new FormData(form).entries());
    return {
        ...EXTENDED_THEME_STYLE_DEFAULTS,
        bgDayStart: values.bgDayStart,
        bgDayEnd: values.bgDayEnd,
        bgNightStart: values.bgNightStart,
        bgNightEnd: values.bgNightEnd,
        dayStartTime: values.dayStartTime,
        nightStartTime: values.nightStartTime,
        mainTitleColor: values.mainTitleColor,
        btnAdminBg: values.btnAdminBg,
        btnAdminText: values.btnAdminText,
        btnReportBg: values.btnReportBg,
        btnReportText: values.btnReportText,
        btnAiBg: values.btnAiBg,
        btnAiText: values.btnAiText,
        clockBg: values.clockBg,
        clockText: values.clockText,
        pageBgImage: values.pageBgImage || "",
        browserPageBgImage: values.browserPageBgImage || "",
        titleBgImage: values.titleBgImage || "",
        browserTitleBgImage: values.browserTitleBgImage || "",
        clockBgImage: values.clockBgImage || "",
        browserClockBgImage: values.browserClockBgImage || "",
        clockBgPos: values.clockBgPos,
        clockSymbolsLeft: values.clockSymbolsLeft || "",
        clockSymbolsRight: values.clockSymbolsRight || "",
        blinkEnabled: values.blinkEnabled === "true",
        blinkDayColor: values.blinkDayColor,
        blinkNightColor: values.blinkNightColor,
        punchEffect: values.punchEffect,
        punchFallContent: values.punchFallContent || "",
        punchFlashContent: values.punchFlashContent || ""
    };
};

updateThemePreviewFromForm = function updateThemePreviewFromFormEnhanced() {
    const form = document.getElementById("custom-theme-form");
    const host = document.getElementById("theme-preview-host");
    if (!form || !host) return;
    syncThemeImageControlState(form);
    host.innerHTML = renderThemePreview(buildThemeStylesFromForm(form));
};

resetCustomThemeForm = function resetCustomThemeFormEnhanced() {
    const form = document.getElementById("custom-theme-form");
    if (!form) return;
    form.reset();
    form.elements.editingId.value = "";
    Object.entries(EXTENDED_THEME_STYLE_DEFAULTS).forEach(([key, value]) => {
        if (form.elements[key]) form.elements[key].value = String(value);
    });
    form.elements.blinkEnabled.value = "false";
    const fileInput = document.getElementById("theme-image-file");
    if (fileInput) fileInput.dataset.imageTarget = "clock";
    updateThemePreviewFromForm();
};

fillCustomThemeForm = function fillCustomThemeFormEnhanced(themeId) {
    const theme = getDatasets().customThemes.find((item) => item.id === themeId);
    const form = document.getElementById("custom-theme-form");
    if (!theme || !form) return;
    const styles = getResolvedThemeStyles(theme.styles);
    form.elements.editingId.value = theme.id;
    form.elements.name.value = theme.name || "";
    Object.entries(styles).forEach(([key, value]) => {
        if (form.elements[key]) form.elements[key].value = String(value ?? "");
    });
    const fileInput = document.getElementById("theme-image-file");
    if (fileInput) fileInput.dataset.imageTarget = "clock";
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    updateThemePreviewFromForm();
};

renderAdminThemeSection = function renderAdminThemeSectionPreviewAligned(datasets) {
    const themeOptions = `
        <option value="default">預設主題</option>
        ${renderOptions(datasets.customThemes, { labelFn: (theme) => theme.name })}
    `;

    return `
        <div class="workspace-stack">
            <article class="workspace-card">
                <div class="list-toolbar">
                    <div>
                        <p class="sub-kicker">主題與特效</p>
                        <h3>主題排程與自訂主題</h3>
                    </div>
                    <div class="badge-row">
                        ${renderBadge(`節日特效 ${datasets.specialEffects.length} 筆`, "success")}
                        ${renderBadge(`主題排程 ${datasets.themeSchedules.length} 筆`)}
                        ${renderBadge(`自訂主題 ${datasets.customThemes.length} 筆`)}
                    </div>
                </div>
                <p class="helper-text">自訂主題現在支援 3 個圖片區域：主畫面背景、標題區、時鐘背景。即時預覽也改成依照桌面主畫面骨架縮放顯示，方便直接比對視覺效果。</p>
            </article>

            <div class="split-panels">
                <article class="sub-panel">
                    <div class="list-toolbar">
                        <div>
                            <h3>節日特效</h3>
                            <p class="helper-text">設定節日或特定期間的前後綴效果，建立後會先預設啟用，並可在下方清單切換。</p>
                        </div>
                    </div>
                    <form id="effect-form" class="stack-form">
                        <input type="hidden" name="editingId" value="">
                        <div class="form-section-card">
                            <div class="form-section-grid five-up">
                                <label class="field"><span>特效名稱</span><input name="name" required></label>
                                <label class="field"><span>前綴文字</span><input name="prefix"></label>
                                <label class="field"><span>後綴文字</span><input name="suffix"></label>
                                <label class="field"><span>開始日期</span><input name="start_date" type="date" required></label>
                                <label class="field"><span>結束日期</span><input name="end_date" type="date" required></label>
                            </div>
                        </div>
                        <div class="form-toolbar">
                            <button class="primary-btn" type="submit">儲存節日特效</button>
                            <button class="outline-btn" type="button" data-action="reset-effect-form">清空特效表單</button>
                        </div>
                    </form>
                    ${renderSpecialEffects(datasets.specialEffects)}
                </article>

                <article class="sub-panel">
                    <div class="list-toolbar">
                        <div>
                            <h3>主題排程</h3>
                            <p class="helper-text">安排哪一段日期使用哪一個主題，建立後會先預設啟用，並可在下方清單切換。</p>
                        </div>
                    </div>
                    <form id="theme-schedule-form" class="stack-form">
                        <input type="hidden" name="editingId" value="">
                        <div class="form-section-card">
                            <div class="form-section-grid five-up">
                                <label class="field"><span>排程名稱</span><input name="name" required></label>
                                <label class="field"><span>主題</span><select name="theme_name">${themeOptions}</select></label>
                                <label class="field"><span>開始日期</span><input name="start_date" type="date" required></label>
                                <label class="field"><span>結束日期</span><input name="end_date" type="date" required></label>
                            </div>
                        </div>
                        <div class="form-toolbar">
                            <button class="primary-btn" type="submit">儲存主題排程</button>
                            <button class="outline-btn" type="button" data-action="reset-theme-schedule-form">清空排程表單</button>
                        </div>
                    </form>
                    ${renderThemeSchedules(datasets)}
                </article>
            </div>

            <article class="sub-panel">
                <div class="list-toolbar">
                    <div>
                        <h3>自訂主題編輯器</h3>
                        <p class="helper-text">背景、標題與時鐘都可以各自套用圖片。圖片上傳後會先反映在即時預覽，記得再按儲存主題才會正式寫入。</p>
                    </div>
                </div>

                <div class="theme-editor-layout">
                    <form id="custom-theme-form" class="stack-form theme-editor-panel">
                        <input type="hidden" name="editingId" value="">
                        <input type="hidden" name="pageBgImage" value="">
                        <input type="hidden" name="browserPageBgImage" value="">
                        <input type="hidden" name="titleBgImage" value="">
                        <input type="hidden" name="browserTitleBgImage" value="">
                        <input type="hidden" name="clockBgImage" value="">
                        <input type="hidden" name="browserClockBgImage" value="">

                        <div class="form-section-card">
                            <div class="form-section-heading">
                                <h4>主題基本資料</h4>
                                <p class="helper-text">先命名主題，再設定白天與夜晚的切換時間。</p>
                            </div>
                            <div class="form-section-grid five-up">
                                <label class="field"><span>主題名稱</span><input name="name" required></label>
                                <label class="field"><span>時鐘圖片定位</span><select name="clockBgPos"><option value="center">置中</option><option value="top">靠上</option><option value="bottom">靠下</option><option value="left">靠左</option><option value="right">靠右</option><option value="top left">左上</option><option value="top right">右上</option><option value="bottom left">左下</option><option value="bottom right">右下</option></select></label>
                                <label class="field"><span>白天開始時間</span><input name="dayStartTime" type="time" value="${escapeHtml(EXTENDED_THEME_STYLE_DEFAULTS.dayStartTime)}"></label>
                                <label class="field"><span>夜晚開始時間</span><input name="nightStartTime" type="time" value="${escapeHtml(EXTENDED_THEME_STYLE_DEFAULTS.nightStartTime)}"></label>
                            </div>
                        </div>

                        <div class="form-section-card">
                            <div class="form-section-heading">
                                <h4>背景與標題</h4>
                                <p class="helper-text">整體背景會套用在主畫面 body；標題區圖片會套用在主標題與副標題外層的標題區塊。</p>
                            </div>
                            <div class="form-section-grid five-up">
                                <label class="field color-field"><span>白天背景起點</span><input name="bgDayStart" type="color" value="${escapeHtml(EXTENDED_THEME_STYLE_DEFAULTS.bgDayStart)}"></label>
                                <label class="field color-field"><span>白天背景終點</span><input name="bgDayEnd" type="color" value="${escapeHtml(EXTENDED_THEME_STYLE_DEFAULTS.bgDayEnd)}"></label>
                                <label class="field color-field"><span>夜晚背景起點</span><input name="bgNightStart" type="color" value="${escapeHtml(EXTENDED_THEME_STYLE_DEFAULTS.bgNightStart)}"></label>
                                <label class="field color-field"><span>夜晚背景終點</span><input name="bgNightEnd" type="color" value="${escapeHtml(EXTENDED_THEME_STYLE_DEFAULTS.bgNightEnd)}"></label>
                                <label class="field color-field"><span>主標題顏色</span><input name="mainTitleColor" type="color" value="${escapeHtml(EXTENDED_THEME_STYLE_DEFAULTS.mainTitleColor)}"></label>
                            </div>
                            <div class="theme-image-grid three-up">
                                ${renderThemeImageControl("page", "主畫面背景圖片", "套用在桌面主畫面的整體背景。")}
                                ${renderThemeImageControl("title", "標題區圖片", "套用在主標題與副標題的標題區外框。")}
                                ${renderThemeImageControl("clock", "時鐘背景圖片", "套用在主時鐘面板內部背景。")}
                            </div>
                        </div>

                        <div class="form-section-card">
                            <div class="form-section-heading">
                                <h4>按鈕與時鐘色彩</h4>
                                <p class="helper-text">調整時鐘面板與 3 顆主要按鈕的配色。</p>
                            </div>
                            <div class="form-section-grid">
                                <label class="field color-field"><span>時鐘背景</span><input name="clockBg" type="color" value="${escapeHtml(EXTENDED_THEME_STYLE_DEFAULTS.clockBg)}"></label>
                                <label class="field color-field"><span>時鐘文字</span><input name="clockText" type="color" value="${escapeHtml(EXTENDED_THEME_STYLE_DEFAULTS.clockText)}"></label>
                                <label class="field color-field"><span>管理者按鈕背景</span><input name="btnAdminBg" type="color" value="${escapeHtml(EXTENDED_THEME_STYLE_DEFAULTS.btnAdminBg)}"></label>
                                <label class="field color-field"><span>管理者按鈕文字</span><input name="btnAdminText" type="color" value="${escapeHtml(EXTENDED_THEME_STYLE_DEFAULTS.btnAdminText)}"></label>
                                <label class="field color-field"><span>報表按鈕背景</span><input name="btnReportBg" type="color" value="${escapeHtml(EXTENDED_THEME_STYLE_DEFAULTS.btnReportBg)}"></label>
                                <label class="field color-field"><span>報表按鈕文字</span><input name="btnReportText" type="color" value="${escapeHtml(EXTENDED_THEME_STYLE_DEFAULTS.btnReportText)}"></label>
                                <label class="field color-field"><span>AI 按鈕背景</span><input name="btnAiBg" type="color" value="${escapeHtml(EXTENDED_THEME_STYLE_DEFAULTS.btnAiBg)}"></label>
                                <label class="field color-field"><span>AI 按鈕文字</span><input name="btnAiText" type="color" value="${escapeHtml(EXTENDED_THEME_STYLE_DEFAULTS.btnAiText)}"></label>
                            </div>
                        </div>

                        <div class="form-section-card">
                            <div class="form-section-heading">
                                <h4>裝飾與打卡特效</h4>
                                <p class="helper-text">這些設定會影響時鐘裝飾、閃爍邊框與打卡後特效。</p>
                            </div>
                            <div class="form-section-grid">
                                <label class="field"><span>左側符號</span><input name="clockSymbolsLeft"></label>
                                <label class="field"><span>右側符號</span><input name="clockSymbolsRight"></label>
                                <label class="field"><span>閃爍邊框</span><select name="blinkEnabled"><option value="false">停用</option><option value="true">啟用</option></select></label>
                                <label class="field"><span>打卡特效</span><select name="punchEffect"><option value="none">無</option><option value="fall">灑落</option><option value="flash">閃現</option></select></label>
                                <label class="field color-field"><span>白天閃爍色</span><input name="blinkDayColor" type="color" value="${escapeHtml(EXTENDED_THEME_STYLE_DEFAULTS.blinkDayColor)}"></label>
                                <label class="field color-field"><span>夜晚閃爍色</span><input name="blinkNightColor" type="color" value="${escapeHtml(EXTENDED_THEME_STYLE_DEFAULTS.blinkNightColor)}"></label>
                                <label class="field"><span>灑落內容</span><input name="punchFallContent" value="${escapeHtml(EXTENDED_THEME_STYLE_DEFAULTS.punchFallContent)}"></label>
                                <label class="field"><span>閃現內容</span><input name="punchFlashContent" value="${escapeHtml(EXTENDED_THEME_STYLE_DEFAULTS.punchFlashContent)}"></label>
                            </div>
                        </div>

                        <div class="form-toolbar">
                            <div class="inline-actions">
                                <button class="primary-btn" type="submit">儲存自訂主題</button>
                                <button class="outline-btn" type="button" data-action="reset-custom-theme-form">重設主題表單</button>
                            </div>
                        </div>
                    </form>

                    <div class="theme-preview-stack">
                        <div class="form-section-card preview-shell">
                            <div class="form-section-heading">
                                <h4>即時預覽</h4>
                                <p class="helper-text">以下預覽改為依照桌面主畫面版型縮放顯示，更接近實際套用後的樣子。</p>
                            </div>
                            <div id="theme-preview-host">${renderThemePreview(EXTENDED_THEME_STYLE_DEFAULTS)}</div>
                        </div>

                        <div class="form-section-card">
                            <div class="form-section-heading">
                                <h4>已儲存主題</h4>
                                <p class="helper-text">可以載入舊主題繼續編輯，或刪除不再使用的主題。</p>
                            </div>
                            ${renderCustomThemes(datasets)}
                        </div>
                    </div>
                </div>

                <input id="theme-image-file" type="file" accept=".png,.jpg,.jpeg,.gif,.webp,image/*" class="hidden">
            </article>
        </div>
    `;
};

const originalHandleDashboardClickWithThemeImages = handleDashboardClick;
handleDashboardClick = async function handleDashboardClickThemeImageOverride(event) {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) return originalHandleDashboardClickWithThemeImages(event);

    const action = actionTarget.dataset.action;

    if (action === "trigger-theme-image-upload") {
        const input = document.getElementById("theme-image-file");
        if (!input) return;
        input.dataset.imageTarget = actionTarget.dataset.imageTarget || "clock";
        input.click();
        return;
    }

    if (action === "clear-theme-image") {
        const form = document.getElementById("custom-theme-form");
        if (!form) return;
        const targetName = actionTarget.dataset.imageTarget || "clock";
        setThemeImageValues(form, targetName, "", "");
        updateThemePreviewFromForm();
        setFormMessage("custom-theme-form", `${getThemeImageTargetConfig(targetName).label}已清除。`, "info", { toast: false });
        return;
    }

    return originalHandleDashboardClickWithThemeImages(event);
};

const originalHandleDashboardChangeWithThemeImages = handleDashboardChange;
handleDashboardChange = async function handleDashboardChangeThemeImageOverride(event) {
    const target = event.target;

    if (target.id === "theme-image-file" && target.files?.[0]) {
        try {
            const file = target.files[0];
            const targetName = target.dataset.imageTarget || "clock";
            const config = getThemeImageTargetConfig(targetName);
            const dataUrl = await readFileAsDataUrl(file);
            const result = await requestJson("/api/browser/admin/custom-themes/upload-image", {
                method: "POST",
                body: { dataUrl, fileName: file.name },
                auth: true
            });
            const form = document.getElementById("custom-theme-form");
            if (form) {
                setThemeImageValues(form, targetName, result.data.path, result.data.browserUrl);
                updateThemePreviewFromForm();
                setFormMessage("custom-theme-form", `${config.label}已上傳，記得再儲存主題。`, "success");
            }
            target.value = "";
            return;
        } catch (error) {
            target.value = "";
            setMessage(ui.dashboardMessage, error.message, "error");
            setFormMessage("custom-theme-form", error.message, "error");
            return;
        }
    }

    return originalHandleDashboardChangeWithThemeImages(event);
};

function getAuditRoleLabel(role) {
    return auditRoleLabels[role] || role || "-";
}

function getAuditActionLabel(action) {
    return auditActionLabels[action] || action || "-";
}

function getAuditTargetTypeLabel(targetType) {
    return auditTargetTypeLabels[targetType] || targetType || "-";
}

function formatAuditTimestamp(timestamp) {
    const value = Number(timestamp);
    if (!value) return "-";
    return new Date(value).toLocaleString("zh-TW", { hour12: false });
}

function renderAuditSnapshotPanel(title, value) {
    if (value == null) return "";
    return `
        <div class="audit-log-snapshot">
            <h4>${escapeHtml(title)}</h4>
            <pre class="audit-log-json">${escapeHtml(JSON.stringify(value, null, 2))}</pre>
        </div>
    `;
}

function isPunchFailureAuditLog(log) {
    return log
        && log.action === "punch"
        && log.target_type === "punch_record"
        && (log.success === false || log.success === 0 || log.success === "false");
}

function isCardReaderTestAuditLog(log) {
    return log && log.target_type === "card_reader_test";
}

function normalizeAuditData(value) {
    if (value && typeof value === "object") return value;
    if (typeof value === "string" && value.trim()) {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch (error) {
            return {};
        }
    }
    return {};
}

function renderPunchDiagnosticField(label, value, { mono = false } = {}) {
    const text = value == null || value === "" ? "-" : String(value);
    return `
        <div>
            <dt>${escapeHtml(label)}</dt>
            <dd class="${mono ? "mono-text" : ""}">${escapeHtml(text)}</dd>
        </div>
    `;
}

function buildCardAuditRecordText(data = {}) {
    const credentialInput = String(data.credential_input || data.input_value || data.raw_input || "").trim();
    const inputLength = data.input_length == null || data.input_length === "" ? "-" : String(data.input_length);
    const inputSuffix = data.input_suffix == null || data.input_suffix === "" ? "-" : String(data.input_suffix);
    const cardHash = String(data.card_hash || "").trim() || "-";
    return `完整輸入值：${credentialInput || "-"}；輸入長度：${inputLength}；卡號後 4 碼：${inputSuffix}；卡號雜湊：${cardHash}`;
}

function renderPunchFailureDiagnostic(log) {
    const data = normalizeAuditData(log.after_data);
    const credentialInput = String(data.credential_input || data.input_value || data.raw_input || "").trim();
    const cardHash = String(data.card_hash || "").trim();
    const cardHashText = cardHash || "-";
    const reason = data.failure_reason || data.error_message || log.summary || "打卡失敗";
    const employeeText = [data.employee_id, data.employee_name].filter(Boolean).join(" / ");
    const deviceText = [data.device_id, data.device_name].filter(Boolean).join(" / ");
    const supportCode = data.support_code || data.failure_code || "-";
    const cardAuditRecordText = buildCardAuditRecordText(data);

    return `
        <div class="punch-diagnostic-panel">
            <div class="punch-diagnostic-heading">
                <strong>打卡失敗診斷</strong>
                <span class="mono-text">${escapeHtml(supportCode)}</span>
            </div>
            <dl class="punch-diagnostic-grid">
                ${renderPunchDiagnosticField("失敗原因", reason)}
                ${renderPunchDiagnosticField("卡號紀錄", cardAuditRecordText, { mono: true })}
                ${renderPunchDiagnosticField("完整輸入值", credentialInput || "-", { mono: true })}
                ${renderPunchDiagnosticField("輸入長度", data.input_length)}
                ${renderPunchDiagnosticField("卡號後 4 碼", data.input_suffix, { mono: true })}
                ${renderPunchDiagnosticField("卡號雜湊", cardHashText, { mono: true })}
                ${renderPunchDiagnosticField("員工", employeeText)}
                ${renderPunchDiagnosticField("裝置", deviceText)}
                ${renderPunchDiagnosticField("名冊筆數", data.employee_catalog_count)}
                ${renderPunchDiagnosticField("來源", data.channel || log.channel)}
            </dl>
        </div>
    `;
}

function renderCardReaderTestDiagnostic(log) {
    const data = normalizeAuditData(log.after_data);
    const cardHash = String(data.card_hash || "").trim();
    const cardHashText = cardHash || "-";
    const code = data.failure_code || data.warning_code || "-";
    const reason = data.failure_reason || data.warning_reason || log.summary || "讀卡測試";
    const duplicateText = [data.duplicate_employee_id, data.duplicate_employee_name].filter(Boolean).join(" / ");
    const cardAuditRecordText = buildCardAuditRecordText(data);

    return `
        <div class="punch-diagnostic-panel">
            <div class="punch-diagnostic-heading">
                <strong>讀卡測試診斷</strong>
                <span class="mono-text">${escapeHtml(code)}</span>
            </div>
            <dl class="punch-diagnostic-grid">
                ${renderPunchDiagnosticField("結果", log.success ? "讀卡有收到輸入" : "未收到有效輸入")}
                ${renderPunchDiagnosticField("說明", reason)}
                ${renderPunchDiagnosticField("卡號紀錄", cardAuditRecordText, { mono: true })}
                ${renderPunchDiagnosticField("輸入長度", data.input_length)}
                ${renderPunchDiagnosticField("卡號後 4 碼", data.input_suffix, { mono: true })}
                ${renderPunchDiagnosticField("卡號雜湊", cardHashText, { mono: true })}
                ${renderPunchDiagnosticField("重複員工", duplicateText)}
                ${renderPunchDiagnosticField("來源", log.channel)}
            </dl>
        </div>
    `;
}

function renderAuditLogs(logs) {
    if (!Array.isArray(logs) || !logs.length) {
        return renderEmptyState("目前沒有符合條件的操作稽核紀錄。");
    }

    return `
        <div class="record-list audit-log-list">
            ${logs.map((log) => {
                const actorText = log.actor_name
                    ? `${log.actor_name}${log.actor_id ? ` (${log.actor_id})` : ""}`
                    : (log.actor_id || "未知操作者");
                const summary = log.summary
                    || `${getAuditActionLabel(log.action)} ${getAuditTargetTypeLabel(log.target_type)}`;
                const hasDetail = log.before_data != null || log.after_data != null;
                return `
                    <div class="list-item audit-log-item">
                        <div class="list-item-top">
                            <span class="audit-log-title">${escapeHtml(summary)}</span>
                            <div class="badge-row">
                                ${renderBadge(getAuditActionLabel(log.action))}
                                ${renderBadge(log.success ? "成功" : "失敗", log.success ? "success" : "danger")}
                            </div>
                        </div>
                        <div class="audit-log-meta">
                            <span>時間：${escapeHtml(formatAuditTimestamp(log.timestamp))}</span>
                            <span>操作者：${escapeHtml(actorText)}</span>
                            <span>角色：${escapeHtml(getAuditRoleLabel(log.role))}</span>
                            <span>來源：${escapeHtml(log.channel || "-")}</span>
                            <span>對象：${escapeHtml(getAuditTargetTypeLabel(log.target_type))}</span>
                            ${log.target_id ? `<span>ID：<span class="mono-text">${escapeHtml(log.target_id)}</span></span>` : ""}
                        </div>
                        ${isPunchFailureAuditLog(log)
                            ? renderPunchFailureDiagnostic(log)
                            : (isCardReaderTestAuditLog(log) ? renderCardReaderTestDiagnostic(log) : "")}
                        ${hasDetail ? `
                            <details class="audit-log-detail">
                                <summary>查看變更資料</summary>
                                <div class="audit-log-detail-grid">
                                    ${renderAuditSnapshotPanel("變更前", log.before_data)}
                                    ${renderAuditSnapshotPanel("變更後", log.after_data)}
                                </div>
                            </details>
                        ` : ""}
                    </div>
                `;
            }).join("")}
        </div>
    `;
}

getRealtimeSyncLabel = function getRealtimeSyncLabelAuditOverride(type) {
    if (type === "employees") return "員工資料";
    if (type === "punchRecords") return "打卡紀錄";
    if (type === "shifts") return "班別設定";
    if (type === "displaySettings") return "主畫面設定";
    if (type === "adminPassword") return "管理者密碼";
    if (type === "greetings") return "問候語";
    if (type === "bellSchedules") return "作息響鈴";
    if (type === "customSounds") return "自訂音效";
    if (type === "bellHistory") return "響鈴歷史";
    if (type === "specialEffects") return "節日特效";
    if (type === "themeSchedules") return "主題排程";
    if (type === "customThemes") return "自訂主題";
    if (type === "automationTasks") return "自動化任務";
    if (type === "automationLog") return "自動化日誌";
    if (type === "auditLogs") return "操作稽核";
    if (type === "auditArchiveSettings") return "稽核封存設定";
    if (type === "systemPassword") return "系統密碼";
    if (type === "automationExportDirectory") return "自動化匯出資料夾";
    if (type === "attendanceExportSettings") return "考勤匯出設定";
    return type;
};

handleRealtimeSyncMessage = async function handleRealtimeSyncMessageAuditOverride(payload) {
    const type = String(payload?.type || "");
    const employeeSyncTypes = new Set(["displaySettings"]);
    const adminSyncTypes = new Set([
        "employees",
        "punchRecords",
        "shifts",
        "displaySettings",
        "adminPassword",
        "greetings",
        "bellSchedules",
        "customSounds",
        "bellHistory",
        "specialEffects",
        "themeSchedules",
        "customThemes"
    ]);
    const developerSyncTypes = new Set([
        "automationTasks",
        "automationLog",
        "auditLogs",
        "auditArchiveSettings",
        "systemPassword",
        "automationExportDirectory",
        "databaseBackup",
        "systemHealth",
        "attendanceExportSettings",
        "displaySettings"
    ]);
    if (!state.dashboard) return;
    if (payload.origin === "browser" && payload.sessionToken && payload.sessionToken === state.token) return;

    const role = state.dashboard.role;
    const shouldReload = (role === "employee" && employeeSyncTypes.has(type))
        || (role === "admin" && adminSyncTypes.has(type))
        || (role === "developer" && developerSyncTypes.has(type));
    if (!shouldReload) return;

    try {
        await reloadDashboard(`已同步${getRealtimeSyncLabel(type)}最新內容。`, "info");
    } catch (error) {
        console.error("Failed to sync realtime dashboard update:", error);
    }
};

renderDeveloperLogsSection = function renderDeveloperLogsSectionOverride(datasets) {
    const defaults = createDefaultDeveloperAuditState();
    const auditState = ensureDeveloperAuditState();
    const defaultLimit = String(Number(datasets.auditLogSummary?.defaultLimit || defaults.filters.limit) || 100);

    if (!auditState.queried) {
        state.developerAudit = {
            ...auditState,
            filters: {
                ...defaults.filters,
                limit: defaultLimit
            },
            logs: Array.isArray(datasets.auditLogs) ? datasets.auditLogs : [],
            total: Number(datasets.auditLogSummary?.total || 0),
            queried: false
        };
    } else {
        state.developerAudit = {
            ...auditState,
            filters: {
                ...defaults.filters,
                ...auditState.filters,
                limit: String(auditState.filters.limit || defaultLimit)
            }
        };
    }

    const currentAuditState = ensureDeveloperAuditState();
    const auditSummaryText = currentAuditState.queried
        ? `符合條件 ${currentAuditState.total} 筆，目前顯示 ${currentAuditState.logs.length} 筆。`
        : `預設顯示最近 ${currentAuditState.logs.length} 筆，共 ${currentAuditState.total} 筆。`;

    return `
        <div class="workspace-stack">
            <article class="sub-panel">
                <div class="list-toolbar">
                    <h3>自動化日誌</h3>
                    <button class="danger-btn" type="button" data-action="clear-automation-log">清除日誌</button>
                </div>
                ${renderAutomationLogs(datasets.automationLog)}
            </article>

            <article class="sub-panel">
                <h3>變更系統密碼</h3>
                <form id="system-password-form" class="stack-form">
                    <div class="field-grid">
                        <label class="field"><span>目前系統密碼</span><input name="currentPassword" type="password" required></label>
                        <label class="field"><span>新系統密碼</span><input name="newPassword" type="password" required></label>
                    </div>
                    <button class="primary-btn" type="submit">儲存新密碼</button>
                    <div class="inline-message" data-form-message-for="system-password-form" aria-live="polite"></div>
                </form>
            </article>

            <article class="sub-panel">
                <div class="list-toolbar">
                    <div>
                        <h3>操作稽核紀錄</h3>
                        <p class="helper-text">可依日期、操作者、動作與關鍵字查詢。敏感欄位會自動遮罩，預設只載入最近 100 筆。</p>
                    </div>
                    <div class="badge-row">
                        ${renderBadge(`總筆數 ${currentAuditState.total}`)}
                        ${renderBadge(`目前顯示 ${currentAuditState.logs.length}`)}
                    </div>
                </div>
                <form id="audit-log-query-form" class="stack-form">
                    <div class="field-grid audit-log-grid">
                        <label class="field">
                            <span>開始日期</span>
                            <input name="startDate" type="date" value="${escapeHtml(currentAuditState.filters.startDate || "")}">
                        </label>
                        <label class="field">
                            <span>結束日期</span>
                            <input name="endDate" type="date" value="${escapeHtml(currentAuditState.filters.endDate || "")}">
                        </label>
                        <label class="field">
                            <span>操作者工號</span>
                            <input name="actorId" type="text" value="${escapeHtml(currentAuditState.filters.actorId || "")}" placeholder="例如 A001">
                        </label>
                        <label class="field">
                            <span>角色</span>
                            <select name="role">
                                <option value="">全部</option>
                                ${Object.entries(auditRoleLabels).map(([value, label]) => `
                                    <option value="${escapeHtml(value)}" ${currentAuditState.filters.role === value ? "selected" : ""}>${escapeHtml(label)}</option>
                                `).join("")}
                            </select>
                        </label>
                        <label class="field">
                            <span>動作</span>
                            <select name="action">
                                <option value="">全部</option>
                                ${Object.entries(auditActionLabels).map(([value, label]) => `
                                    <option value="${escapeHtml(value)}" ${currentAuditState.filters.action === value ? "selected" : ""}>${escapeHtml(label)}</option>
                                `).join("")}
                            </select>
                        </label>
                        <label class="field">
                            <span>資料對象</span>
                            <select name="targetType">
                                <option value="">全部</option>
                                ${Object.entries(auditTargetTypeLabels).map(([value, label]) => `
                                    <option value="${escapeHtml(value)}" ${currentAuditState.filters.targetType === value ? "selected" : ""}>${escapeHtml(label)}</option>
                                `).join("")}
                            </select>
                        </label>
                        <label class="field">
                            <span>結果</span>
                            <select name="success">
                                <option value="">全部</option>
                                <option value="true" ${currentAuditState.filters.success === "true" ? "selected" : ""}>成功</option>
                                <option value="false" ${currentAuditState.filters.success === "false" ? "selected" : ""}>失敗</option>
                            </select>
                        </label>
                        <label class="field">
                            <span>關鍵字</span>
                            <input name="query" type="text" value="${escapeHtml(currentAuditState.filters.query || "")}" placeholder="可搜尋摘要、操作者、目標 ID">
                        </label>
                        <label class="field">
                            <span>載入筆數</span>
                            <select name="limit">
                                ${["50", "100", "150", "200"].map((value) => `
                                    <option value="${value}" ${String(currentAuditState.filters.limit || defaultLimit) === value ? "selected" : ""}>${value}</option>
                                `).join("")}
                            </select>
                        </label>
                    </div>
                    <div class="form-toolbar">
                        <div class="inline-actions">
                            <button class="primary-btn" type="submit">查詢稽核</button>
                            <button class="outline-btn" type="button" data-action="filter-punch-failure-audit">只看打卡失敗</button>
                            <button class="outline-btn" type="button" data-action="filter-card-reader-audit">只看讀卡測試</button>
                            <button class="outline-btn" type="button" data-action="reset-audit-log-query">還原最近紀錄</button>
                        </div>
                        <p class="helper-text audit-log-summary">${escapeHtml(auditSummaryText)}</p>
                    </div>
                    <div class="inline-message" data-form-message-for="audit-log-query-form" aria-live="polite"></div>
                </form>
                <div class="audit-log-scroll">
                    ${renderAuditLogs(currentAuditState.logs)}
                </div>
            </article>
        </div>
    `;
};

renderDeveloperStatusSection = function renderDeveloperStatusSectionAuditOverride(datasets) {
    const health = datasets.systemHealth || {};
    const latestLogText = health.lastAutomationLog
        ? `${health.lastAutomationLog.timestampText} / ${health.lastAutomationLog.status} / ${health.lastAutomationLog.message}`
        : "目前沒有自動化執行紀錄。";

    return `
        <div class="workspace-stack">
            <article class="workspace-card">
                <div class="list-toolbar">
                    <div>
                        <p class="sub-kicker">AI 系統控制</p>
                        <h3>系統健康總覽</h3>
                    </div>
                    <div class="badge-row">
                        ${renderBadge(`狀態 ${health.statusText || "-"}`, health.status === "ok" ? "success" : "danger")}
                        ${renderBadge(`API ${health.apiCount ?? 0} 支`)}
                    </div>
                </div>
                <p class="helper-text">這裡會顯示瀏覽器服務、桌面端與自動化系統目前的即時狀態，方便開發人員快速確認是否正常同步。</p>
                ${renderStatsGrid({
                    statusText: health.statusText || "-",
                    port: health.port || "-",
                    uptimeText: health.uptimeText || "-",
                    browserSessionCount: health.browserSessionCount ?? 0,
                    enabledAutomationTaskCount: health.enabledAutomationTaskCount ?? 0,
                    apiCount: health.apiCount ?? 0
                }, {
                    statusText: "服務狀態",
                    port: "服務埠號",
                    uptimeText: "運行時間",
                    browserSessionCount: "瀏覽器 Session",
                    enabledAutomationTaskCount: "啟用任務數",
                    apiCount: "已公開 API"
                })}
            </article>

            <article class="sub-panel">
                <div class="list-toolbar">
                    <div>
                        <p class="sub-kicker">系統資料</p>
                        <h3>同步與紀錄狀態</h3>
                    </div>
                    <div class="badge-row">
                        ${renderBadge(`桌面主窗 ${health.desktopWindowText || "-"}`, health.desktopWindowAttached ? "success" : "danger")}
                        ${renderBadge(`版本 ${health.appVersion || "-"}`)}
                    </div>
                </div>
                ${buildKeyValueGrid([
                    { label: "啟動時間", value: health.startedAtText || "-" },
                    { label: "資料庫位置", value: health.databasePath || "-", mono: true },
                    { label: "預設匯出資料夾", value: health.automationExportDirectory || "(未設定)", mono: true },
                    { label: "目前有效匯出位置", value: health.automationExportEffectiveDirectory || "-", mono: true },
                    { label: "桌面回退位置", value: health.automationExportFallbackDirectory || "-", mono: true },
                    { label: "員工資料", value: `${health.employeeCount ?? 0} 筆` },
                    { label: "打卡紀錄", value: `${health.punchRecordCount ?? 0} 筆` },
                    { label: "響鈴排程", value: `${health.bellScheduleCount ?? 0} 組` },
                    { label: "響鈴歷史", value: `${health.bellHistoryCount ?? 0} 筆` },
                    { label: "自訂聲音", value: `${health.customSoundCount ?? 0} 筆` },
                    { label: "自訂主題", value: `${health.customThemeCount ?? 0} 筆` },
                    { label: "自動化任務", value: `${health.automationTaskCount ?? 0} 筆` },
                    { label: "自動化日誌", value: `${health.automationLogCount ?? 0} 筆` },
                    { label: "操作稽核", value: `${health.auditLogCount ?? 0} 筆` },
                    { label: "稽核封存檔", value: `${health.auditArchiveCount ?? 0} 份` },
                    { label: "稽核保留天數", value: `${health.auditLogRetentionDays ?? 180} 天` },
                    { label: "系統密碼狀態", value: health.systemPasswordSet ? "已設定" : "未設定" },
                    { label: "最近自動化日誌", value: latestLogText }
                ])}
            </article>

            ${renderApiCatalogTables(datasets.apiCatalog || [])}
        </div>
    `;
};

SAVE_FEEDBACK_FORM_IDS.add("audit-log-query-form");
SAVE_FEEDBACK_FORM_IDS.add("audit-archive-settings-form");

const originalHandleLogoutWithAuditState = handleLogout;
handleLogout = async function handleLogoutAuditStateOverride(isSilent = false) {
    await originalHandleLogoutWithAuditState(isSilent);
    state.developerAudit = null;
};

function normalizeDeveloperAuditFilters(filters = {}) {
    const defaults = createDefaultDeveloperAuditState().filters;
    return {
        startDate: String(filters.startDate || "").trim(),
        endDate: String(filters.endDate || "").trim(),
        actorId: String(filters.actorId || "").trim(),
        role: String(filters.role || "").trim(),
        action: String(filters.action || "").trim(),
        targetType: String(filters.targetType || "").trim(),
        success: String(filters.success || "").trim(),
        query: String(filters.query || "").trim(),
        limit: String(filters.limit || defaults.limit || "100").trim() || "100"
    };
}

async function runDeveloperAuditQuery(filters, { formId = "", successMessage = "" } = {}) {
    const normalizedFilters = normalizeDeveloperAuditFilters(filters);
    if (formId) setFormMessage(formId, "");

    const result = await requestJson("/api/browser/developer/audit-logs/query", {
        method: "POST",
        body: {
            ...normalizedFilters,
            limit: Number(normalizedFilters.limit) || 100
        },
        auth: true
    });

    state.developerAudit = {
        filters: {
            ...createDefaultDeveloperAuditState().filters,
            ...(result.data?.filters || normalizedFilters || {}),
            limit: String(result.data?.filters?.limit || normalizedFilters.limit || "100"),
            success: String(result.data?.filters?.success ?? normalizedFilters.success ?? "")
        },
        logs: Array.isArray(result.data?.logs) ? result.data.logs : [],
        total: Number(result.data?.total || 0),
        queried: true
    };
    renderDashboard(state.dashboard);

    const message = successMessage || result.message || "操作稽核查詢完成。";
    setMessage(ui.dashboardMessage, message, "success");
    if (formId) setFormMessage(formId, message, "success");
    return result;
}

const originalHandleDashboardClickWithAuditLogs = handleDashboardClick;
handleDashboardClick = async function handleDashboardClickAuditLogOverride(event) {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) return originalHandleDashboardClickWithAuditLogs(event);

    if (actionTarget.dataset.action === "reset-audit-log-query") {
        state.developerAudit = createDefaultDeveloperAuditState();
        await reloadDashboard("已還原最近操作稽核。", "info");
        return;
    }

    if (actionTarget.dataset.action === "filter-punch-failure-audit") {
        const filters = {
            ...ensureDeveloperAuditState().filters,
            action: "punch",
            targetType: "punch_record",
            success: "false",
            query: "",
            limit: "100"
        };
        try {
            await runDeveloperAuditQuery(filters, {
                formId: "audit-log-query-form",
                successMessage: "已篩選打卡失敗診斷紀錄。"
            });
        } catch (error) {
            setMessage(ui.dashboardMessage, error.message, "error");
            setFormMessage("audit-log-query-form", error.message, "error");
        }
        return;
    }

    if (actionTarget.dataset.action === "filter-card-reader-audit") {
        const filters = {
            ...ensureDeveloperAuditState().filters,
            action: "execute",
            targetType: "card_reader_test",
            success: "",
            query: "",
            limit: "100"
        };
        try {
            await runDeveloperAuditQuery(filters, {
                formId: "audit-log-query-form",
                successMessage: "已篩選讀卡測試診斷紀錄。"
            });
        } catch (error) {
            setMessage(ui.dashboardMessage, error.message, "error");
            setFormMessage("audit-log-query-form", error.message, "error");
        }
        return;
    }

    return originalHandleDashboardClickWithAuditLogs(event);
};

const originalHandleDashboardSubmitWithAuditLogs = handleDashboardSubmit;
handleDashboardSubmit = async function handleDashboardSubmitAuditLogOverride(event) {
    const form = event.target instanceof HTMLFormElement
        ? event.target
        : event.target?.closest?.("form");
    const formId = form?.getAttribute?.("id") || "";

    if (formId !== "audit-log-query-form") {
        return originalHandleDashboardSubmitWithAuditLogs(event);
    }

    event.preventDefault();
    if (!form) return;

    const values = Object.fromEntries(new FormData(form).entries());
    const filters = {
        startDate: String(values.startDate || "").trim(),
        endDate: String(values.endDate || "").trim(),
        actorId: String(values.actorId || "").trim(),
        role: String(values.role || "").trim(),
        action: String(values.action || "").trim(),
        targetType: String(values.targetType || "").trim(),
        success: String(values.success || "").trim(),
        query: String(values.query || "").trim(),
        limit: String(values.limit || "100").trim() || "100"
    };

    setFormMessage(formId, "");
    try {
        const result = await requestJson("/api/browser/developer/audit-logs/query", {
            method: "POST",
            body: {
                ...filters,
                limit: Number(filters.limit) || 100
            },
            auth: true
        });
        state.developerAudit = {
            filters: {
                ...createDefaultDeveloperAuditState().filters,
                ...(result.data?.filters || filters || {}),
                limit: String(result.data?.filters?.limit || filters.limit || "100")
            },
            logs: Array.isArray(result.data?.logs) ? result.data.logs : [],
            total: Number(result.data?.total || 0),
            queried: true
        };
        renderDashboard(state.dashboard);
        const successMessage = result.message || "操作稽核查詢完成。";
        setMessage(ui.dashboardMessage, successMessage, "success");
        setFormMessage(formId, successMessage, "success");
    } catch (error) {
        setMessage(ui.dashboardMessage, error.message, "error");
        setFormMessage(formId, error.message, "error");
    }
};

const originalHandleDashboardClickWithAuditArchive = handleDashboardClick;
handleDashboardClick = async function handleDashboardClickAuditArchiveOverride(event) {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) return originalHandleDashboardClickWithAuditArchive(event);

    try {
        if (actionTarget.dataset.action === "pick-audit-archive-directory") {
            const form = document.getElementById("audit-archive-settings-form");
            if (!form) return;
            const pickedPath = await pickAuditArchiveDirectory(form.elements.archiveDirectory?.value?.trim() || "");
            if (!pickedPath) return;
            form.elements.archiveDirectory.value = pickedPath;
            setFormMessage("audit-archive-settings-form", `已選擇封存資料夾：${pickedPath}`, "info");
            return;
        }
        if (actionTarget.dataset.action === "clear-audit-archive-directory") {
            const form = document.getElementById("audit-archive-settings-form");
            if (!form) return;
            form.elements.archiveDirectory.value = "";
            setFormMessage("audit-archive-settings-form", "已清空封存資料夾，儲存後會改用系統預設封存路徑。", "info");
            return;
        }
        if (actionTarget.dataset.action === "run-audit-archive-now") {
            const result = await requestJson("/api/browser/developer/audit-archive/run", {
                method: "POST",
                auth: true
            });
            await reloadDashboard(result.message || "稽核封存執行完成。");
            setMessage(ui.dashboardMessage, result.message || "稽核封存執行完成。", "success");
            setFormMessage("audit-archive-settings-form", result.message || "稽核封存執行完成。", "success");
            return;
        }
    } catch (error) {
        setMessage(ui.dashboardMessage, error.message, "error");
        setFormMessage("audit-archive-settings-form", error.message, "error");
        return;
    }

    return originalHandleDashboardClickWithAuditArchive(event);
};

const originalHandleDashboardSubmitWithAuditArchive = handleDashboardSubmit;
handleDashboardSubmit = async function handleDashboardSubmitAuditArchiveOverride(event) {
    const form = event.target instanceof HTMLFormElement
        ? event.target
        : event.target?.closest?.("form");
    const formId = form?.getAttribute?.("id") || "";

    if (formId !== "audit-archive-settings-form") {
        return originalHandleDashboardSubmitWithAuditArchive(event);
    }

    event.preventDefault();
    if (!form) return;

    const values = Object.fromEntries(new FormData(form).entries());
    const body = {
        retentionDays: Number(values.retentionDays) || 180,
        archiveDirectory: String(values.archiveDirectory || "").trim()
    };

    setFormMessage(formId, "");
    try {
        const result = await requestJson("/api/browser/developer/audit-archive-settings/save", {
            method: "POST",
            body,
            auth: true
        });
        await reloadDashboard(result.message || "稽核封存設定已更新。");
        setMessage(ui.dashboardMessage, result.message || "稽核封存設定已更新。", "success");
        setFormMessage(formId, result.message || "稽核封存設定已更新。", "success");
    } catch (error) {
        setMessage(ui.dashboardMessage, error.message, "error");
        setFormMessage(formId, error.message, "error");
    }
};

const BROWSER_DEVICE_ID_STORAGE_KEY = "tanchin.browser.device.id";
const BROWSER_DEVICE_TOKEN_STORAGE_KEY = "tanchin.browser.device.token";
const BROWSER_DEVICE_NAME_STORAGE_KEY = "tanchin.browser.device.name";

auditTargetTypeLabels.employee_device = "綁定裝置";
auditTargetTypeLabels.browser_security_setting = "遠端打卡安全設定";
auditTargetTypeLabels.card_reader_test = "讀卡測試";

function generateBrowserDeviceId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `browser_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function detectBrowserName() {
    const userAgent = navigator.userAgent || "";
    if (/Edg\//.test(userAgent)) return "Edge";
    if (/Chrome\//.test(userAgent) && !/Edg\//.test(userAgent)) return "Chrome";
    if (/Firefox\//.test(userAgent)) return "Firefox";
    if (/Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)) return "Safari";
    return "Browser";
}

function detectPlatformName() {
    const platform = navigator.userAgentData?.platform || navigator.platform || "";
    return String(platform || "Unknown Platform").trim();
}

function buildDefaultBrowserDeviceName() {
    return `${detectPlatformName()} / ${detectBrowserName()}`;
}

function ensureBrowserDeviceIdentity() {
    let deviceId = localStorage.getItem(BROWSER_DEVICE_ID_STORAGE_KEY) || "";
    if (!deviceId) {
        deviceId = generateBrowserDeviceId();
        localStorage.setItem(BROWSER_DEVICE_ID_STORAGE_KEY, deviceId);
    }

    let deviceName = localStorage.getItem(BROWSER_DEVICE_NAME_STORAGE_KEY) || "";
    if (!deviceName) {
        deviceName = buildDefaultBrowserDeviceName();
        localStorage.setItem(BROWSER_DEVICE_NAME_STORAGE_KEY, deviceName);
    }

    return {
        deviceId,
        deviceName,
        deviceToken: localStorage.getItem(BROWSER_DEVICE_TOKEN_STORAGE_KEY) || "",
        platform: detectPlatformName(),
        browserName: detectBrowserName()
    };
}

function buildClientDeviceInfo() {
    const identity = ensureBrowserDeviceIdentity();
    return {
        deviceId: identity.deviceId,
        deviceToken: identity.deviceToken,
        deviceName: identity.deviceName,
        platform: identity.platform,
        browserName: identity.browserName
    };
}

function storeIssuedDeviceToken(token) {
    const normalizedToken = String(token || "").trim();
    if (!normalizedToken) return;
    localStorage.setItem(BROWSER_DEVICE_TOKEN_STORAGE_KEY, normalizedToken);
}

function describeGeolocationError(error) {
    if (!error) return "[P224] 無法取得 GPS 定位，請稍後再試。請把錯誤代碼 P224 告知管理者。";
    if (error.code === 1) return "[P225] 定位權限被拒絕，請允許瀏覽器使用定位功能後再試。請把錯誤代碼 P225 告知管理者。";
    if (error.code === 2) return "[P226] 目前無法取得定位，請確認手機或電腦的定位服務已開啟。請把錯誤代碼 P226 告知管理者。";
    if (error.code === 3) return "[P227] 取得定位逾時，請移動到訊號較好的地方後再試。請把錯誤代碼 P227 告知管理者。";
    return `[P224] ${error.message || "無法取得 GPS 定位，請稍後再試。"} 請把錯誤代碼 P224 告知管理者。`;
}

function requestCurrentBrowserLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error("[P220] 目前瀏覽器不支援 GPS 定位，請改用支援定位的裝置。請把錯誤代碼 P220 告知管理者。"));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => resolve({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                capturedAt: Date.now()
            }),
            (error) => reject(new Error(describeGeolocationError(error))),
            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0
            }
        );
    });
}

function formatBrowserPunchError(error) {
    const message = String(error?.message || "").trim();
    if (/^\[[A-Z]\d{3}\]/.test(message)) return message;
    if (/failed to fetch|networkerror|load failed/i.test(message)) {
        return "[P298] 打卡送出失敗，無法連上伺服器。請確認網路後再試，並把錯誤代碼 P298 告知管理者。";
    }
    return `[P299] 打卡失敗：${message || "未知錯誤"}。請把錯誤代碼 P299 告知管理者。`;
}

function getSecurityRiskLabel(flag) {
    if (flag === "gps_accuracy_warning") return "GPS 精度偏低";
    return flag || "風險";
}

function renderSecurityRiskBadges(riskFlags = []) {
    if (!Array.isArray(riskFlags) || !riskFlags.length) return renderBadge("正常", "success");
    return riskFlags.map((flag) => renderBadge(getSecurityRiskLabel(flag), "warning")).join("");
}

function renderEmployeeSecurityCard(security = {}) {
    const deviceStatusBadge = security.currentDeviceTrusted
        ? renderBadge("目前裝置已綁定", "success")
        : renderBadge("目前裝置未綁定", "danger");
    const gpsBadge = security.gpsRequiredOnPunch
        ? renderBadge(`打卡需定位 ±${security.maxGpsAccuracyMeters || 300}m`, "warning")
        : renderBadge("打卡定位為選填");

    return `
        <article class="info-card employee-security-card">
            <h3>遠端打卡安全</h3>
            <p class="hero-copy">登入裝置與 GPS 會在每次遠端打卡時一起驗證並留下稽核資料。</p>
            <div class="badge-row">
                ${deviceStatusBadge}
                ${gpsBadge}
            </div>
            <div class="security-meta-grid">
                <div><strong>目前裝置</strong><span>${escapeHtml(security.currentDeviceName || "尚未綁定")}</span></div>
                <div><strong>綁定數量</strong><span>${escapeHtml(String(security.boundDeviceCount ?? 0))}</span></div>
                <div><strong>最近使用</strong><span>${escapeHtml(security.currentDeviceLastSeenText || "-")}</span></div>
                <div><strong>最近 GPS</strong><span>${escapeHtml(security.currentDeviceLastLocationText || "尚未記錄")}</span></div>
            </div>
            <p class="helper-text">如果你換手機、清空瀏覽器資料，請通知管理者先清除舊的綁定裝置再重新登入。</p>
        </article>
    `;
}

function renderAdminSecuritySection(datasets) {
    const security = datasets.security || {
        settings: {
            deviceBindingEnabled: true,
            gpsRequiredOnPunch: true,
            maxGpsAccuracyMeters: 300
        },
        summary: {
            totalDevices: 0,
            boundEmployeeCount: 0,
            unboundEmployeeCount: 0,
            recentPunchCount: 0,
            riskyPunchCount: 0
        },
        employeeDevices: [],
        recentBrowserPunches: []
    };

    const deviceItems = security.employeeDevices.length
        ? `
            <div class="record-list security-record-list">
                ${security.employeeDevices.map((device) => `
                    <div class="list-item security-list-item">
                        <div class="list-item-top">
                            <span>${escapeHtml(device.employee_id)} / ${escapeHtml(device.employeeName || "未命名員工")}</span>
                            <div class="inline-actions">
                                <button class="mini-btn" type="button" data-action="delete-employee-device" data-employee-id="${escapeHtml(device.employee_id)}" data-device-id="${escapeHtml(device.device_id)}">解除這台</button>
                                <button class="mini-btn" type="button" data-action="clear-employee-devices" data-employee-id="${escapeHtml(device.employee_id)}">清除全部</button>
                            </div>
                        </div>
                        <div class="record-subline">裝置：${escapeHtml(device.deviceDisplayName || device.device_name || device.device_id)}</div>
                        <div class="security-detail-line">最近登入：${escapeHtml(device.lastSeenText || "-")}</div>
                        <div class="security-detail-line">最近 IP：${escapeHtml(device.last_ip || "-")}</div>
                        <div class="security-detail-line">最近 GPS：${escapeHtml(device.lastLocationText || "尚未記錄")}</div>
                    </div>
                `).join("")}
            </div>
        `
        : renderEmptyState("目前尚未有任何綁定裝置。");

    const recentPunchItems = security.recentBrowserPunches.length
        ? `
            <div class="record-list security-record-list">
                ${security.recentBrowserPunches.map((item) => `
                    <div class="list-item security-list-item">
                        <div class="list-item-top">
                            <span>${escapeHtml(item.employeeId)} / ${escapeHtml(item.employeeName || "-")}</span>
                            <div class="badge-row">
                                ${renderBadge(item.typeText || "-")}
                                ${renderSecurityRiskBadges(item.riskFlags)}
                            </div>
                        </div>
                        <div class="record-subline">時間：${escapeHtml(item.timestampText || "-")}</div>
                        <div class="security-detail-line">裝置：${escapeHtml(item.deviceName || item.deviceId || "-")}</div>
                        <div class="security-detail-line">GPS：${escapeHtml(item.locationText || "未提供定位")}</div>
                    </div>
                `).join("")}
            </div>
        `
        : renderEmptyState("目前還沒有瀏覽器遠端打卡紀錄。");

    return `
        <div class="workspace-stack">
            <article class="workspace-card">
                <div class="list-toolbar">
                    <div>
                        <p class="sub-kicker">遠端打卡防護</p>
                        <h3>裝置綁定與 GPS 定位</h3>
                    </div>
                    <div class="badge-row">
                        ${renderBadge(`綁定裝置 ${security.summary.totalDevices || 0} 台`, "success")}
                        ${renderBadge(`已綁員工 ${security.summary.boundEmployeeCount || 0} 人`)}
                        ${renderBadge(`未綁員工 ${security.summary.unboundEmployeeCount || 0} 人`, security.summary.unboundEmployeeCount ? "warning" : "success")}
                        ${renderBadge(`風險打卡 ${security.summary.riskyPunchCount || 0} 筆`, security.summary.riskyPunchCount ? "warning" : "success")}
                    </div>
                </div>
                <p class="helper-text">第一次員工登入會自動綁定目前裝置；之後若換裝置，需由管理者先解除舊綁定。遠端打卡時會驗證 GPS，並將裝置、IP 與定位資料寫入稽核紀錄。</p>
            </article>

            <article class="sub-panel">
                <h3>安全設定</h3>
                <form id="security-settings-form" class="stack-form">
                    <div class="field-grid">
                        <label class="field">
                            <span>啟用裝置綁定</span>
                            <select name="deviceBindingEnabled">
                                <option value="true" ${security.settings.deviceBindingEnabled ? "selected" : ""}>啟用</option>
                                <option value="false" ${!security.settings.deviceBindingEnabled ? "selected" : ""}>停用</option>
                            </select>
                        </label>
                        <label class="field">
                            <span>打卡必須 GPS</span>
                            <select name="gpsRequiredOnPunch">
                                <option value="true" ${security.settings.gpsRequiredOnPunch ? "selected" : ""}>必須</option>
                                <option value="false" ${!security.settings.gpsRequiredOnPunch ? "selected" : ""}>選填</option>
                            </select>
                        </label>
                        <label class="field">
                            <span>允許 GPS 精度上限（公尺）</span>
                            <input name="maxGpsAccuracyMeters" type="number" min="30" max="5000" step="10" value="${escapeHtml(String(security.settings.maxGpsAccuracyMeters || 300))}">
                        </label>
                    </div>
                    <div class="form-toolbar">
                        <button class="primary-btn" type="submit">儲存安全設定</button>
                    </div>
                </form>
            </article>

            <article class="table-card">
                <div class="list-toolbar">
                    <div>
                        <h3>員工綁定裝置</h3>
                        <p class="helper-text">可直接解除單一裝置，或清除該員工全部綁定後讓他重新綁定。</p>
                    </div>
                </div>
                ${deviceItems}
            </article>

            <article class="table-card">
                <div class="list-toolbar">
                    <div>
                        <h3>最近遠端打卡</h3>
                        <p class="helper-text">顯示近 50 筆瀏覽器打卡的裝置與定位資訊，方便查核異常。</p>
                    </div>
                </div>
                ${recentPunchItems}
            </article>
        </div>
    `;
}

const originalRenderEmployeeDashboardWithSecurity = renderEmployeeDashboard;
renderEmployeeDashboard = function renderEmployeeDashboardSecurityOverride(dashboard) {
    const baseHtml = originalRenderEmployeeDashboardWithSecurity(dashboard);
    if (!dashboard?.security) return baseHtml;
    const securityCard = renderEmployeeSecurityCard(dashboard.security);
    const closingIndex = baseHtml.lastIndexOf("</div>");
    if (closingIndex === -1) return `${baseHtml}${securityCard}`;
    return `${baseHtml.slice(0, closingIndex)}${securityCard}${baseHtml.slice(closingIndex)}`;
};

renderAdminDashboard = function renderAdminDashboardSecurityOverride(dashboard) {
    const sections = [
        { id: "people", label: "員工資料" },
        { id: "security", label: "安全控管" },
        { id: "shifts", label: "班別設定" },
        { id: "manualPunch", label: "補登打卡" },
        { id: "reports", label: "考勤報表" },
        { id: "system", label: "系統設定" },
        { id: "bells", label: "響鈴管理" },
        { id: "themes", label: "主題外觀" }
    ];

    const activeSection = state.activeSections.admin;
    const content = activeSection === "people"
        ? renderAdminPeopleSection(dashboard.datasets)
        : activeSection === "security"
            ? renderAdminSecuritySection(dashboard.datasets)
        : activeSection === "shifts"
            ? renderAdminShiftSection(dashboard.datasets)
        : activeSection === "manualPunch"
            ? renderAdminManualPunchSection(dashboard.datasets)
        : activeSection === "reports"
            ? renderAdminReportSection(dashboard.datasets)
        : activeSection === "system"
            ? renderAdminSystemSection(dashboard.datasets)
        : activeSection === "bells"
            ? renderAdminBellSection(dashboard.datasets)
            : renderAdminThemeSection(dashboard.datasets);

    return `
        <div class="workspace-shell">
            ${renderStatsGrid(dashboard.summary, {
                employeeCount: "員工數量",
                shiftCount: "班別數量",
                todayPunchCount: "今日正常打卡",
                todayAbnormalPunchCount: "今日異常打卡",
                bellScheduleCount: "響鈴場景",
                greetingCount: "問候語",
                customThemeCount: "自訂主題"
            })}
            ${renderSuggestions(dashboard.suggestions)}
            ${renderSectionTabs("admin", sections)}
            ${content}
        </div>
    `;
};

const originalHandleLoginSubmitWithSecurity = handleLoginSubmit;
handleLoginSubmit = async function handleLoginSubmitSecurityOverride(event) {
    event.preventDefault();
    setMessage(ui.loginMessage, "");
    ui.loginSubmitBtn.disabled = true;

    try {
        const result = await requestJson("/api/browser/login", {
            method: "POST",
            body: {
                role: state.activeRole,
                employeeId: ui.employeeIdInput.value.trim(),
                secret: ui.secretInput.value.trim(),
                deviceInfo: buildClientDeviceInfo()
            }
        });

        storeIssuedDeviceToken(result.deviceBinding?.issuedDeviceToken || "");
        state.token = result.token;
        sessionStorage.setItem("browserPortalToken", state.token);
        ui.loginView.classList.add("hidden");
        ui.dashboardView.classList.remove("hidden");
        renderDashboard(result.dashboard);
        initializeRealtimeSync();
        const loginMessage = result.deviceBinding?.newlyBound
            ? `登入成功，並已將目前裝置綁定為 ${result.deviceBinding.deviceName || "這台裝置"}。`
            : "登入成功。";
        setMessage(ui.dashboardMessage, loginMessage, "success");
    } catch (error) {
        setMessage(ui.loginMessage, error.message, "error");
    } finally {
        ui.loginSubmitBtn.disabled = false;
    }
};

handleEmployeePunch = async function handleEmployeePunchSecurityOverride() {
    try {
        const security = state.dashboard?.security || {};
        setMessage(ui.dashboardMessage, security.gpsRequiredOnPunch ? "正在取得 GPS 定位..." : "正在送出打卡...", "info");
        const location = security.gpsRequiredOnPunch ? await requestCurrentBrowserLocation() : null;
        const result = await requestJson("/api/browser/punch", {
            method: "POST",
            auth: true,
            body: { location }
        });
        renderDashboard(result.data.dashboard);
        setMessage(ui.dashboardMessage, result.message, result.message.includes("重複打卡") ? "info" : "success");
    } catch (error) {
        setMessage(ui.dashboardMessage, formatBrowserPunchError(error), "error");
    }
};

const originalGetRealtimeSyncLabelWithSecurity = getRealtimeSyncLabel;
getRealtimeSyncLabel = function getRealtimeSyncLabelSecurityOverride(type) {
    if (type === "securitySettings") return "遠端打卡安全設定";
    if (type === "employeeDevices") return "綁定裝置";
    return originalGetRealtimeSyncLabelWithSecurity(type);
};

const originalHandleRealtimeSyncMessageWithSecurity = handleRealtimeSyncMessage;
handleRealtimeSyncMessage = async function handleRealtimeSyncMessageSecurityOverride(payload) {
    const type = payload?.type;
    const role = state.dashboard?.role;
    if (!type || !role) return originalHandleRealtimeSyncMessageWithSecurity(payload);

    const adminSyncTypes = new Set([
        "employees",
        "shifts",
        "punchRecords",
        "displaySettings",
        "greetings",
        "bellSchedules",
        "bellHistory",
        "customSounds",
        "specialEffects",
        "themeSchedules",
        "customThemes",
        "securitySettings",
        "employeeDevices"
    ]);

    const employeeSyncTypes = new Set(["punchRecords", "displaySettings", "securitySettings", "employeeDevices"]);

    if ((role === "admin" && adminSyncTypes.has(type)) || (role === "employee" && employeeSyncTypes.has(type))) {
        await reloadDashboard(`已同步${getRealtimeSyncLabel(type)}最新內容。`, "info");
        return;
    }

    return originalHandleRealtimeSyncMessageWithSecurity(payload);
};

SAVE_FEEDBACK_FORM_IDS.add("security-settings-form");

const originalHandleDashboardClickWithSecurity = handleDashboardClick;
handleDashboardClick = async function handleDashboardClickSecurityOverride(event) {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) return originalHandleDashboardClickWithSecurity(event);

    const action = actionTarget.dataset.action;
    try {
        if (action === "delete-employee-device") {
            const employeeId = actionTarget.dataset.employeeId || "";
            const deviceId = actionTarget.dataset.deviceId || "";
            if (!window.confirm("確定要解除這台綁定裝置嗎？")) return;
            const result = await requestJson("/api/browser/admin/employee-device/delete", {
                method: "POST",
                auth: true,
                body: { employeeId, deviceId }
            });
            await reloadDashboard(result.message || "裝置綁定已解除。");
            setMessage(ui.dashboardMessage, result.message || "裝置綁定已解除。", "success");
            return;
        }

        if (action === "clear-employee-devices") {
            const employeeId = actionTarget.dataset.employeeId || "";
            if (!window.confirm("確定要清除該員工全部綁定裝置嗎？")) return;
            const result = await requestJson("/api/browser/admin/employee-devices/clear", {
                method: "POST",
                auth: true,
                body: { employeeId }
            });
            await reloadDashboard(result.message || "員工綁定裝置已全部清除。");
            setMessage(ui.dashboardMessage, result.message || "員工綁定裝置已全部清除。", "success");
            return;
        }
    } catch (error) {
        setMessage(ui.dashboardMessage, error.message, "error");
        return;
    }

    return originalHandleDashboardClickWithSecurity(event);
};

const originalHandleDashboardSubmitWithSecurity = handleDashboardSubmit;
handleDashboardSubmit = async function handleDashboardSubmitSecurityOverride(event) {
    const form = event.target instanceof HTMLFormElement
        ? event.target
        : event.target?.closest?.("form");
    const formId = form?.getAttribute?.("id") || "";

    if (formId !== "security-settings-form") {
        return originalHandleDashboardSubmitWithSecurity(event);
    }

    event.preventDefault();
    if (!form) return;

    const values = Object.fromEntries(new FormData(form).entries());
    const body = {
        deviceBindingEnabled: values.deviceBindingEnabled === "true",
        gpsRequiredOnPunch: values.gpsRequiredOnPunch === "true",
        maxGpsAccuracyMeters: Number(values.maxGpsAccuracyMeters) || 300
    };

    setFormMessage(formId, "");
    try {
        const result = await requestJson("/api/browser/admin/security-settings/save", {
            method: "POST",
            auth: true,
            body
        });
        await reloadDashboard(result.message || "遠端打卡安全設定已更新。");
        setMessage(ui.dashboardMessage, result.message || "遠端打卡安全設定已更新。", "success");
        setFormMessage(formId, result.message || "遠端打卡安全設定已更新。", "success");
    } catch (error) {
        setMessage(ui.dashboardMessage, error.message, "error");
        setFormMessage(formId, error.message, "error");
    }
};

const originalHandleDashboardClickWithCardCapture = handleDashboardClick;
handleDashboardClick = async function handleDashboardClickCardCaptureOverride(event) {
    if (event.target?.id === "employee-card-capture-input") {
        if (event.target.dataset.active !== "true") startEmployeeCardCapture();
        return;
    }

    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) return originalHandleDashboardClickWithCardCapture(event);

    const action = actionTarget.dataset.action;
    if (action === "start-card-capture") {
        startEmployeeCardCapture();
        return;
    }
    if (action === "clear-card-capture") {
        clearEmployeeCardCaptureResult();
        return;
    }

    return originalHandleDashboardClickWithCardCapture(event);
};

async function handleEmployeeCardCaptureKeydown(event) {
    if (event.target?.id !== "employee-card-capture-input") return;

    if (event.key === "Escape") {
        event.preventDefault();
        clearEmployeeCardCaptureResult();
        return;
    }

    if (event.key === "Enter" || event.key === "NumpadEnter" || event.key === "Tab") {
        event.preventDefault();
        await finishEmployeeCardCapture(event.target.value);
    }
}

function renderDeveloperImpersonationPanel(datasets = {}) {
    const settings = datasets.settings || {};
    const enabled = Boolean(settings.developerImpersonationEnabled);
    const employees = Array.isArray(datasets.employees) ? datasets.employees : [];
    const employeeOptions = renderOptions(employees, {
        labelFn: (employee) => `${employee.id} ${employee.name || ""} / ${employee.department || "未設定部門"}`
    });

    return `
            <article class="sub-panel developer-impersonation-panel">
                <div class="list-toolbar">
                    <div>
                        <p class="sub-kicker">開發人員身份切換</p>
                        <h3>測試身份切換</h3>
                    </div>
                    <div class="badge-row">
                        ${renderBadge(enabled ? "已啟用" : "已停用", enabled ? "success" : "danger")}
                    </div>
                </div>
                <p class="helper-text">只有已登入開發人員後才能使用。一般員工與管理者登入頁不會接受系統密碼作為替代密碼。</p>
                <form id="developer-impersonation-settings-form" class="stack-form dense-form">
                    <div class="field-grid dense-field-grid">
                        <label class="field">
                            <span>功能開關</span>
                            <select name="enabled">
                                <option value="true" ${enabled ? "selected" : ""}>啟用</option>
                                <option value="false" ${!enabled ? "selected" : ""}>停用</option>
                            </select>
                        </label>
                        <label class="field">
                            <span>系統密碼</span>
                            <input name="currentPassword" type="password" required>
                        </label>
                    </div>
                    <button class="primary-btn" type="submit">儲存開發人員身份切換設定</button>
                    <div class="inline-message" data-form-message-for="developer-impersonation-settings-form" aria-live="polite"></div>
                </form>
                <form id="developer-impersonation-form" class="stack-form dense-form">
                    <div class="field-grid dense-field-grid">
                        <label class="field">
                            <span>切換目標</span>
                            <select name="targetRole">
                                <option value="admin">管理者頁面</option>
                                <option value="employee">員工頁面</option>
                            </select>
                        </label>
                        <label class="field">
                            <span>指定員工</span>
                            <select name="targetEmployeeId">
                                <option value="">切換員工頁面時選擇</option>
                                ${employeeOptions}
                            </select>
                        </label>
                        <label class="field">
                            <span>系統密碼</span>
                            <input name="systemPassword" type="password" required>
                        </label>
                    </div>
                    <button class="secondary-btn" type="submit" ${enabled ? "" : "disabled"}>切換測試身份</button>
                    <div class="inline-message" data-form-message-for="developer-impersonation-form" aria-live="polite"></div>
                </form>
            </article>
    `;
}

function insertDeveloperImpersonationPanel(html, datasets) {
    const panel = renderDeveloperImpersonationPanel(datasets);
    const lastClosingDivIndex = String(html || "").lastIndexOf("</div>");
    if (lastClosingDivIndex === -1) return `${html}${panel}`;
    return `${html.slice(0, lastClosingDivIndex)}${panel}${html.slice(lastClosingDivIndex)}`;
}

const originalRenderDeveloperLogsSectionWithImpersonation = renderDeveloperLogsSection;
renderDeveloperLogsSection = function renderDeveloperLogsSectionImpersonationOverride(datasets) {
    return insertDeveloperImpersonationPanel(originalRenderDeveloperLogsSectionWithImpersonation(datasets), datasets);
};

function renderImpersonationBanner(dashboard) {
    const impersonation = dashboard?.impersonation;
    if (!impersonation?.active) return "";
    const activeLabel = impersonation.activeRole === "admin"
        ? "管理者"
        : `員工 ${impersonation.targetEmployeeId || impersonation.activeEmployeeId || ""} ${impersonation.targetEmployeeName || ""}`.trim();
    const realLabel = `${impersonation.realEmployeeId || ""} ${impersonation.realEmployeeName || ""}`.trim() || "開發人員";
    return `
        <div class="impersonation-banner" role="status">
            <div>
                <strong>開發人員模式</strong>
                <span>目前正在以 ${escapeHtml(activeLabel)} 身份測試，實際登入者：${escapeHtml(realLabel)}</span>
            </div>
            <button class="outline-btn" type="button" data-action="stop-developer-impersonation">返回開發人員頁面</button>
        </div>
    `;
}

const originalRenderDashboardWithImpersonation = renderDashboard;
renderDashboard = function renderDashboardImpersonationOverride(dashboard) {
    originalRenderDashboardWithImpersonation(dashboard);
    const banner = renderImpersonationBanner(dashboard);
    if (banner) {
        ui.dashboardContent.insertAdjacentHTML("afterbegin", banner);
    }
};

SAVE_FEEDBACK_FORM_IDS.add("developer-impersonation-settings-form");
SAVE_FEEDBACK_FORM_IDS.add("developer-impersonation-form");

const originalHandleDashboardSubmitWithImpersonation = handleDashboardSubmit;
handleDashboardSubmit = async function handleDashboardSubmitImpersonationOverride(event) {
    const form = event.target instanceof HTMLFormElement
        ? event.target
        : event.target?.closest?.("form");
    const formId = form?.getAttribute?.("id") || "";

    if (formId !== "developer-impersonation-settings-form" && formId !== "developer-impersonation-form") {
        return originalHandleDashboardSubmitWithImpersonation(event);
    }

    event.preventDefault();
    setFormSubmittingState(form, true);
    setFormMessage(formId, "");

    try {
        const values = Object.fromEntries(new FormData(form).entries());
        if (formId === "developer-impersonation-settings-form") {
            const result = await requestJson("/api/browser/developer/impersonation/settings", {
                method: "POST",
                auth: true,
                body: {
                    enabled: values.enabled === "true",
                    currentPassword: values.currentPassword || ""
                }
            });
            renderDashboard(result.dashboard);
            setMessage(ui.dashboardMessage, result.message || "開發人員身份切換設定已更新。", "success");
            return;
        }

        if (values.targetRole === "employee" && !String(values.targetEmployeeId || "").trim()) {
            throw new Error("切換員工頁面時請先選擇指定員工。");
        }

        const result = await requestJson("/api/browser/developer/impersonation/start", {
            method: "POST",
            auth: true,
            body: {
                targetRole: values.targetRole,
                targetEmployeeId: values.targetEmployeeId || "",
                systemPassword: values.systemPassword || ""
            }
        });
        renderDashboard(result.dashboard);
        setMessage(ui.dashboardMessage, result.message || "已切換測試身份。", "success");
    } catch (error) {
        setMessage(ui.dashboardMessage, error.message, "error");
        setFormMessage(formId, error.message, "error");
    } finally {
        setFormSubmittingState(form, false);
    }
};

const originalHandleDashboardClickWithImpersonation = handleDashboardClick;
handleDashboardClick = async function handleDashboardClickImpersonationOverride(event) {
    const actionTarget = event.target.closest("[data-action]");
    if (actionTarget?.dataset.action !== "stop-developer-impersonation") {
        return originalHandleDashboardClickWithImpersonation(event);
    }

    try {
        const result = await requestJson("/api/browser/developer/impersonation/stop", {
            method: "POST",
            auth: true
        });
        renderDashboard(result.dashboard);
        setMessage(ui.dashboardMessage, result.message || "已返回開發人員頁面。", "success");
    } catch (error) {
        setMessage(ui.dashboardMessage, error.message, "error");
    }
};

function prepareDeveloperAuditState(datasets = {}) {
    const defaults = createDefaultDeveloperAuditState();
    const auditState = ensureDeveloperAuditState();
    const defaultLimit = String(Number(datasets.auditLogSummary?.defaultLimit || defaults.filters.limit) || 100);

    if (!auditState.queried) {
        state.developerAudit = {
            ...auditState,
            filters: {
                ...defaults.filters,
                limit: defaultLimit
            },
            logs: Array.isArray(datasets.auditLogs) ? datasets.auditLogs : [],
            total: Number(datasets.auditLogSummary?.total || 0),
            queried: false
        };
    } else {
        state.developerAudit = {
            ...auditState,
            filters: {
                ...defaults.filters,
                ...auditState.filters,
                limit: String(auditState.filters.limit || defaultLimit)
            }
        };
    }

    return {
        auditState: ensureDeveloperAuditState(),
        defaultLimit
    };
}

function renderDeveloperAutomationLogSection(datasets = {}) {
    return `
        <div class="workspace-stack">
            <article class="sub-panel">
                <div class="list-toolbar">
                    <h3>自動化日誌</h3>
                    <button class="danger-btn" type="button" data-action="clear-automation-log">清除日誌</button>
                </div>
                ${renderAutomationLogs(datasets.automationLog || [])}
            </article>
        </div>
    `;
}

function renderDeveloperSystemPasswordPanel() {
    return `
        <article class="sub-panel">
            <h3>變更系統密碼</h3>
            <form id="system-password-form" class="stack-form dense-form">
                <div class="field-grid dense-field-grid">
                    <label class="field"><span>目前系統密碼</span><input name="currentPassword" type="password" required></label>
                    <label class="field"><span>新的系統密碼</span><input name="newPassword" type="password" required></label>
                </div>
                <button class="primary-btn" type="submit">儲存新密碼</button>
                <div class="inline-message" data-form-message-for="system-password-form" aria-live="polite"></div>
            </form>
        </article>
    `;
}

function getSelectedWorkspaceNavOrderRole(navState = getWorkspaceNavOrderState()) {
    const roles = getWorkspaceNavRoleDefinitions(navState);
    const roleIds = new Set(roles.map((role) => role.id));
    if (!roleIds.has(state.workspaceNavOrderRole)) {
        state.workspaceNavOrderRole = roles[0]?.id || "admin";
    }
    return state.workspaceNavOrderRole;
}

function getWorkspaceNavRoleDefinition(roleId, navState = getWorkspaceNavOrderState()) {
    return getWorkspaceNavRoleDefinitions(navState).find((role) => role.id === roleId)
        || WORKSPACE_NAV_ROLE_FALLBACKS.find((role) => role.id === roleId)
        || WORKSPACE_NAV_ROLE_FALLBACKS[0];
}

function getOrderedWorkspaceNavSectionsForEditor(roleDefinition, navState = getWorkspaceNavOrderState()) {
    const sections = Array.isArray(roleDefinition?.sections) ? roleDefinition.sections : [];
    const order = navState?.orders?.[roleDefinition?.id]?.order || sections.map((section) => section.id);
    const orderMap = new Map(order.map((sectionId, index) => [sectionId, index]));
    return [...sections].sort((a, b) => {
        const aIndex = orderMap.has(a.id) ? orderMap.get(a.id) : Number.MAX_SAFE_INTEGER;
        const bIndex = orderMap.has(b.id) ? orderMap.get(b.id) : Number.MAX_SAFE_INTEGER;
        if (aIndex !== bIndex) return aIndex - bIndex;
        return sections.indexOf(a) - sections.indexOf(b);
    });
}

function renderDeveloperWorkspaceNavOrderPanel(datasets = {}) {
    const navState = getWorkspaceNavOrderState({ ...state.dashboard, datasets });
    if (!navState.canManage) return "";

    const roles = getWorkspaceNavRoleDefinitions(navState);
    const selectedRole = getSelectedWorkspaceNavOrderRole(navState);
    const roleDefinition = getWorkspaceNavRoleDefinition(selectedRole, navState);
    const orderRecord = navState.orders?.[selectedRole] || {};
    const orderedSections = getOrderedWorkspaceNavSectionsForEditor(roleDefinition, navState);
    const sourceLabel = orderRecord.source === "custom" ? "自訂排序" : "預設排序";
    const updatedText = orderRecord.updatedAt
        ? new Date(orderRecord.updatedAt).toLocaleString("zh-TW", { hour12: false })
        : "尚未修改";

    return `
        <article class="sub-panel workspace-nav-order-panel">
            <div class="list-toolbar">
                <div>
                    <p class="sub-kicker">全域介面設定</p>
                    <h3>主功能頁籤排序</h3>
                    <p class="helper-text">開發者在這裡選擇要管理的工作台，儲存後會套用到該角色的上方主功能頁籤列。</p>
                </div>
                <div class="badge-row">
                    ${renderBadge(sourceLabel, orderRecord.source === "custom" ? "success" : "info")}
                    ${renderBadge(`${orderedSections.length} 個頁籤`)}
                </div>
            </div>
            <form id="workspace-nav-order-form" class="stack-form dense-form" data-role="${escapeHtml(selectedRole)}">
                <div class="field-grid dense-field-grid workspace-nav-order-meta">
                    <label class="field">
                        <span>目標工作台</span>
                        <select id="workspace-nav-order-role" name="role">
                            ${roles.map((role) => `
                                <option value="${escapeHtml(role.id)}" ${role.id === selectedRole ? "selected" : ""}>${escapeHtml(role.label || role.id)}</option>
                            `).join("")}
                        </select>
                    </label>
                    <label class="field">
                        <span>最後更新</span>
                        <input type="text" value="${escapeHtml(updatedText)}" readonly>
                    </label>
                </div>
                <div class="workspace-nav-order-list" data-workspace-nav-order-list>
                    ${orderedSections.map((section, index) => `
                        <div class="workspace-nav-order-item" draggable="true" data-workspace-nav-order-item data-section-id="${escapeHtml(section.id)}">
                            <input type="hidden" name="order" value="${escapeHtml(section.id)}">
                            <span class="workspace-nav-order-index">${index + 1}</span>
                            <span class="workspace-nav-order-label">${escapeHtml(section.label || section.id)}</span>
                            <span class="workspace-nav-order-id">${escapeHtml(section.id)}</span>
                            <div class="workspace-nav-order-actions">
                                <button class="mini-btn" type="button" data-action="move-workspace-nav-item" data-direction="up" aria-label="上移 ${escapeHtml(section.label || section.id)}">上移</button>
                                <button class="mini-btn" type="button" data-action="move-workspace-nav-item" data-direction="down" aria-label="下移 ${escapeHtml(section.label || section.id)}">下移</button>
                            </div>
                        </div>
                    `).join("")}
                </div>
                <div class="form-toolbar">
                    <div class="inline-actions">
                        <button class="primary-btn" type="submit">儲存排序</button>
                        <button class="outline-btn" type="button" data-action="reset-workspace-nav-order">還原預設</button>
                    </div>
                </div>
                <div class="inline-message" data-form-message-for="workspace-nav-order-form" aria-live="polite"></div>
            </form>
        </article>
    `;
}

function renderDeveloperSystemSettingsSection(datasets = {}) {
    return `
        <div class="workspace-stack developer-system-settings">
            ${renderDeveloperSystemPasswordPanel()}
            ${renderDeveloperImpersonationPanel(datasets)}
            ${renderDeveloperWorkspaceNavOrderPanel(datasets)}
        </div>
    `;
}

function renderDeveloperAuditSection(datasets = {}) {
    const { auditState: currentAuditState, defaultLimit } = prepareDeveloperAuditState(datasets);
    const auditSummaryText = currentAuditState.queried
        ? `查詢結果 ${currentAuditState.total} 筆，目前顯示 ${currentAuditState.logs.length} 筆。`
        : `目前顯示最近 ${currentAuditState.logs.length} 筆，共 ${currentAuditState.total} 筆。`;

    return `
        <div class="workspace-stack">
            <article class="sub-panel">
                <div class="list-toolbar">
                    <div>
                        <h3>操作稽核紀錄</h3>
                        <p class="helper-text">查詢登入、設定變更、資料異動與瀏覽器操作紀錄。</p>
                    </div>
                    <div class="badge-row">
                        ${renderBadge(`總計 ${currentAuditState.total}`)}
                        ${renderBadge(`顯示 ${currentAuditState.logs.length}`)}
                    </div>
                </div>
                <form id="audit-log-query-form" class="stack-form dense-form">
                    <div class="field-grid audit-log-grid dense-field-grid">
                        <label class="field">
                            <span>開始日期</span>
                            <input name="startDate" type="date" value="${escapeHtml(currentAuditState.filters.startDate || "")}">
                        </label>
                        <label class="field">
                            <span>結束日期</span>
                            <input name="endDate" type="date" value="${escapeHtml(currentAuditState.filters.endDate || "")}">
                        </label>
                        <label class="field">
                            <span>操作者</span>
                            <input name="actorId" type="text" value="${escapeHtml(currentAuditState.filters.actorId || "")}" placeholder="例如 A001">
                        </label>
                        <label class="field">
                            <span>角色</span>
                            <select name="role">
                                <option value="">全部</option>
                                ${Object.entries(auditRoleLabels).map(([value, label]) => `
                                    <option value="${escapeHtml(value)}" ${currentAuditState.filters.role === value ? "selected" : ""}>${escapeHtml(label)}</option>
                                `).join("")}
                            </select>
                        </label>
                        <label class="field">
                            <span>動作</span>
                            <select name="action">
                                <option value="">全部</option>
                                ${Object.entries(auditActionLabels).map(([value, label]) => `
                                    <option value="${escapeHtml(value)}" ${currentAuditState.filters.action === value ? "selected" : ""}>${escapeHtml(label)}</option>
                                `).join("")}
                            </select>
                        </label>
                        <label class="field">
                            <span>資料類型</span>
                            <select name="targetType">
                                <option value="">全部</option>
                                ${Object.entries(auditTargetTypeLabels).map(([value, label]) => `
                                    <option value="${escapeHtml(value)}" ${currentAuditState.filters.targetType === value ? "selected" : ""}>${escapeHtml(label)}</option>
                                `).join("")}
                            </select>
                        </label>
                        <label class="field">
                            <span>結果</span>
                            <select name="success">
                                <option value="">全部</option>
                                <option value="true" ${currentAuditState.filters.success === "true" ? "selected" : ""}>成功</option>
                                <option value="false" ${currentAuditState.filters.success === "false" ? "selected" : ""}>失敗</option>
                            </select>
                        </label>
                        <label class="field">
                            <span>關鍵字</span>
                            <input name="query" type="text" value="${escapeHtml(currentAuditState.filters.query || "")}" placeholder="摘要 / 目標 / Session">
                        </label>
                        <label class="field">
                            <span>筆數</span>
                            <select name="limit">
                                ${["50", "100", "150", "200"].map((value) => `
                                    <option value="${value}" ${String(currentAuditState.filters.limit || defaultLimit) === value ? "selected" : ""}>${value}</option>
                                `).join("")}
                            </select>
                        </label>
                    </div>
                    <div class="form-toolbar dense-toolbar">
                        <div class="inline-actions">
                            <button class="primary-btn" type="submit">查詢紀錄</button>
                            <button class="outline-btn" type="button" data-action="filter-punch-failure-audit">只看打卡失敗</button>
                            <button class="outline-btn" type="button" data-action="filter-card-reader-audit">只看讀卡測試</button>
                            <button class="outline-btn" type="button" data-action="reset-audit-log-query">還原最近紀錄</button>
                        </div>
                        <p class="helper-text audit-log-summary">${escapeHtml(auditSummaryText)}</p>
                    </div>
                    <div class="inline-message" data-form-message-for="audit-log-query-form" aria-live="polite"></div>
                </form>
                <div class="audit-log-scroll">
                    ${renderAuditLogs(currentAuditState.logs)}
                </div>
            </article>
        </div>
    `;
}

renderDeveloperLogsSection = function renderDeveloperLogsSectionAutomationOnlyOverride(datasets) {
    return renderDeveloperAutomationLogSection(datasets);
};

renderDeveloperDashboard = function renderDeveloperDashboardSeparatedSections(dashboard) {
    const sections = [
        { id: "automation", label: "自動化任務" },
        { id: "automationLogs", label: "自動化日誌" },
        { id: "auditLogs", label: "操作稽核紀錄" },
        { id: "systemSettings", label: "系統設定" },
        { id: "export", label: "匯出設定" },
        { id: "status", label: "系統狀態" }
    ];

    if (state.activeSections.developer === "logs") {
        state.activeSections.developer = "automationLogs";
    }

    const activeSection = state.activeSections.developer;
    const content = activeSection === "automation"
        ? renderDeveloperAutomationSection(dashboard.datasets)
        : activeSection === "automationLogs"
            ? renderDeveloperAutomationLogSection(dashboard.datasets)
        : activeSection === "auditLogs"
            ? renderDeveloperAuditSection(dashboard.datasets)
        : activeSection === "systemSettings"
            ? renderDeveloperSystemSettingsSection(dashboard.datasets)
        : activeSection === "export"
            ? renderDeveloperExportSection(dashboard.datasets)
            : renderDeveloperStatusSection(dashboard.datasets);

    return `
        <div class="workspace-shell">
            ${renderStatsGrid(dashboard.summary, {
                automationTaskCount: "自動化任務",
                enabledTaskCount: "啟用任務",
                automationLogCount: "自動化日誌",
                activeSessionCount: "瀏覽器 Session"
            })}
            ${renderSectionTabs("developer", sections)}
            ${content}
        </div>
    `;
};

renderAdminDashboard = function renderAdminDashboardHelpModalOverride(dashboard) {
    const sections = [
        { id: "people", label: "人員資料" },
        { id: "security", label: "安全設定" },
        { id: "shifts", label: "班別設定" },
        { id: "manualPunch", label: "手動補登" },
        { id: "reports", label: "考勤報表" },
        { id: "system", label: "系統設定" },
        { id: "bells", label: "響鈴設定" },
        { id: "themes", label: "主題特效" }
    ];

    const activeSection = state.activeSections.admin;
    const content = activeSection === "people"
        ? renderAdminPeopleSection(dashboard.datasets)
        : activeSection === "security"
            ? renderAdminSecuritySection(dashboard.datasets)
        : activeSection === "shifts"
            ? renderAdminShiftSection(dashboard.datasets)
        : activeSection === "manualPunch"
            ? renderAdminManualPunchSection(dashboard.datasets)
        : activeSection === "reports"
            ? renderAdminReportSection(dashboard.datasets)
        : activeSection === "system"
            ? renderAdminSystemSection(dashboard.datasets)
        : activeSection === "bells"
            ? renderAdminBellSection(dashboard.datasets)
            : renderAdminThemeSection(dashboard.datasets);
    const statModel = buildAdminDashboardStatModel(dashboard);

    return `
        <div class="workspace-shell">
            ${renderStatsGrid(statModel.summary, {
                employeeCount: "員工數量",
                shiftCount: "班別數量",
                todayPunchCount: "今日正常打卡",
                todayAbnormalPunchCount: "今日異常打卡",
                bellScheduleCount: "響鈴排程",
                greetingCount: "問候語",
                customThemeCount: "自訂主題"
            }, {
                clickableKeys: statModel.clickableKeys,
                subtitles: statModel.subtitles
            })}
            ${renderSectionTabs("admin", sections)}
            ${content}
        </div>
    `;
};

const leaveStatusBadgeTypes = {
    pending_supervisor: "warning",
    pending_admin: "warning",
    approved: "success",
    rejected: "danger",
    withdrawn: "",
    cancelled: ""
};

function getLeaveStatusBadge(request) {
    return renderBadge(request.statusText || request.status || "-", leaveStatusBadgeTypes[request.status] || "");
}

function renderLeaveTypeOptions(leaveTypes = [], selectedId = "") {
    return leaveTypes
        .filter((type) => type.enabled !== false)
        .map((type) => `<option value="${escapeHtml(type.id)}" ${type.id === selectedId ? "selected" : ""}>${escapeHtml(type.name)}</option>`)
        .join("");
}

function renderEmployeeLeaveRequestRows(requests = [], { showEmployee = false, reviewMode = "" } = {}) {
    if (!requests.length) return renderEmptyState("目前沒有請假資料。");
    return `
        <div class="data-table-wrap">
            <table class="data-table">
                <thead>
                    <tr>
                        ${showEmployee ? "<th>員工</th>" : ""}
                        <th>假別</th>
                        <th>起始</th>
                        <th>結束</th>
                        <th>時數</th>
                        <th>狀態</th>
                        <th>理由</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${requests.map((request) => `
                        <tr>
                            ${showEmployee ? `<td>${escapeHtml(`${request.employeeId || "-"} / ${request.employeeName || "-"}`)}</td>` : ""}
                            <td>${escapeHtml(request.leaveTypeName || "-")}</td>
                            <td>${escapeHtml(request.startText || "-")}</td>
                            <td>${escapeHtml(request.endText || "-")}</td>
                            <td>${escapeHtml(request.duration_hours ?? "-")}</td>
                            <td>${getLeaveStatusBadge(request)}</td>
                            <td class="multiline-cell">${escapeHtml(request.reason || "-")}</td>
                            <td class="actions ${reviewMode ? "has-review-comment" : ""}">
                                <div class="${reviewMode ? "review-action-stack" : "table-actions"}">
                                    ${reviewMode ? `
                                        <input class="review-comment-input" type="text" placeholder="審核備註（選填）" data-leave-review-comment>
                                    ` : ""}
                                    <div class="table-actions">
                                    ${reviewMode === "supervisor" ? `
                                        <button class="mini-btn" type="button" data-action="leave-supervisor-decision" data-id="${escapeHtml(request.id)}" data-decision="approved">核准</button>
                                        <button class="mini-btn" type="button" data-action="leave-supervisor-decision" data-id="${escapeHtml(request.id)}" data-decision="rejected">駁回</button>
                                    ` : ""}
                                    ${reviewMode === "admin" ? `
                                        <button class="mini-btn" type="button" data-action="leave-admin-decision" data-id="${escapeHtml(request.id)}" data-decision="approved">終審核准</button>
                                        <button class="mini-btn" type="button" data-action="leave-admin-decision" data-id="${escapeHtml(request.id)}" data-decision="rejected">終審駁回</button>
                                    ` : ""}
                                    ${!reviewMode && ["pending_supervisor", "pending_admin"].includes(request.status) ? `
                                        <button class="mini-btn" type="button" data-action="leave-withdraw" data-id="${escapeHtml(request.id)}">撤回</button>
                                    ` : ""}
                                    </div>
                                </div>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

function renderEmployeeLeaveModule(dashboard) {
    const leave = dashboard.leave || {};
    const leaveTypes = leave.leaveTypes || [];
    const today = formatDateInputValue(new Date());
    return `
        <article class="workspace-card" style="grid-column: 1 / -1;">
            <div class="list-toolbar">
                <div>
                    <h3>請假申請</h3>
                    <p class="helper-text">送出後會先交由部門主管審核，主管核准後再由管理部終審，終審核准才會生效。</p>
                </div>
                ${renderBadge(`可用假別 ${leaveTypes.length} 種`, "success")}
            </div>
            <form id="employee-leave-form" class="stack-form">
                <div class="field-grid dense-form">
                    <label class="field">
                        <span>假別</span>
                        <select name="leaveTypeId" required>${renderLeaveTypeOptions(leaveTypes)}</select>
                    </label>
                    <label class="field">
                        <span>開始日期</span>
                        <input name="startDate" type="date" value="${today}" required>
                    </label>
                    <label class="field">
                        <span>開始時間</span>
                        <input name="startTime" type="time" value="09:00" required>
                    </label>
                    <label class="field">
                        <span>結束日期</span>
                        <input name="endDate" type="date" value="${today}" required>
                    </label>
                    <label class="field">
                        <span>結束時間</span>
                        <input name="endTime" type="time" value="18:00" required>
                    </label>
                    <label class="field">
                        <span>請假時數</span>
                        <input name="durationHours" type="number" min="0.5" step="0.5" placeholder="未填則用時間差估算">
                    </label>
                    <label class="field span-2">
                        <span>請假原因</span>
                        <textarea name="reason" rows="3" placeholder="請簡述請假原因"></textarea>
                    </label>
                </div>
                <div class="form-toolbar dense-toolbar">
                    <button class="primary-btn" type="submit">送出請假申請</button>
                    <p class="helper-text">第一版先保留附件欄位的資料結構準備，實際附件上傳會在後續階段加入。</p>
                </div>
                <div class="inline-message" data-form-message-for="employee-leave-form" aria-live="polite"></div>
            </form>
        </article>

        ${leave.supervisorQueue?.length ? `
            <article class="table-card" style="grid-column: 1 / -1;">
                <div class="list-toolbar">
                    <div>
                        <h3>待我審核</h3>
                        <p class="helper-text">這裡只顯示被設定為你負責審核的員工請假單。</p>
                    </div>
                    ${renderBadge(`${leave.supervisorQueue.length} 筆待審`, "warning")}
                </div>
                ${renderEmployeeLeaveRequestRows(leave.supervisorQueue, { showEmployee: true, reviewMode: "supervisor" })}
            </article>
        ` : ""}

        <article class="table-card" style="grid-column: 1 / -1;">
            <div class="list-toolbar">
                <div>
                    <h3>我的請假紀錄</h3>
                    <p class="helper-text">主管與管理部的審核狀態會即時顯示在這裡。</p>
                </div>
                ${renderBadge(`${leave.myRequests?.length || 0} 筆`)}
            </div>
            ${renderEmployeeLeaveRequestRows(leave.myRequests || [])}
        </article>
    `;
}

function renderAdminLeaveTypeRows(leaveTypes = []) {
    const rows = [...leaveTypes, { id: "", name: "", description: "", unit: "hour", display_order: (leaveTypes.length + 1) * 10, enabled: true }];
    return rows.map((type) => `
        <div class="field-grid leave-type-row dense-form">
            <label class="field"><span>識別</span><input name="id" value="${escapeHtml(type.id || "")}" placeholder="例如 annual"></label>
            <label class="field"><span>假別名稱</span><input name="name" value="${escapeHtml(type.name || "")}" placeholder="例如 特休"></label>
            <label class="field"><span>單位</span><select name="unit">
                <option value="hour" ${type.unit === "hour" ? "selected" : ""}>小時</option>
                <option value="day" ${type.unit === "day" ? "selected" : ""}>天</option>
                <option value="half_day" ${type.unit === "half_day" ? "selected" : ""}>半日</option>
            </select></label>
            <label class="field"><span>排序</span><input name="display_order" type="number" value="${escapeHtml(type.display_order ?? type.displayOrder ?? "")}"></label>
            <label class="switch-line"><input name="enabled" type="checkbox" ${type.enabled !== false ? "checked" : ""}>啟用</label>
            <label class="switch-line"><input name="paid" type="checkbox" ${type.paid ? "checked" : ""}>有薪</label>
            <label class="switch-line"><input name="deducts_balance" type="checkbox" ${type.deducts_balance || type.deductsBalance ? "checked" : ""}>扣額度</label>
            <label class="switch-line"><input name="requires_attachment" type="checkbox" ${type.requires_attachment || type.requiresAttachment ? "checked" : ""}>需附件</label>
            <label class="field span-2"><span>說明</span><input name="description" value="${escapeHtml(type.description || "")}" placeholder="假別規則與備註"></label>
        </div>
    `).join("");
}

function renderAdminLeaveTypeEditorRows(leaveTypes = []) {
    const existingRows = Array.isArray(leaveTypes) ? leaveTypes : [];
    const newRow = {
        id: "",
        name: "",
        description: "",
        unit: "hour",
        display_order: (existingRows.length + 1) * 10,
        enabled: true,
        isNew: true
    };
    const rows = [...existingRows, newRow];
    const activeIndex = existingRows.length ? 0 : rows.length - 1;
    const getRowId = (index) => `leave-type-editor-row-${index}`;
    const renderEditorTab = (type, index, { isNew = false } = {}) => {
        const rowId = getRowId(index);
        const label = isNew ? "新增假別" : String(type.name || type.id || `假別 ${index + 1}`);
        const isActive = index === activeIndex;
        return `
            <button class="outline-btn leave-type-tab ${isActive ? "is-active" : ""} ${isNew && existingRows.length ? "hidden" : ""}" type="button" data-action="select-leave-type-editor" data-target="${escapeHtml(rowId)}" ${isNew ? "data-new-tab=\"true\"" : ""} aria-pressed="${isActive ? "true" : "false"}">
                ${escapeHtml(label)}
            </button>
        `;
    };
    const renderEditorPanel = (type, index) => {
        const rowId = getRowId(index);
        const isNew = Boolean(type.isNew);
        const isActive = index === activeIndex;
        return `
            <div id="${escapeHtml(rowId)}" class="leave-type-row leave-type-editor-panel dense-form ${isActive ? "is-active" : "hidden"}" data-leave-type-panel ${isNew ? "data-new-row=\"true\"" : ""}>
                <div class="leave-type-primary-row">
                    <label class="field"><span>假別代碼</span><input name="id" value="${escapeHtml(type.id || "")}" placeholder="例如 annual"></label>
                    <label class="field"><span>假別名稱</span><input name="name" value="${escapeHtml(type.name || "")}" placeholder="例如 特休"></label>
                    <label class="field"><span>單位</span><select name="unit">
                        <option value="hour" ${type.unit === "hour" ? "selected" : ""}>小時</option>
                        <option value="day" ${type.unit === "day" ? "selected" : ""}>天</option>
                        <option value="half_day" ${type.unit === "half_day" ? "selected" : ""}>半天</option>
                    </select></label>
                    <label class="field"><span>顯示順序</span><input name="display_order" type="number" value="${escapeHtml(type.display_order ?? type.displayOrder ?? "")}"></label>
                </div>
                <div class="leave-type-switch-row">
                    <label class="switch-line"><input name="enabled" type="checkbox" ${type.enabled !== false ? "checked" : ""}>啟用</label>
                    <label class="switch-line"><input name="paid" type="checkbox" ${type.paid ? "checked" : ""}>有薪</label>
                    <label class="switch-line"><input name="deducts_balance" type="checkbox" ${type.deducts_balance || type.deductsBalance ? "checked" : ""}>扣額度</label>
                    <label class="switch-line"><input name="requires_attachment" type="checkbox" ${type.requires_attachment || type.requiresAttachment ? "checked" : ""}>需附件</label>
                </div>
                <label class="field leave-type-description-row"><span>說明與備註</span><textarea name="description" rows="3" placeholder="假別規則與備註">${escapeHtml(type.description || "")}</textarea></label>
            </div>
        `;
    };
    return `
        <div class="leave-type-editor">
            <div class="leave-type-tabbar" role="list" aria-label="假別清單">
                ${existingRows.map((type, index) => renderEditorTab(type, index)).join("")}
                <button class="secondary-btn leave-type-add-btn ${existingRows.length ? "" : "is-active"}" type="button" data-action="add-leave-type-editor" data-target="${escapeHtml(getRowId(rows.length - 1))}" aria-pressed="${existingRows.length ? "false" : "true"}">新增假別</button>
            </div>
            <div class="leave-type-editor-panels">
                ${rows.map((type, index) => renderEditorPanel(type, index)).join("")}
            </div>
        </div>
    `;
}

function renderAdminLeaveRouteRows(routes = [], employees = []) {
    const rows = [...routes, { department: "", supervisor_id: "", enabled: true }];
    const employeeOptions = (selectedId = "") => employees.map((employee) => `
        <option value="${escapeHtml(employee.id)}" ${employee.id === selectedId ? "selected" : ""}>${escapeHtml(employee.id)} / ${escapeHtml(employee.name || "-")} / ${escapeHtml(employee.department || "-")}</option>
    `).join("");
    return rows.map((route) => `
        <div class="field-grid three leave-route-row dense-form">
            <input type="hidden" name="id" value="${escapeHtml(route.id || "")}">
            <label class="field"><span>部門</span><input name="department" value="${escapeHtml(route.department || "")}" placeholder="部門名稱，或 * 作為預設"></label>
            <label class="field"><span>主管</span><select name="supervisor_id"><option value="">選擇主管</option>${employeeOptions(route.supervisor_id || route.supervisorId || "")}</select></label>
            <label class="switch-line"><input name="enabled" type="checkbox" ${route.enabled !== false ? "checked" : ""}>啟用</label>
        </div>
    `).join("");
}

function renderAdminLeaveSection(datasets) {
    const leave = datasets.leave || {};
    return `
        <div class="workspace-stack">
            <article class="workspace-card">
                <div class="list-toolbar">
                    <div>
                        <p class="sub-kicker">管理者工作台</p>
                        <h3>請假管理</h3>
                    </div>
                    <div class="badge-row">
                        ${renderBadge(`管理部待審 ${leave.pendingAdmin?.length || 0} 筆`, leave.pendingAdmin?.length ? "warning" : "success")}
                        ${renderBadge(`全部請假 ${leave.requests?.length || 0} 筆`)}
                    </div>
                </div>
                <p class="helper-text">請假流程採「員工送出 → 部門主管審核 → 管理部終審」；只有終審核准後才視為生效。</p>
            </article>

            <article class="table-card">
                <div class="list-toolbar">
                    <div>
                        <h3>管理部待複核</h3>
                        <p class="helper-text">主管核准後的請假單會進入這裡，由管理者最後核准或駁回。</p>
                    </div>
                </div>
                ${renderEmployeeLeaveRequestRows(leave.pendingAdmin || [], { showEmployee: true, reviewMode: "admin" })}
            </article>

            <article class="table-card">
                <div class="list-toolbar">
                    <div>
                        <h3>請假紀錄</h3>
                        <p class="helper-text">顯示最近 200 筆請假申請與審核狀態。</p>
                    </div>
                </div>
                ${renderEmployeeLeaveRequestRows(leave.requests || [], { showEmployee: true })}
            </article>

            <article class="sub-panel">
                <div class="list-toolbar">
                    <div>
                        <h3>假別設定</h3>
                        <p class="helper-text">假別、是否有薪、是否扣額度、是否需要附件都保留成可調整設定。</p>
                    </div>
                </div>
                <form id="admin-leave-types-form" class="stack-form">
                    ${renderAdminLeaveTypeEditorRows(leave.leaveTypes || [])}
                    <div class="form-toolbar dense-toolbar">
                        <button class="primary-btn" type="submit">儲存假別設定</button>
                    </div>
                    <div class="inline-message" data-form-message-for="admin-leave-types-form" aria-live="polite"></div>
                </form>
            </article>

            <article class="sub-panel">
                <div class="list-toolbar">
                    <div>
                        <h3>主管審核路徑</h3>
                        <p class="helper-text">每個部門可指定一位主管；可用 * 當預設路徑。主管仍以員工身份登入，不會變成管理者。</p>
                    </div>
                </div>
                <form id="admin-leave-routes-form" class="stack-form">
                    ${renderAdminLeaveRouteRows(leave.approvalRoutes || [], datasets.employees || [])}
                    <div class="form-toolbar dense-toolbar">
                        <button class="primary-btn" type="submit">儲存審核路徑</button>
                    </div>
                    <div class="inline-message" data-form-message-for="admin-leave-routes-form" aria-live="polite"></div>
                </form>
            </article>
        </div>
    `;
}

const originalRenderEmployeeDashboardWithLeave = renderEmployeeDashboard;
renderEmployeeDashboard = function renderEmployeeDashboardLeaveOverride(dashboard) {
    const baseHtml = originalRenderEmployeeDashboardWithLeave(dashboard);
    if (!dashboard?.leave) return baseHtml;
    const leaveHtml = renderEmployeeLeaveModule(dashboard);
    const closingIndex = baseHtml.lastIndexOf("</div>");
    if (closingIndex === -1) return `${baseHtml}${leaveHtml}`;
    return `${baseHtml.slice(0, closingIndex)}${leaveHtml}${baseHtml.slice(closingIndex)}`;
};

function renderEmployeeLeaveApplicationPanel(dashboard) {
    const leave = dashboard.leave || {};
    const leaveTypes = leave.leaveTypes || [];
    const today = formatDateInputValue(new Date());
    return `
        <article class="workspace-card employee-workbench-panel" data-no-collapsible="true">
            <div class="list-toolbar">
                <div>
                    <h3>請假申請</h3>
                    <p class="helper-text">填寫假別、時間與原因後送出申請。</p>
                </div>
                ${renderBadge(`可用假別 ${leaveTypes.length} 種`, "success")}
            </div>
            <form id="employee-leave-form" class="stack-form">
                <div class="field-grid dense-form">
                    <label class="field">
                        <span>假別</span>
                        <select name="leaveTypeId" required>${renderLeaveTypeOptions(leaveTypes)}</select>
                    </label>
                    <label class="field">
                        <span>開始日期</span>
                        <input name="startDate" type="date" value="${today}" required>
                    </label>
                    <label class="field">
                        <span>開始時間</span>
                        <input name="startTime" type="time" value="09:00" required>
                    </label>
                    <label class="field">
                        <span>結束日期</span>
                        <input name="endDate" type="date" value="${today}" required>
                    </label>
                    <label class="field">
                        <span>結束時間</span>
                        <input name="endTime" type="time" value="18:00" required>
                    </label>
                    <label class="field">
                        <span>請假時數</span>
                        <input name="durationHours" type="number" min="0.5" step="0.5" placeholder="可留空由時間推算">
                    </label>
                    <label class="field span-2">
                        <span>請假原因</span>
                        <textarea name="reason" rows="3" placeholder="請簡述請假原因"></textarea>
                    </label>
                </div>
                <div class="form-toolbar dense-toolbar">
                    <button class="primary-btn" type="submit">送出請假申請</button>
                    <p class="helper-text">送出後會依照主管審核與管理部終審流程更新狀態。</p>
                </div>
                <div class="inline-message" data-form-message-for="employee-leave-form" aria-live="polite"></div>
            </form>
        </article>
    `;
}

function renderEmployeeLeaveRecordsPanel(dashboard) {
    const leave = dashboard.leave || {};
    return `
        <div class="workspace-stack employee-leave-record-stack">
            ${leave.supervisorQueue?.length ? `
                <article class="table-card employee-workbench-panel" data-no-collapsible="true">
                    <div class="list-toolbar">
                        <div>
                            <h3>待我審核</h3>
                            <p class="helper-text">主管身分可在這裡處理部門員工的請假申請。</p>
                        </div>
                        ${renderBadge(`${leave.supervisorQueue.length} 筆待審`, "warning")}
                    </div>
                    ${renderEmployeeLeaveRequestRows(leave.supervisorQueue, { showEmployee: true, reviewMode: "supervisor" })}
                </article>
            ` : ""}
            <article class="table-card employee-workbench-panel" data-no-collapsible="true">
                <div class="list-toolbar">
                    <div>
                        <h3>我的請假紀錄</h3>
                        <p class="helper-text">查看自己的請假申請、審核狀態與可撤回項目。</p>
                    </div>
                    ${renderBadge(`${leave.myRequests?.length || 0} 筆`)}
                </div>
                ${renderEmployeeLeaveRequestRows(leave.myRequests || [])}
            </article>
        </div>
    `;
}

function renderEmployeeWorkspaceItems(dashboard) {
    const leave = dashboard.leave || {};
    const summary = dashboard.summary || {};
    const records = Array.isArray(dashboard.recentRecords) ? dashboard.recentRecords : [];
    const security = dashboard.security || {};
    return [
        {
            id: "private",
            label: "私人資訊",
            meta: dashboard.user?.department || dashboard.user?.job_title || "個人資料",
            html: `
                <article class="info-card employee-workbench-panel" data-no-collapsible="true">
                    <h3>私人資訊</h3>
                    <p class="hero-copy">查看聯絡資訊、地址與其他個人資料。</p>
                    ${buildEmployeePrivateInfoGrid(dashboard.user)}
                </article>
            `
        },
        {
            id: "records",
            label: "近 7 日打卡紀錄",
            meta: `${summary.weekRecordCount ?? records.length ?? 0} 筆`,
            html: `
                <article class="record-card employee-workbench-panel" data-no-collapsible="true">
                    <h3>近 7 日打卡紀錄</h3>
                    <p class="hero-copy">查看最近 7 日內的打卡時間、班別與來源。</p>
                    ${renderRecords(records)}
                </article>
            `
        },
        {
            id: "security",
            label: "遠端打卡安全",
            meta: security.currentDeviceTrusted ? "目前裝置已信任" : "需要確認裝置",
            html: dashboard.security
                ? renderEmployeeSecurityCard(dashboard.security).replace("<article class=\"info-card employee-security-card\">", "<article class=\"info-card employee-security-card employee-workbench-panel\" data-no-collapsible=\"true\">")
                : `
                    <article class="info-card employee-workbench-panel" data-no-collapsible="true">
                        <h3>遠端打卡安全</h3>
                        ${renderEmptyState("目前沒有遠端打卡安全資料。")}
                    </article>
                `
        },
        {
            id: "leave-request",
            label: "請假申請",
            meta: `${leave.leaveTypes?.length || 0} 種假別`,
            html: renderEmployeeLeaveApplicationPanel(dashboard)
        },
        {
            id: "leave-history",
            label: "我的請假紀錄",
            meta: `${leave.myRequests?.length || 0} 筆`,
            html: renderEmployeeLeaveRecordsPanel(dashboard)
        }
    ];
}

function renderEmployeeWorkspacePanel(dashboard) {
    const items = renderEmployeeWorkspaceItems(dashboard);
    const activeItem = items.find((item) => item.id === state.employeeWorkspacePanel);
    return `
        <section class="employee-workbench" style="grid-column: 1 / -1;">
            <div class="employee-workbench-tabs" role="tablist" aria-label="員工工作台項目">
                ${items.map((item) => {
                    const isActive = activeItem?.id === item.id;
                    return `
                        <button
                            class="employee-workbench-tab ${isActive ? "is-active" : ""}"
                            type="button"
                            role="tab"
                            aria-selected="${isActive ? "true" : "false"}"
                            aria-expanded="${isActive ? "true" : "false"}"
                            data-action="select-employee-workspace-panel"
                            data-panel="${escapeHtml(item.id)}">
                            <span>${escapeHtml(item.label)}</span>
                            <small>${escapeHtml(item.meta || "")}</small>
                        </button>
                    `;
                }).join("")}
            </div>
            <div class="employee-workbench-content">
                ${activeItem ? activeItem.html : renderEmptyState("請點選上方項目查看內容。")}
            </div>
        </section>
    `;
}

renderEmployeeDashboard = function renderEmployeeDashboardWorkbenchOverride(dashboard) {
    const lastPunchText = dashboard.summary.lastPunch
        ? `${dashboard.summary.lastPunch.dateText} ${dashboard.summary.lastPunch.timeText} ${dashboard.summary.lastPunch.statusText}`
        : "目前沒有打卡紀錄";

    return `
        <div class="dashboard-layout employee-layout">
            <article class="info-card employee-summary-card" data-no-collapsible="true">
                <h3>員工資料</h3>
                <p class="hero-copy">查看目前登入員工、班別與近期打卡摘要。</p>
                ${buildInfoGrid(dashboard.user)}
                ${renderStatsGrid(dashboard.summary, {
                    todayRecordCount: "今日紀錄數",
                    validRecordCount: "有效打卡",
                    weekRecordCount: "近 7 日紀錄",
                    currentShiftName: "目前班別",
                    nextPunchType: "下一次動作"
                })}
            </article>

            <article class="clock-panel employee-clock-card">
                <h3>目前時間</h3>
                <p id="employee-live-clock" class="clock-time">--:--:--</p>
                <p id="employee-clock-subtext" class="clock-subtext"></p>
                <div class="quick-actions">
                    <button data-action="employee-punch" class="primary-btn" type="button">${escapeHtml(dashboard.punchAction.label)}</button>
                    <button data-action="refresh-dashboard" class="secondary-btn" type="button">重新整理</button>
                </div>
                <p class="punch-note">最後一次打卡：${escapeHtml(lastPunchText)}</p>
            </article>

            ${renderEmployeeWorkspacePanel(dashboard)}
        </div>
    `;
};

renderAdminDashboard = function renderAdminDashboardLeaveOverride(dashboard) {
    const sections = [
        { id: "people", label: "人員資料" },
        { id: "security", label: "安全設定" },
        { id: "shifts", label: "班別設定" },
        { id: "manualPunch", label: "手動補登" },
        { id: "reports", label: "考勤報表" },
        { id: "leave", label: "請假管理" },
        { id: "system", label: "系統設定" },
        { id: "bells", label: "響鈴設定" },
        { id: "themes", label: "主題特效" }
    ];

    const activeSection = state.activeSections.admin;
    const content = activeSection === "people"
        ? renderAdminPeopleSection(dashboard.datasets)
        : activeSection === "security"
            ? renderAdminSecuritySection(dashboard.datasets)
        : activeSection === "shifts"
            ? renderAdminShiftSection(dashboard.datasets)
        : activeSection === "manualPunch"
            ? renderAdminManualPunchSection(dashboard.datasets)
        : activeSection === "reports"
            ? renderAdminReportSection(dashboard.datasets)
        : activeSection === "leave"
            ? renderAdminLeaveSection(dashboard.datasets)
        : activeSection === "system"
            ? renderAdminSystemSection(dashboard.datasets)
        : activeSection === "bells"
            ? renderAdminBellSection(dashboard.datasets)
            : renderAdminThemeSection(dashboard.datasets);
    const statModel = buildAdminDashboardStatModel(dashboard);

    return `
        <div class="workspace-shell">
            ${renderStatsGrid(statModel.summary, {
                employeeCount: "員工數量",
                shiftCount: "班別數量",
                todayPunchCount: "今日正常打卡",
                todayAbnormalPunchCount: "今日異常打卡",
                bellScheduleCount: "響鈴排程",
                greetingCount: "問候語",
                customThemeCount: "自訂主題"
            }, {
                clickableKeys: statModel.clickableKeys,
                subtitles: statModel.subtitles
            })}
            ${renderSectionTabs("admin", sections)}
            ${content}
        </div>
    `;
};

function setCollapsibleSectionState(card, isCollapsed) {
    const toggle = card.querySelector(":scope > .collapsible-header .collapsible-toggle, :scope > .list-toolbar .collapsible-toggle");
    const content = card.querySelector(":scope > .collapsible-content");
    card.classList.toggle("is-collapsed", isCollapsed);
    if (toggle) {
        toggle.setAttribute("aria-expanded", String(!isCollapsed));
        toggle.textContent = isCollapsed ? "展開" : "收合";
    }
    if (content) {
        content.setAttribute("aria-hidden", String(isCollapsed));
    }
}

const originalHandleDashboardClickWithCollapsible = handleDashboardClick;
handleDashboardClick = async function handleDashboardClickCollapsibleOverride(event) {
    const actionTarget = event.target.closest("[data-action]");
    if (actionTarget?.dataset.action !== "toggle-collapsible-section") {
        return originalHandleDashboardClickWithCollapsible(event);
    }

    const card = actionTarget.closest("article");
    if (!card) return;
    setCollapsibleSectionState(card, !card.classList.contains("is-collapsed"));
};

function getCollapsibleSectionKey(title, index) {
    const role = state.dashboard?.role || "unknown";
    const section = state.activeSections?.[role] || "main";
    const titleText = String(title?.textContent || "section")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
    return [role, section, titleText, index].join("|");
}

function getCollapsibleCardElements(card) {
    return {
        toggle: card.querySelector(":scope > .collapsible-header .collapsible-toggle, :scope > .list-toolbar .collapsible-toggle"),
        pin: card.querySelector(":scope > .collapsible-header .collapsible-pin, :scope > .list-toolbar .collapsible-pin"),
        content: card.querySelector(":scope > .collapsible-content")
    };
}

setupCollapsibleSections = function setupCollapsibleSectionsPersistent() {
    const cards = document.querySelectorAll([
        "#dashboard-content article.info-card",
        "#dashboard-content article.record-card",
        "#dashboard-content article.workspace-card",
        "#dashboard-content article.sub-panel",
        "#dashboard-content article.table-card",
        "#dashboard-content article.list-card"
    ].join(","));

    cards.forEach((card, index) => {
        if (card.dataset.noCollapsible === "true" || card.closest(".employee-workbench")) return;
        if (card.dataset.collapsibleReady === "true") return;

        const title = card.querySelector("h3");
        if (!title) return;

        const key = getCollapsibleSectionKey(title, index);
        let header = title.closest(".list-toolbar");
        if (!header || !card.contains(header)) {
            header = title.parentElement?.parentElement === card ? title.parentElement : null;
        }

        if (!header || header === card) {
            header = document.createElement("div");
            header.className = "collapsible-header";
            title.parentNode.insertBefore(header, title);
            header.appendChild(title);
        } else {
            header.classList.add("collapsible-header");
        }

        const titleGroup = Array.from(header.children).find((child) => child.contains(title)) || title;
        const controls = document.createElement("div");
        controls.className = "collapsible-controls";
        Array.from(header.children)
            .filter((child) => child !== titleGroup)
            .forEach((child) => controls.appendChild(child));

        const content = document.createElement("div");
        content.className = "collapsible-content";
        Array.from(card.children)
            .filter((child) => child !== header)
            .forEach((child) => content.appendChild(child));

        const contentId = `collapsible-section-${Date.now()}-${index}`;
        content.id = contentId;
        card.appendChild(content);

        const defaultExpanded = state.collapsibleDefaults[key] === true;
        const rememberedCollapsed = state.collapsibleStates[key];
        const isCollapsed = typeof rememberedCollapsed === "boolean" ? rememberedCollapsed : !defaultExpanded;

        const pin = document.createElement("button");
        pin.type = "button";
        pin.className = "outline-btn collapsible-pin";
        pin.dataset.action = "pin-collapsible-section";
        pin.textContent = "📌";

        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "outline-btn collapsible-toggle";
        toggle.dataset.action = "toggle-collapsible-section";
        toggle.setAttribute("aria-controls", contentId);

        controls.appendChild(pin);
        controls.appendChild(toggle);
        header.appendChild(controls);
        card.dataset.collapsibleKey = key;
        card.dataset.collapsibleReady = "true";

        syncCollapsiblePin(card, defaultExpanded);
        setCollapsibleSectionState(card, isCollapsed, { remember: false });
    });
};

function syncCollapsiblePin(card, defaultExpanded = false) {
    const { pin } = getCollapsibleCardElements(card);
    if (!pin) return;
    pin.classList.toggle("is-pinned-open", defaultExpanded);
    pin.setAttribute("aria-pressed", String(defaultExpanded));
    pin.title = defaultExpanded ? "預設展開" : "預設收合";
    pin.setAttribute("aria-label", defaultExpanded ? "此區塊預設展開" : "此區塊預設收合");
}

setCollapsibleSectionState = function setCollapsibleSectionStatePersistent(card, isCollapsed, options = {}) {
    const { toggle, content } = getCollapsibleCardElements(card);
    const shouldRemember = options.remember !== false;
    card.classList.toggle("is-collapsed", isCollapsed);
    if (toggle) {
        toggle.setAttribute("aria-expanded", String(!isCollapsed));
        toggle.textContent = isCollapsed ? "展開" : "收合";
    }
    if (content) {
        content.setAttribute("aria-hidden", String(isCollapsed));
    }
    if (shouldRemember && card.dataset.collapsibleKey) {
        state.collapsibleStates[card.dataset.collapsibleKey] = isCollapsed;
    }
};

const originalHandleDashboardClickWithPinnedCollapsible = handleDashboardClick;
handleDashboardClick = async function handleDashboardClickPinnedCollapsibleOverride(event) {
    const actionTarget = event.target.closest("[data-action]");
    const action = actionTarget?.dataset.action || "";

    if (action !== "toggle-collapsible-section" && action !== "pin-collapsible-section") {
        return originalHandleDashboardClickWithPinnedCollapsible(event);
    }

    const card = actionTarget.closest("article");
    if (!card) return;

    if (action === "toggle-collapsible-section") {
        setCollapsibleSectionState(card, !card.classList.contains("is-collapsed"));
        return;
    }

    const key = card.dataset.collapsibleKey;
    if (!key) return;
    const nextDefaultExpanded = state.collapsibleDefaults[key] !== true;
    state.collapsibleDefaults[key] = nextDefaultExpanded;
    saveCollapsibleDefaults();
    syncCollapsiblePin(card, nextDefaultExpanded);
    setCollapsibleSectionState(card, !nextDefaultExpanded);
};

function handleDashboardInsightChange(event) {
    const scope = {
        ...createDefaultAdminDashboardScope(),
        ...(state.adminDashboardScope || {})
    };

    if (event.target.id === "admin-insight-scope-mode") {
        scope.mode = ADMIN_DASHBOARD_SCOPE_MODES.includes(event.target.value) ? event.target.value : "all";
        state.adminDashboardScope = scope;
        saveAdminDashboardScope();
        renderDashboard(state.dashboard);
        refreshAdminDashboardInsightModal();
        return;
    }

    if (event.target.id === "admin-insight-scope-department") {
        scope.department = event.target.value || "";
        state.adminDashboardScope = scope;
        saveAdminDashboardScope();
        renderDashboard(state.dashboard);
        refreshAdminDashboardInsightModal();
        return;
    }

    if (event.target.classList.contains("admin-insight-employee-toggle")) {
        const selectedIds = new Set(scope.employeeIds || []);
        if (event.target.checked) {
            selectedIds.add(event.target.value);
        } else {
            selectedIds.delete(event.target.value);
        }
        scope.employeeIds = [...selectedIds];
        state.adminDashboardScope = scope;
        saveAdminDashboardScope();
        renderDashboard(state.dashboard);
        refreshAdminDashboardInsightModal();
    }
}

function setActiveLeaveTypeEditorPanel(form, targetId) {
    if (!form || !targetId) return;
    form.querySelectorAll("[data-leave-type-panel]").forEach((panel) => {
        const isActive = panel.id === targetId;
        panel.classList.toggle("hidden", !isActive);
        panel.classList.toggle("is-active", isActive);
    });
    form.querySelectorAll('[data-action="select-leave-type-editor"], [data-action="add-leave-type-editor"]').forEach((button) => {
        const isActive = button.dataset.target === targetId;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
}

function collectAdminLeaveTypes(form) {
    return Array.from(form.querySelectorAll(".leave-type-row")).map((row, index) => ({
        id: row.querySelector('[name="id"]')?.value?.trim() || "",
        name: row.querySelector('[name="name"]')?.value?.trim() || "",
        description: row.querySelector('[name="description"]')?.value?.trim() || "",
        unit: row.querySelector('[name="unit"]')?.value || "hour",
        display_order: Number(row.querySelector('[name="display_order"]')?.value || index * 10),
        enabled: Boolean(row.querySelector('[name="enabled"]')?.checked),
        paid: Boolean(row.querySelector('[name="paid"]')?.checked),
        deducts_balance: Boolean(row.querySelector('[name="deducts_balance"]')?.checked),
        requires_attachment: Boolean(row.querySelector('[name="requires_attachment"]')?.checked)
    })).filter((type) => type.id && type.name);
}

function collectAdminLeaveRoutes(form) {
    return Array.from(form.querySelectorAll(".leave-route-row")).map((row) => ({
        id: row.querySelector('[name="id"]')?.value || "",
        department: row.querySelector('[name="department"]')?.value?.trim() || "",
        supervisor_id: row.querySelector('[name="supervisor_id"]')?.value || "",
        enabled: Boolean(row.querySelector('[name="enabled"]')?.checked)
    })).filter((route) => route.department && route.supervisor_id);
}

const originalHandleDashboardSubmitWithLeave = handleDashboardSubmit;
handleDashboardSubmit = async function handleDashboardSubmitLeaveOverride(event) {
    const form = event.target instanceof HTMLFormElement
        ? event.target
        : event.target?.closest?.("form");
    const formId = form?.getAttribute("id") || "";
    if (!["employee-leave-form", "admin-leave-types-form", "admin-leave-routes-form"].includes(formId)) {
        return originalHandleDashboardSubmitWithLeave(event);
    }

    event.preventDefault();
    setFormMessage(formId, "");
    try {
        if (formId === "employee-leave-form") {
            const values = Object.fromEntries(new FormData(form).entries());
            const result = await requestJson("/api/browser/employee/leave/request", {
                method: "POST",
                auth: true,
                body: {
                    leaveTypeId: values.leaveTypeId,
                    startDate: values.startDate,
                    startTime: values.startTime,
                    endDate: values.endDate,
                    endTime: values.endTime,
                    durationHours: values.durationHours,
                    reason: values.reason?.trim() || ""
                }
            });
            renderDashboard(result.data.dashboard);
            setMessage(ui.dashboardMessage, result.message || "請假申請已送出。", "success");
            return;
        }

        if (formId === "admin-leave-types-form") {
            await saveAndReload("/api/browser/admin/leave-types/save", {
                leaveTypes: collectAdminLeaveTypes(form)
            }, "請假假別設定已更新。");
            setFormMessage(formId, "請假假別設定已更新。", "success");
            return;
        }

        if (formId === "admin-leave-routes-form") {
            await saveAndReload("/api/browser/admin/leave-routes/save", {
                approvalRoutes: collectAdminLeaveRoutes(form)
            }, "請假審核路徑已更新。");
            setFormMessage(formId, "請假審核路徑已更新。", "success");
        }
    } catch (error) {
        setMessage(ui.dashboardMessage, error.message, "error");
        setFormMessage(formId, error.message, "error");
    }
};

const originalHandleDashboardClickWithLeave = handleDashboardClick;
handleDashboardClick = async function handleDashboardClickLeaveOverride(event) {
    const actionTarget = event.target.closest("[data-action]");
    const action = actionTarget?.dataset.action || "";
    if (action === "select-leave-type-editor" || action === "add-leave-type-editor") {
        const form = actionTarget.closest("#admin-leave-types-form");
        const targetId = actionTarget.dataset.target || "";
        if (action === "add-leave-type-editor") {
            form?.querySelector('[data-new-row="true"]')?.classList.remove("hidden");
        }
        setActiveLeaveTypeEditorPanel(form, targetId);
        return;
    }
    if (!["leave-withdraw", "leave-supervisor-decision", "leave-admin-decision"].includes(action)) {
        return originalHandleDashboardClickWithLeave(event);
    }

    try {
        if (action === "leave-withdraw") {
            if (!window.confirm("確定要撤回這張請假申請嗎？")) return;
            const result = await requestJson("/api/browser/employee/leave/withdraw", {
                method: "POST",
                auth: true,
                body: { requestId: actionTarget.dataset.id }
            });
            renderDashboard(result.data.dashboard);
            setMessage(ui.dashboardMessage, result.message || "請假申請已撤回。", "success");
            return;
        }

        if (action === "leave-supervisor-decision") {
            const decision = actionTarget.dataset.decision === "approved" ? "approved" : "rejected";
            const comment = actionTarget.closest(".review-action-stack")?.querySelector("[data-leave-review-comment]")?.value?.trim() || "";
            const result = await requestJson("/api/browser/employee/leave/supervisor-decision", {
                method: "POST",
                auth: true,
                body: {
                    requestId: actionTarget.dataset.id,
                    decision,
                    comment
                }
            });
            renderDashboard(result.data.dashboard);
            setMessage(ui.dashboardMessage, result.message || "主管審核完成。", "success");
            return;
        }

        if (action === "leave-admin-decision") {
            const decision = actionTarget.dataset.decision === "approved" ? "approved" : "rejected";
            const comment = actionTarget.closest(".review-action-stack")?.querySelector("[data-leave-review-comment]")?.value?.trim() || "";
            await saveAndReload("/api/browser/admin/leave/final-decision", {
                requestId: actionTarget.dataset.id,
                decision,
                comment
            }, decision === "approved" ? "請假申請已核准生效。" : "請假申請已駁回。");
        }
    } catch (error) {
        setMessage(ui.dashboardMessage, error.message, "error");
    }
};

const originalGetRealtimeSyncLabelWithLeave = getRealtimeSyncLabel;
getRealtimeSyncLabel = function getRealtimeSyncLabelLeaveOverride(type) {
    if (type === "leaveRequests") return "請假申請";
    if (type === "leaveSettings") return "請假設定";
    return originalGetRealtimeSyncLabelWithLeave(type);
};

const originalHandleRealtimeSyncMessageWithLeave = handleRealtimeSyncMessage;
handleRealtimeSyncMessage = async function handleRealtimeSyncMessageLeaveOverride(payload) {
    const type = payload?.type;
    const role = state.dashboard?.role;
    if (["leaveRequests", "leaveSettings"].includes(type) && ["employee", "admin"].includes(role)) {
        await reloadDashboard(`已同步${getRealtimeSyncLabel(type)}最新內容。`, "info");
        return;
    }
    return originalHandleRealtimeSyncMessageWithLeave(payload);
};

function getAdminPermissionSet(dashboard = state.dashboard) {
    return new Set(dashboard?.permissions?.admin || []);
}

function adminHasAnyPermission(permissionCodes = [], dashboard = state.dashboard) {
    const permissionSet = getAdminPermissionSet(dashboard);
    return permissionCodes.some((code) => permissionSet.has(code));
}

function getAdminDashboardSections(dashboard = state.dashboard) {
    const sections = Array.isArray(dashboard?.permissions?.sections) ? dashboard.permissions.sections : [];
    if (sections.length) return sections;
    if (dashboard?.permissions) return [];
    return [
        { id: "people", label: "人員資料" },
        { id: "security", label: "安全設定" },
        { id: "shifts", label: "班別設定" },
        { id: "manualPunch", label: "手動補登" },
        { id: "reports", label: "考勤報表" },
        { id: "leave", label: "請假管理" },
        { id: "system", label: "系統設定" },
        { id: "bells", label: "響鈴設定" },
        { id: "themes", label: "主題特效" }
    ];
}

function renderAdminPermissionAwareContent(sectionId, datasets) {
    if (sectionId === "people") return renderAdminPeopleSection(datasets);
    if (sectionId === "security") return renderAdminSecuritySection(datasets);
    if (sectionId === "shifts") return renderAdminShiftSection(datasets);
    if (sectionId === "manualPunch") return renderAdminManualPunchSection(datasets);
    if (sectionId === "reports") return renderAdminReportSection(datasets);
    if (sectionId === "leave") return renderAdminLeaveSection(datasets);
    if (sectionId === "system") return renderAdminSystemSection(datasets);
    if (sectionId === "bells") return renderAdminBellSection(datasets);
    if (sectionId === "themes") return renderAdminThemeSection(datasets);
    return renderEmptyState("這個管理者帳號目前沒有可使用的管理頁面。");
}

function getAccountAccessDataset(datasets = getDatasets()) {
    return datasets?.accountAccess || null;
}

function getAccountAccessCatalog(accountAccess = getAccountAccessDataset()) {
    return accountAccess?.catalog || {
        roles: [],
        adminSections: [],
        adminPermissions: [],
        adminPresets: []
    };
}

function getAccountAccessPresetPermissions(presetId, accountAccess = getAccountAccessDataset()) {
    const preset = (getAccountAccessCatalog(accountAccess).adminPresets || [])
        .find((item) => item.id === presetId);
    return new Set(preset?.permissions || []);
}

function getAccountAccessPresetLabel(presetId, accountAccess = getAccountAccessDataset()) {
    const preset = (getAccountAccessCatalog(accountAccess).adminPresets || [])
        .find((item) => item.id === presetId);
    return preset?.label || "無管理者權限";
}

function getAccountAccessRoleSummary(account) {
    const allowedRoles = new Set(account?.access?.allowed_roles || ["employee"]);
    const labels = ["員工"];
    if (allowedRoles.has("admin")) labels.push("管理者");
    if (allowedRoles.has("developer")) labels.push("開發人員");
    return labels.join(" / ");
}

function getAccountAccessSearchText(account) {
    const employee = account?.employee || {};
    const values = [
        employee.id,
        employee.name,
        employee.department,
        employee.job_title,
        getAccountAccessRoleSummary(account),
        getAccountAccessPresetLabel(account?.access?.admin_preset)
    ];
    return values.map((value) => String(value || "").trim()).filter(Boolean).join(" ").toLocaleLowerCase();
}

function renderAccountRoleControls(account) {
    const allowedRoles = new Set(account?.access?.allowed_roles || ["employee"]);
    return `
        <div class="field-grid three dense-field-grid">
            <label class="switch-line"><input type="checkbox" data-access-role value="employee" checked disabled> 員工</label>
            <label class="switch-line"><input type="checkbox" data-access-role value="admin" ${allowedRoles.has("admin") ? "checked" : ""}> 管理者</label>
            <label class="switch-line"><input type="checkbox" data-access-role value="developer" ${allowedRoles.has("developer") ? "checked" : ""}> 開發人員</label>
        </div>
    `;
}

function renderAccountPresetOptions(account, presets = []) {
    const currentPreset = account?.access?.admin_preset || "none";
    return presets.map((preset) => `
        <option value="${escapeHtml(preset.id)}" ${preset.id === currentPreset ? "selected" : ""}>
            ${escapeHtml(preset.label)}
        </option>
    `).join("");
}

function renderAccountPermissionGroups(account, permissions = []) {
    const selectedPermissions = new Set(account?.access?.admin_permissions || []);
    const groups = permissions.reduce((result, permission) => {
        const category = permission.category || "其他";
        if (!result.has(category)) result.set(category, []);
        result.get(category).push(permission);
        return result;
    }, new Map());

    return [...groups.entries()].map(([category, items]) => `
        <div class="account-permission-group">
            <p class="sub-kicker">${escapeHtml(category)}</p>
            <div class="employee-column-grid">
                ${items.map((permission) => `
                    <label class="employee-column-option">
                        <input type="checkbox" data-access-permission value="${escapeHtml(permission.code)}" ${selectedPermissions.has(permission.code) ? "checked" : ""}>
                        <span>${escapeHtml(permission.label)}${permission.highRisk ? "（高風險）" : ""}</span>
                    </label>
                `).join("")}
            </div>
        </div>
    `).join("");
}

function renderAccountAccessManager(accountAccess = getAccountAccessDataset()) {
    if (!accountAccess?.canManage) return "";
    const catalog = getAccountAccessCatalog(accountAccess);
    const accounts = Array.isArray(accountAccess.accounts) ? accountAccess.accounts : [];
    if (!accounts.length) return renderEmptyState("目前沒有可設定權限的員工帳號。");

    return `
        <article class="table-card account-access-card">
            <div class="list-toolbar">
                <div>
                    <p class="sub-kicker">帳號管理</p>
                    <h3>帳號權限管理</h3>
                    <p class="helper-text">設定每位員工可登入的頁面角色，並限制管理者能使用的管理功能。</p>
                </div>
                <div class="badge-row">
                    ${renderBadge(accountAccess.initialized ? "已啟用自訂權限" : "預設員工權限", accountAccess.initialized ? "success" : "warning")}
                    ${renderBadge(`帳號 ${accounts.length} 筆`)}
                </div>
            </div>
            <form id="account-access-form" class="stack-form">
                <div class="account-access-filter">
                    <label class="field">
                        <span>搜尋員工</span>
                        <input id="account-access-search" type="search" autocomplete="off" placeholder="輸入工號、姓名、部門或角色">
                    </label>
                    <p class="helper-text">清單預設只顯示摘要；按「設定」才展開單一員工的角色與管理功能。</p>
                </div>
                <div class="record-list">
                    ${accounts.map((account) => {
                        const employee = account.employee || {};
                        const detailId = `account-access-detail-${escapeHtml(employee.id || "employee")}`;
                        const roleSummary = getAccountAccessRoleSummary(account);
                        const presetLabel = getAccountAccessPresetLabel(account.access?.admin_preset, accountAccess);
                        const searchText = getAccountAccessSearchText(account);
                        return `
                            <div class="list-item account-access-row" data-account-access-row data-expanded="false" data-employee-id="${escapeHtml(employee.id || "")}" data-search-text="${escapeHtml(searchText)}">
                                <div class="list-item-top account-access-row-summary">
                                    <div>
                                        <span>${escapeHtml(employee.id || "-")} / ${escapeHtml(employee.name || "-")}</span>
                                        <div class="record-subline">${escapeHtml(employee.department || "未設定部門")} · ${escapeHtml(roleSummary)} · ${escapeHtml(presetLabel)}</div>
                                    </div>
                                    <div class="badge-row">
                                        ${renderBadge(roleSummary)}
                                        ${account.access?.source === "default" ? renderBadge("預設員工", "warning") : ""}
                                        ${account.access?.source === "explicit" ? renderBadge("已自訂", "success") : ""}
                                        <button class="mini-btn" type="button" data-action="toggle-account-access-row" aria-controls="${detailId}" aria-expanded="false">設定</button>
                                    </div>
                                </div>
                                <div id="${detailId}" class="account-access-detail hidden" data-account-access-detail>
                                    ${renderAccountRoleControls(account)}
                                    <label class="field">
                                        <span>管理者權限模板</span>
                                        <select data-access-preset>
                                            ${renderAccountPresetOptions(account, catalog.adminPresets || [])}
                                        </select>
                                    </label>
                                    ${renderAccountPermissionGroups(account, catalog.adminPermissions || [])}
                                </div>
                            </div>
                        `;
                    }).join("")}
                </div>
                <div class="form-toolbar">
                    <button class="primary-btn" type="submit">儲存帳號權限</button>
                </div>
                <div class="inline-message" data-form-message-for="account-access-form" aria-live="polite"></div>
            </form>
        </article>
    `;
}

function renderSystemAdminCredentialsPanel(dashboard) {
    const account = dashboard?.datasets?.systemAdminAccount || {};
    return `
        <article class="info-card system-admin-account-card">
            <div class="list-toolbar">
                <div>
                    <p class="sub-kicker">系統管理者</p>
                    <h3>登入帳號</h3>
                    <p class="helper-text">此帳號只用於網頁端帳號權限管理，不綁定員工資料。</p>
                </div>
                <div class="badge-row">
                    ${renderBadge(account.username || "system-admin", "info")}
                </div>
            </div>
            <form id="system-admin-credentials-form" class="stack-form dense-form">
                <label class="field">
                    <span>目前密碼</span>
                    <input name="currentPassword" type="password" autocomplete="current-password" required>
                </label>
                <label class="field">
                    <span>系統管理者帳號</span>
                    <input name="username" type="text" autocomplete="username" value="${escapeHtml(account.username || "system-admin")}" required>
                </label>
                <label class="field">
                    <span>新密碼</span>
                    <input name="newPassword" type="password" autocomplete="new-password" placeholder="留空則不變更">
                </label>
                <label class="field">
                    <span>確認新密碼</span>
                    <input name="confirmPassword" type="password" autocomplete="new-password" placeholder="留空則不變更">
                </label>
                <div class="form-toolbar">
                    <button class="secondary-btn" type="submit">更新系統管理者帳號</button>
                </div>
                <div class="inline-message" data-form-message-for="system-admin-credentials-form" aria-live="polite"></div>
            </form>
        </article>
    `;
}

function renderSystemAdminDashboard(dashboard) {
    const summary = dashboard?.summary || {};
    return `
        <div class="workspace-shell">
            ${renderStatsGrid(summary, {
                employeeCount: "員工數",
                adminAccountCount: "管理者帳號",
                developerAccountCount: "開發人員帳號",
                customAccessCount: "已自訂權限"
            })}
            ${renderSystemAdminCredentialsPanel(dashboard)}
            ${renderAccountAccessManager(dashboard?.datasets?.accountAccess)}
        </div>
    `;
}

function insertAccountAccessManager(html, datasets) {
    const accountAccess = getAccountAccessDataset(datasets);
    if (!accountAccess?.canManage) return html;
    const manager = renderAccountAccessManager(accountAccess);
    const closingIndex = String(html || "").lastIndexOf("</div>");
    if (closingIndex === -1) return `${html}${manager}`;
    return `${html.slice(0, closingIndex)}${manager}${html.slice(closingIndex)}`;
}

const originalRenderDeveloperSystemSettingsSectionWithAccountAccess = renderDeveloperSystemSettingsSection;
renderDeveloperSystemSettingsSection = function renderDeveloperSystemSettingsSectionAccountAccessOverride(datasets = {}) {
    return insertAccountAccessManager(originalRenderDeveloperSystemSettingsSectionWithAccountAccess(datasets), datasets);
};

renderAdminDashboard = function renderAdminDashboardPermissionAware(dashboard) {
    const sections = getAdminDashboardSections(dashboard);
    if (!sections.some((section) => section.id === state.activeSections.admin)) {
        state.activeSections.admin = sections[0]?.id || "";
    }
    const activeSection = state.activeSections.admin;
    const content = sections.length
        ? renderAdminPermissionAwareContent(activeSection, dashboard.datasets)
        : renderEmptyState("這個管理者帳號目前沒有可使用的管理頁面，請聯絡完整管理者或開發人員調整權限。");
    const statModel = buildAdminDashboardStatModel(dashboard);

    return `
        <div class="workspace-shell">
            ${renderStatsGrid(statModel.summary, {
                employeeCount: "員工數量",
                shiftCount: "班別數量",
                todayPunchCount: "今日正常打卡",
                todayAbnormalPunchCount: "今日異常打卡",
                bellScheduleCount: "響鈴排程",
                greetingCount: "問候語",
                customThemeCount: "自訂主題"
            }, {
                clickableKeys: statModel.clickableKeys,
                subtitles: statModel.subtitles
            })}
            ${renderSectionTabs("admin", sections)}
            ${content}
        </div>
    `;
};

function syncAccountAccessRow(row) {
    if (!row) return;
    const adminToggle = row.querySelector('[data-access-role][value="admin"]');
    const presetSelect = row.querySelector("[data-access-preset]");
    const permissionCheckboxes = Array.from(row.querySelectorAll("[data-access-permission]"));
    const adminEnabled = Boolean(adminToggle?.checked);
    const presetId = adminEnabled ? (presetSelect?.value || "none") : "none";
    const presetPermissions = getAccountAccessPresetPermissions(presetId);
    if (presetSelect) presetSelect.disabled = !adminEnabled;

    permissionCheckboxes.forEach((checkbox) => {
        if (!adminEnabled) {
            checkbox.checked = false;
            checkbox.disabled = true;
            return;
        }
        if (presetId !== "custom") {
            checkbox.checked = presetPermissions.has(checkbox.value);
            checkbox.disabled = true;
            return;
        }
        checkbox.disabled = false;
    });
}

function syncAccountAccessForm() {
    document.querySelectorAll("[data-account-access-row]").forEach(syncAccountAccessRow);
}

function setAccountAccessRowExpanded(row, expanded) {
    if (!row) return;
    const isExpanded = Boolean(expanded);
    const detail = row.querySelector("[data-account-access-detail]");
    const toggle = row.querySelector('[data-action="toggle-account-access-row"]');
    row.dataset.expanded = isExpanded ? "true" : "false";
    row.classList.toggle("is-expanded", isExpanded);
    detail?.classList.toggle("hidden", !isExpanded);
    detail?.setAttribute("aria-hidden", String(!isExpanded));
    if (toggle) {
        toggle.textContent = isExpanded ? "收合" : "設定";
        toggle.setAttribute("aria-expanded", String(isExpanded));
    }
    if (isExpanded) syncAccountAccessRow(row);
}

function toggleAccountAccessRow(button) {
    const row = button?.closest?.("[data-account-access-row]");
    if (!row) return;
    const nextExpanded = row.dataset.expanded !== "true";
    document.querySelectorAll("[data-account-access-row]").forEach((item) => {
        if (item !== row) setAccountAccessRowExpanded(item, false);
    });
    setAccountAccessRowExpanded(row, nextExpanded);
}

function filterAccountAccessRows() {
    const query = String(document.getElementById("account-access-search")?.value || "").trim().toLocaleLowerCase();
    document.querySelectorAll("[data-account-access-row]").forEach((row) => {
        const matched = !query || String(row.dataset.searchText || "").includes(query);
        row.classList.toggle("hidden", !matched);
        if (!matched) setAccountAccessRowExpanded(row, false);
    });
}

const originalPostRenderSetupWithAccountAccess = postRenderSetup;
postRenderSetup = function postRenderSetupAccountAccessOverride() {
    originalPostRenderSetupWithAccountAccess();
    syncAccountAccessForm();
    filterAccountAccessRows();
};

function collectAccountAccessForm(form) {
    return Array.from(form.querySelectorAll("[data-account-access-row]")).map((row) => ({
        employee_id: row.dataset.employeeId || "",
        allowed_roles: Array.from(row.querySelectorAll("[data-access-role]:checked")).map((input) => input.value),
        admin_preset: row.querySelector("[data-access-preset]")?.value || "none",
        admin_permissions: Array.from(row.querySelectorAll("[data-access-permission]:checked")).map((input) => input.value)
    }));
}

const originalHandleDashboardChangeWithAccountAccess = handleDashboardChange;
handleDashboardChange = async function handleDashboardChangeAccountAccessOverride(event) {
    const row = event.target?.closest?.("[data-account-access-row]");
    if (row && (event.target.matches("[data-access-role]") || event.target.matches("[data-access-preset]"))) {
        syncAccountAccessRow(row);
        return;
    }
    return originalHandleDashboardChangeWithAccountAccess(event);
};

const originalHandleDashboardClickWithAccountAccess = handleDashboardClick;
handleDashboardClick = async function handleDashboardClickAccountAccessOverride(event) {
    const actionTarget = event.target?.closest?.("[data-action]");
    if (actionTarget?.dataset.action === "toggle-account-access-row") {
        event.preventDefault();
        toggleAccountAccessRow(actionTarget);
        return;
    }
    return originalHandleDashboardClickWithAccountAccess(event);
};

SAVE_FEEDBACK_FORM_IDS.add("account-access-form");

const originalHandleDashboardSubmitWithAccountAccess = handleDashboardSubmit;
handleDashboardSubmit = async function handleDashboardSubmitAccountAccessOverride(event) {
    const form = event.target instanceof HTMLFormElement
        ? event.target
        : event.target?.closest?.("form");
    const formId = form?.getAttribute?.("id") || "";

    if (formId !== "account-access-form") {
        return originalHandleDashboardSubmitWithAccountAccess(event);
    }

    event.preventDefault();
    if (!form) return;
    setFormMessage(formId, "");

    try {
        const result = await requestJson("/api/browser/admin/account-access/save", {
            method: "POST",
            auth: true,
            body: { accounts: collectAccountAccessForm(form) }
        });
        if (result.dashboard) {
            renderDashboard(result.dashboard);
        } else {
            await reloadDashboard(result.message || "帳號權限設定已更新。");
        }
        setMessage(ui.dashboardMessage, result.message || "帳號權限設定已更新。", "success");
        setFormMessage(formId, result.message || "帳號權限設定已更新。", "success");
    } catch (error) {
        setMessage(ui.dashboardMessage, error.message, "error");
        setFormMessage(formId, error.message, "error");
    }
};

SAVE_FEEDBACK_FORM_IDS.add("system-admin-credentials-form");

const originalHandleDashboardSubmitWithSystemAdmin = handleDashboardSubmit;
handleDashboardSubmit = async function handleDashboardSubmitSystemAdminOverride(event) {
    const form = event.target instanceof HTMLFormElement
        ? event.target
        : event.target?.closest?.("form");
    const formId = form?.getAttribute?.("id") || "";

    if (formId !== "system-admin-credentials-form") {
        return originalHandleDashboardSubmitWithSystemAdmin(event);
    }

    event.preventDefault();
    if (!form) return;
    setFormMessage(formId, "");

    try {
        const values = Object.fromEntries(new FormData(form).entries());
        const result = await requestJson("/api/browser/system-admin/credentials/save", {
            method: "POST",
            auth: true,
            body: {
                currentPassword: values.currentPassword || "",
                username: values.username || "",
                newPassword: values.newPassword || "",
                confirmPassword: values.confirmPassword || ""
            }
        });
        if (result.dashboard) renderDashboard(result.dashboard);
        setMessage(ui.dashboardMessage, result.message || "系統管理者帳號設定已更新。", "success");
        setFormMessage(formId, result.message || "系統管理者帳號設定已更新。", "success");
    } catch (error) {
        setMessage(ui.dashboardMessage, error.message, "error");
        setFormMessage(formId, error.message, "error");
    }
};

function refreshWorkspaceNavOrderIndexes(list = document.querySelector("[data-workspace-nav-order-list]")) {
    if (!list) return;
    Array.from(list.querySelectorAll("[data-workspace-nav-order-item]")).forEach((item, index) => {
        const indexNode = item.querySelector(".workspace-nav-order-index");
        if (indexNode) indexNode.textContent = String(index + 1);
    });
}

function moveWorkspaceNavOrderItem(button) {
    const item = button?.closest?.("[data-workspace-nav-order-item]");
    const list = item?.closest?.("[data-workspace-nav-order-list]");
    if (!item || !list) return;
    const direction = button.dataset.direction;
    if (direction === "up" && item.previousElementSibling) {
        list.insertBefore(item, item.previousElementSibling);
    }
    if (direction === "down" && item.nextElementSibling) {
        list.insertBefore(item.nextElementSibling, item);
    }
    refreshWorkspaceNavOrderIndexes(list);
}

function collectWorkspaceNavOrderForm(form) {
    return {
        role: form?.dataset?.role || form?.elements?.role?.value || "admin",
        order: Array.from(form?.querySelectorAll?.('input[name="order"]') || []).map((input) => input.value)
    };
}

async function resetWorkspaceNavOrder(button) {
    const form = button?.closest?.("form");
    if (!form) return;
    const role = form.dataset.role || form.elements.role?.value || "admin";
    setFormMessage("workspace-nav-order-form", "");
    try {
        const result = await requestJson("/api/browser/developer/workspace-nav-order/reset", {
            method: "POST",
            auth: true,
            body: { role }
        });
        if (result.dashboard) renderDashboard(result.dashboard);
        setMessage(ui.dashboardMessage, result.message || "主功能頁籤排序已還原預設。", "success");
        setFormMessage("workspace-nav-order-form", result.message || "主功能頁籤排序已還原預設。", "success");
    } catch (error) {
        setMessage(ui.dashboardMessage, error.message, "error");
        setFormMessage("workspace-nav-order-form", error.message, "error");
    }
}

SAVE_FEEDBACK_FORM_IDS.add("workspace-nav-order-form");

const originalHandleDashboardChangeWithWorkspaceNavOrder = handleDashboardChange;
handleDashboardChange = async function handleDashboardChangeWorkspaceNavOrderOverride(event) {
    if (event.target?.id === "workspace-nav-order-role") {
        state.workspaceNavOrderRole = event.target.value || "admin";
        renderDashboard(state.dashboard);
        return;
    }
    return originalHandleDashboardChangeWithWorkspaceNavOrder(event);
};

const originalHandleDashboardClickWithWorkspaceNavOrder = handleDashboardClick;
handleDashboardClick = async function handleDashboardClickWorkspaceNavOrderOverride(event) {
    const actionTarget = event.target?.closest?.("[data-action]");
    if (actionTarget?.dataset.action === "move-workspace-nav-item") {
        event.preventDefault();
        moveWorkspaceNavOrderItem(actionTarget);
        return;
    }
    if (actionTarget?.dataset.action === "reset-workspace-nav-order") {
        event.preventDefault();
        await resetWorkspaceNavOrder(actionTarget);
        return;
    }
    return originalHandleDashboardClickWithWorkspaceNavOrder(event);
};

const originalHandleDashboardSubmitWithWorkspaceNavOrder = handleDashboardSubmit;
handleDashboardSubmit = async function handleDashboardSubmitWorkspaceNavOrderOverride(event) {
    const form = event.target instanceof HTMLFormElement
        ? event.target
        : event.target?.closest?.("form");
    const formId = form?.getAttribute?.("id") || "";
    if (formId !== "workspace-nav-order-form") {
        return originalHandleDashboardSubmitWithWorkspaceNavOrder(event);
    }

    event.preventDefault();
    setFormMessage(formId, "");
    try {
        const result = await requestJson("/api/browser/developer/workspace-nav-order/save", {
            method: "POST",
            auth: true,
            body: collectWorkspaceNavOrderForm(form)
        });
        if (result.dashboard) renderDashboard(result.dashboard);
        setMessage(ui.dashboardMessage, result.message || "主功能頁籤排序已儲存。", "success");
        setFormMessage(formId, result.message || "主功能頁籤排序已儲存。", "success");
    } catch (error) {
        setMessage(ui.dashboardMessage, error.message, "error");
        setFormMessage(formId, error.message, "error");
    }
};

function handleWorkspaceNavOrderDragStart(event) {
    const item = event.target?.closest?.("[data-workspace-nav-order-item]");
    if (!item) return;
    event.dataTransfer?.setData("text/plain", item.dataset.sectionId || "");
    event.dataTransfer?.setDragImage?.(item, 12, 12);
    item.classList.add("is-dragging");
}

function handleWorkspaceNavOrderDragOver(event) {
    const list = event.target?.closest?.("[data-workspace-nav-order-list]");
    const target = event.target?.closest?.("[data-workspace-nav-order-item]");
    const dragging = list?.querySelector?.(".is-dragging");
    if (!list || !target || !dragging || target === dragging) return;
    event.preventDefault();
    const box = target.getBoundingClientRect();
    const insertAfter = event.clientY > box.top + box.height / 2;
    list.insertBefore(dragging, insertAfter ? target.nextElementSibling : target);
    refreshWorkspaceNavOrderIndexes(list);
}

function handleWorkspaceNavOrderDrop(event) {
    const list = event.target?.closest?.("[data-workspace-nav-order-list]");
    if (!list) return;
    event.preventDefault();
    refreshWorkspaceNavOrderIndexes(list);
}

function handleWorkspaceNavOrderDragEnd() {
    document.querySelectorAll("[data-workspace-nav-order-item].is-dragging").forEach((item) => {
        item.classList.remove("is-dragging");
    });
}

const originalGetRealtimeSyncLabelWithAccountAccess = getRealtimeSyncLabel;
getRealtimeSyncLabel = function getRealtimeSyncLabelAccountAccessOverride(type) {
    if (type === "accountAccess") return "帳號權限設定";
    if (type === "workspaceNavOrder") return "主功能頁籤排序";
    return originalGetRealtimeSyncLabelWithAccountAccess(type);
};

const originalHandleRealtimeSyncMessageWithAccountAccess = handleRealtimeSyncMessage;
handleRealtimeSyncMessage = async function handleRealtimeSyncMessageAccountAccessOverride(payload) {
    const type = payload?.type;
    const role = state.dashboard?.role;
    if (type === "accountAccess" && ["developer", "system_admin"].includes(role)) {
        await reloadDashboard("帳號權限設定已更新。", "info");
        return;
    }
    if (type === "workspaceNavOrder" && ["admin", "developer"].includes(role)) {
        await reloadDashboard("主功能頁籤排序已更新。", "info");
        return;
    }
    return originalHandleRealtimeSyncMessageWithAccountAccess(payload);
};

function renderDatabaseBackupItems(items = [], emptyText = "目前沒有資料庫備份。") {
    if (!Array.isArray(items) || !items.length) return renderEmptyState(emptyText);
    return `
        <div class="record-list">
            ${items.map((item) => `
                <div class="list-item">
                    <div class="list-item-top">
                        <span>${escapeHtml(item.fileName || item.databaseFileName || "資料庫備份")}</span>
                        ${renderBadge(`${item.sizeMb ?? 0} MB`, "success")}
                    </div>
                    <div class="record-subline">建立時間：${escapeHtml(item.manifest?.createdAtText || item.createdText || "-")}</div>
                    <div class="record-subline mono-text">${escapeHtml(item.filePath || item.databaseFilePath || "-")}</div>
                    ${item.manifest?.sha256 ? `<div class="record-subline mono-text">SHA256 ${escapeHtml(item.manifest.sha256)}</div>` : ""}
                </div>
            `).join("")}
        </div>
    `;
}

renderAutomationTasks = function renderAutomationTasksWithDatabaseBackup(tasks, exportConfig = getAttendanceExportConfig(), automationExportConfig = getAutomationExportConfig(), databaseBackupConfig = getDatabaseBackupConfig()) {
    if (!tasks.length) return renderEmptyState("目前沒有自動化任務。");
    return `
        <div class="record-list">
            ${tasks.map((task) => {
                const isBackupTask = task.task_type === "backup";
                const directory = task.export_directory
                    || (isBackupTask
                        ? databaseBackupConfig.effectiveDirectory || databaseBackupConfig.fallbackDirectory || "系統預設資料夾"
                        : automationExportConfig.defaultDirectory || automationExportConfig.fallbackDirectory || "桌面資料夾");
                const directoryLabel = task.export_directory
                    ? "任務專用"
                    : isBackupTask
                        ? (databaseBackupConfig.defaultDirectory ? "備份預設" : "系統預設")
                        : (automationExportConfig.defaultDirectory ? "匯出預設" : "桌面預設");
                return `
                    <div class="list-item">
                        <div class="list-item-top">
                            <span>${escapeHtml(automationFrequencyLabels[task.frequency] || task.frequency)} / ${escapeHtml(automationTaskLabels[task.task_type] || task.task_type)}</span>
                            <div class="inline-actions">
                                <label class="switch-line"><input type="checkbox" data-action="toggle-automation-task" data-id="${escapeHtml(task.id)}" ${task.enabled ? "checked" : ""}>啟用</label>
                                <button class="mini-btn" type="button" data-action="edit-automation-task" data-id="${escapeHtml(task.id)}">編輯</button>
                                <button class="mini-btn" type="button" data-action="delete-automation-task" data-id="${escapeHtml(task.id)}">刪除</button>
                            </div>
                        </div>
                        <div class="record-subline">
                            目標：${escapeHtml(automationTargetLabels[task.target] || task.target)}
                            ，時間：${escapeHtml(task.time || "立即執行")}
                            ，週期日：${escapeHtml(task.day || "-")}
                            ${isAttendanceExportTask(task.task_type, task.target)
                                ? `，考勤模板：${escapeHtml(
                                    exportConfig.templates.find((template) => template.id === task.export_template)?.label
                                    || getAttendanceExportTemplateLabel(task.export_template)
                                )}`
                                : ""}
                            ${["export", "backup"].includes(task.task_type)
                                ? `，資料夾：${escapeHtml(directory)} (${escapeHtml(directoryLabel)})`
                                : ""}
                        </div>
                    </div>
                `;
            }).join("")}
        </div>
    `;
};

renderDeveloperAutomationSection = function renderDeveloperAutomationSectionDatabaseBackupOverride(datasets) {
    const exportConfig = getAttendanceExportConfig(datasets);
    const automationExportConfig = getAutomationExportConfig(datasets);
    const databaseBackupConfig = getDatabaseBackupConfig(datasets);
    const templateOptions = exportConfig.templates.length
        ? exportConfig.templates.map((template) => `<option value="${escapeHtml(template.id)}">${escapeHtml(template.label)}</option>`).join("")
        : `<option value="full">完整欄位</option>`;
    const targetOptions = Object.entries(automationTargetLabels)
        .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
        .join("");

    return `
        <div class="workspace-stack">
            <article class="workspace-card">
                <div class="list-toolbar">
                    <div>
                        <p class="sub-kicker">開發者自動化</p>
                        <h3>自動化任務</h3>
                    </div>
                    <div class="badge-row">
                        ${renderBadge(`任務 ${datasets.automationTasks.length} 筆`, "success")}
                        ${renderBadge(`日誌 ${datasets.automationLog.length} 筆`)}
                    </div>
                </div>
                <p class="helper-text">自動化任務現在可排程匯出、清理資料，也可建立完整資料庫備份；備份會寫入 manifest 與雜湊值，方便之後查核與還原。</p>
            </article>

            <article class="sub-panel">
                <div class="list-toolbar">
                    <div>
                        <h3>任務設定</h3>
                        <p class="helper-text">完整備份任務會固定使用「完整資料庫備份」目標；資料夾可使用備份預設，也可針對單一任務指定。</p>
                    </div>
                </div>
                <form id="automation-form" class="stack-form">
                    <input type="hidden" name="editingId" value="">
                    <div class="form-section-card">
                        <div class="form-section-heading">
                            <h4>排程</h4>
                        </div>
                        <div class="form-section-grid">
                            <label class="field"><span>頻率</span><select name="frequency" id="automation-frequency"><option value="immediate">立即</option><option value="daily">每天</option><option value="weekly">每週</option><option value="monthly">每月</option></select></label>
                            <label class="field"><span>時間</span><input name="time" id="automation-time" type="time"></label>
                            <label class="field"><span>每週星期</span><select name="weeklyDay" id="automation-weekly-day">${dayLabels.map((day, index) => `<option value="${index}">${day}</option>`).join("")}</select></label>
                            <label class="field"><span>每月日期</span><select name="monthlyDay" id="automation-monthly-day">${Array.from({ length: 31 }, (_, index) => `<option value="${index + 1}">${index + 1}</option>`).join("")}</select></label>
                        </div>
                    </div>

                    <div class="form-section-card">
                        <div class="form-section-heading">
                            <h4>任務內容</h4>
                        </div>
                        <div class="form-section-grid">
                            <label class="field"><span>任務類型</span><select name="task_type" id="automation-task-type"><option value="export">匯出</option><option value="delete">刪除</option><option value="backup">完整備份</option></select></label>
                            <label class="field"><span>任務目標</span><select name="target" id="automation-target">${targetOptions}</select></label>
                            <label class="field hidden span-2" id="automation-export-template-field"><span>考勤模板</span><select name="export_template" id="automation-export-template">${templateOptions}</select></label>
                            <label class="field hidden span-2" id="automation-export-directory-field"><span>任務專用資料夾</span><input name="export_directory" id="automation-export-directory-input" type="text" placeholder="留空時使用該任務類型的預設資料夾"></label>
                            <label class="field span-2"><span>啟用狀態</span><select name="enabled"><option value="true">啟用</option><option value="false">停用</option></select></label>
                        </div>
                        <div class="inline-actions hidden" id="automation-export-directory-actions">
                            <button class="outline-btn" type="button" data-action="pick-automation-task-directory">選擇任務資料夾</button>
                            <button class="outline-btn" type="button" data-action="clear-automation-task-directory">清空任務資料夾</button>
                        </div>
                        <div class="status-box">
                            <strong>預設路徑</strong>
                            <span class="mono-text">匯出：${escapeHtml(automationExportConfig.effectiveDirectory || "桌面")} / 備份：${escapeHtml(databaseBackupConfig.effectiveDirectory || "系統預設")}</span>
                        </div>
                    </div>

                    <div class="form-toolbar">
                        <button class="primary-btn" type="submit">儲存 / 執行任務</button>
                        <button class="outline-btn" type="button" data-action="reset-automation-form">重設表單</button>
                    </div>
                    <div class="inline-message" data-form-message-for="automation-form" aria-live="polite"></div>
                </form>
            </article>

            <article class="sub-panel">
                <div class="list-toolbar">
                    <div>
                        <h3>目前任務清單</h3>
                        <p class="helper-text">排程任務會由桌面主程式執行；立即任務會從目前開發者工作台執行。</p>
                    </div>
                </div>
                ${renderAutomationTasks(datasets.automationTasks, exportConfig, automationExportConfig, databaseBackupConfig)}
            </article>
        </div>
    `;
};

renderDeveloperExportSection = function renderDeveloperExportSectionDatabaseBackupOverride(datasets) {
    const exportConfig = getAttendanceExportConfig(datasets);
    const customTemplate = exportConfig.templates.find((template) => template.id === "custom");
    const automationExportConfig = getAutomationExportConfig(datasets);
    const databaseBackupConfig = getDatabaseBackupConfig(datasets);
    const auditArchiveConfig = getAuditArchiveConfig(datasets);
    const recentArchives = auditArchiveConfig.recentArchives || [];

    return `
        <div class="workspace-stack">
            <article class="workspace-card">
                <div class="list-toolbar">
                    <div>
                        <p class="sub-kicker">開發者資料管理</p>
                        <h3>匯出、封存、備份與還原</h3>
                    </div>
                    <div class="badge-row">
                        ${renderBadge(`備份 ${databaseBackupConfig.recentBackups?.length || 0} 筆`, "success")}
                        ${renderBadge(`封存 ${recentArchives.length} 筆`)}
                    </div>
                </div>
                <p class="helper-text">這裡集中管理自動化匯出路徑、完整資料庫備份、還原前緊急備份、稽核封存與考勤匯出欄位。</p>
            </article>

            <article class="sub-panel">
                <h3>自動化匯出資料夾</h3>
                ${buildKeyValueGrid([
                    { label: "預設匯出資料夾", value: automationExportConfig.defaultDirectory || "(未設定)", mono: true },
                    { label: "目前有效匯出位置", value: automationExportConfig.effectiveDirectory || "-", mono: true },
                    { label: "桌面備援位置", value: automationExportConfig.fallbackDirectory || "-", mono: true },
                    { label: "狀態", value: automationExportConfig.usingFallback ? "未設定預設資料夾，會使用桌面備援。" : "使用指定預設資料夾。" }
                ])}
                <form id="automation-export-directory-form" class="stack-form">
                    <label class="field">
                        <span>預設匯出資料夾</span>
                        <input name="defaultDirectory" id="automation-default-directory" type="text" value="${escapeHtml(automationExportConfig.defaultDirectory || "")}" placeholder="留空時使用桌面">
                    </label>
                    <div class="form-toolbar">
                        <button class="primary-btn" type="submit">儲存匯出資料夾</button>
                        <button class="outline-btn" type="button" data-action="pick-automation-default-directory">選擇資料夾</button>
                        <button class="outline-btn" type="button" data-action="clear-automation-default-directory">清空路徑</button>
                    </div>
                    <div class="inline-message" data-form-message-for="automation-export-directory-form" aria-live="polite"></div>
                </form>
            </article>

            <article class="sub-panel">
                <div class="list-toolbar">
                    <div>
                        <h3>完整資料庫備份與還原</h3>
                        <p class="helper-text">備份會產生 SQLite 資料庫檔與 manifest；還原前會先建立緊急備份，避免誤還原後無法退回。</p>
                    </div>
                    <div class="badge-row">
                        ${renderBadge(`保留 ${databaseBackupConfig.retentionCount || 30} 份`, "success")}
                    </div>
                </div>
                ${buildKeyValueGrid([
                    { label: "預設備份資料夾", value: databaseBackupConfig.defaultDirectory || "(未設定)", mono: true },
                    { label: "目前有效備份位置", value: databaseBackupConfig.effectiveDirectory || "-", mono: true },
                    { label: "系統備援位置", value: databaseBackupConfig.fallbackDirectory || "-", mono: true },
                    { label: "最近一般備份", value: `${databaseBackupConfig.recentBackups?.length || 0} 筆` },
                    { label: "最近緊急備份", value: `${databaseBackupConfig.recentEmergencyBackups?.length || 0} 筆` }
                ])}
                <form id="database-backup-settings-form" class="stack-form">
                    <div class="field-grid">
                        <label class="field">
                            <span>預設備份資料夾</span>
                            <input name="defaultDirectory" id="database-backup-directory" type="text" value="${escapeHtml(databaseBackupConfig.defaultDirectory || "")}" placeholder="留空時使用系統備援位置">
                        </label>
                        <label class="field">
                            <span>保留份數</span>
                            <input name="retentionCount" type="number" min="3" max="3650" step="1" value="${escapeHtml(String(databaseBackupConfig.retentionCount || 30))}">
                        </label>
                    </div>
                    <div class="form-toolbar">
                        <button class="primary-btn" type="submit">儲存備份設定</button>
                        <button class="outline-btn" type="button" data-action="pick-database-backup-directory">選擇資料夾</button>
                        <button class="outline-btn" type="button" data-action="clear-database-backup-directory">清空路徑</button>
                        <button class="secondary-btn" type="button" data-action="run-database-backup-now">立即完整備份</button>
                    </div>
                    <div class="inline-message" data-form-message-for="database-backup-settings-form" aria-live="polite"></div>
                </form>
                <form id="database-restore-form" class="stack-form danger-zone">
                    <div class="field-grid">
                        <label class="field">
                            <span>還原備份檔</span>
                            <input name="sourceFilePath" id="database-restore-source-file" type="text" placeholder="選擇 .db / .sqlite / .sqlite3 備份檔">
                        </label>
                        <label class="field">
                            <span>確認文字</span>
                            <input name="confirmText" type="text" placeholder="輸入：還原資料庫">
                        </label>
                    </div>
                    <div class="form-toolbar">
                        <button class="outline-btn" type="button" data-action="pick-database-restore-file">選擇備份檔</button>
                        <button class="danger-btn" type="submit">還原資料庫</button>
                    </div>
                    <div class="inline-message" data-form-message-for="database-restore-form" aria-live="polite"></div>
                </form>
                <h4>最近完整備份</h4>
                ${renderDatabaseBackupItems(databaseBackupConfig.recentBackups || [])}
                <h4>最近還原前緊急備份</h4>
                ${renderDatabaseBackupItems(databaseBackupConfig.recentEmergencyBackups || [], "目前沒有還原前緊急備份。")}
            </article>

            <article class="sub-panel">
                <h3>稽核封存設定</h3>
                ${buildKeyValueGrid([
                    { label: "保留天數", value: `${auditArchiveConfig.retentionDays || 180} 天` },
                    { label: "預設封存資料夾", value: auditArchiveConfig.defaultDirectory || "(未設定)", mono: true },
                    { label: "目前有效封存位置", value: auditArchiveConfig.effectiveDirectory || "-", mono: true },
                    { label: "系統備援位置", value: auditArchiveConfig.fallbackDirectory || "-", mono: true }
                ])}
                <form id="audit-archive-settings-form" class="stack-form">
                    <div class="field-grid">
                        <label class="field">
                            <span>保留天數</span>
                            <input name="retentionDays" type="number" min="30" max="3650" step="1" value="${escapeHtml(String(auditArchiveConfig.retentionDays || 180))}">
                        </label>
                        <label class="field">
                            <span>封存資料夾</span>
                            <input name="archiveDirectory" type="text" value="${escapeHtml(auditArchiveConfig.defaultDirectory || "")}" placeholder="留空時使用系統預設封存資料夾">
                        </label>
                    </div>
                    <div class="form-toolbar">
                        <button class="primary-btn" type="submit">儲存封存設定</button>
                        <button class="outline-btn" type="button" data-action="pick-audit-archive-directory">選擇資料夾</button>
                        <button class="outline-btn" type="button" data-action="clear-audit-archive-directory">清空路徑</button>
                        <button class="secondary-btn" type="button" data-action="run-audit-archive-now">立即封存</button>
                    </div>
                    <div class="inline-message" data-form-message-for="audit-archive-settings-form" aria-live="polite"></div>
                </form>
                <div class="record-list">
                    ${recentArchives.length ? recentArchives.map((archive) => `
                        <div class="list-item">
                            <div class="list-item-top">
                                <span>${escapeHtml(archive.archive_month || archive.fileName || "封存檔")}</span>
                                ${renderBadge(`${archive.record_count || 0} 筆`, "success")}
                            </div>
                            <div class="record-subline">建立時間：${escapeHtml(archive.createdAtText || "-")}</div>
                            <div class="record-subline mono-text">${escapeHtml(archive.file_path || "-")}</div>
                        </div>
                    `).join("") : renderEmptyState("目前沒有稽核封存紀錄。")}
                </div>
            </article>

            <article class="sub-panel">
                <h3>考勤匯出模板</h3>
                <div class="record-list">
                    ${exportConfig.templates.filter((template) => template.id !== "custom").map((template) => `
                        <div class="list-item">
                            <div class="list-item-top">
                                <span>${escapeHtml(template.label)}</span>
                                ${renderBadge(`${template.fields.length} 欄`, "success")}
                            </div>
                            <div class="record-subline">${escapeHtml(template.description)}</div>
                            <div class="record-subline mono-text">${escapeHtml(template.fields.map((field) => field.label).join(" / "))}</div>
                        </div>
                    `).join("")}
                </div>
            </article>

            <article class="sub-panel">
                <h3>自訂考勤匯出欄位</h3>
                <form id="attendance-export-settings-form" class="stack-form">
                    <div class="checkbox-grid">
                        ${exportConfig.fieldCatalog.map((field) => `
                            <label class="checkbox-label">
                                <input type="checkbox" name="customFields" value="${escapeHtml(field.id)}" ${exportConfig.customFields.includes(field.id) ? "checked" : ""}>
                                ${escapeHtml(field.label)}
                            </label>
                        `).join("")}
                    </div>
                    <p class="helper-text">目前自訂模板已選 ${exportConfig.customFields.length} 欄。${escapeHtml(customTemplate?.description || "")}</p>
                    <div class="form-toolbar">
                        <button class="primary-btn" type="submit">儲存自訂模板</button>
                        <button class="outline-btn" type="reset">還原表單</button>
                    </div>
                </form>
                <div class="record-subline mono-text">${escapeHtml((customTemplate?.fields || []).map((field) => field.label).join(" / "))}</div>
            </article>
        </div>
    `;
};

const previousSyncAutomationFormVisibilityWithBackup = syncAutomationFormVisibility;
syncAutomationFormVisibility = function syncAutomationFormVisibilityDatabaseBackupOverride() {
    previousSyncAutomationFormVisibilityWithBackup();
    const form = document.getElementById("automation-form");
    if (!form) return;
    const taskType = form.elements.task_type?.value || "export";
    const targetField = document.getElementById("automation-target")?.closest(".field");
    const exportDirectoryField = document.getElementById("automation-export-directory-field");
    const exportDirectoryActions = document.getElementById("automation-export-directory-actions");
    const showDirectory = taskType === "export" || taskType === "backup";
    if (taskType === "backup" && form.elements.target) {
        form.elements.target.value = "database_full";
    }
    if (taskType !== "backup" && form.elements.target?.value === "database_full") {
        form.elements.target.value = "last_week_records";
    }
    if (targetField) targetField.classList.toggle("hidden", taskType === "backup");
    if (exportDirectoryField) exportDirectoryField.classList.toggle("hidden", !showDirectory);
    if (exportDirectoryActions) exportDirectoryActions.classList.toggle("hidden", !showDirectory);
};

SAVE_FEEDBACK_FORM_IDS.add("database-backup-settings-form");
SAVE_FEEDBACK_FORM_IDS.add("database-restore-form");

const previousHandleDashboardClickWithDatabaseBackup = handleDashboardClick;
handleDashboardClick = async function handleDashboardClickDatabaseBackupOverride(event) {
    const actionTarget = event.target?.closest?.("[data-action]");
    if (!actionTarget) return previousHandleDashboardClickWithDatabaseBackup(event);
    const action = actionTarget.dataset.action;

    try {
        if (action === "pick-database-backup-directory") {
            const form = document.getElementById("database-backup-settings-form");
            if (!form) return;
            const result = await requestJson("/api/browser/developer/database-backup-directory/select", {
                method: "POST",
                body: { defaultPath: form.elements.defaultDirectory?.value?.trim() || "" },
                auth: true
            });
            form.elements.defaultDirectory.value = result.data?.path || "";
            setFormMessage("database-backup-settings-form", result.message || "已選擇備份資料夾。", "info");
            return;
        }
        if (action === "clear-database-backup-directory") {
            const form = document.getElementById("database-backup-settings-form");
            if (!form) return;
            form.elements.defaultDirectory.value = "";
            setFormMessage("database-backup-settings-form", "已清空備份資料夾，儲存後會使用系統備援位置。", "info");
            return;
        }
        if (action === "run-database-backup-now") {
            const result = await requestJson("/api/browser/developer/database-backup/run", {
                method: "POST",
                auth: true,
                body: {}
            });
            if (result.dashboard) renderDashboard(result.dashboard);
            setMessage(ui.dashboardMessage, result.message || "完整資料庫備份已建立。", "success");
            setFormMessage("database-backup-settings-form", result.message || "完整資料庫備份已建立。", "success");
            return;
        }
        if (action === "pick-database-restore-file") {
            const form = document.getElementById("database-restore-form");
            if (!form) return;
            const result = await requestJson("/api/browser/developer/database-restore-file/select", {
                method: "POST",
                body: { defaultPath: form.elements.sourceFilePath?.value?.trim() || getDatabaseBackupConfig().effectiveDirectory || "" },
                auth: true
            });
            form.elements.sourceFilePath.value = result.data?.path || "";
            setFormMessage("database-restore-form", result.message || "備份檔已選擇。", "info");
            return;
        }
    } catch (error) {
        setMessage(ui.dashboardMessage, error.message, "error");
        const formId = action?.includes("restore") ? "database-restore-form" : "database-backup-settings-form";
        setFormMessage(formId, error.message, "error");
        return;
    }

    return previousHandleDashboardClickWithDatabaseBackup(event);
};

const previousHandleDashboardSubmitWithDatabaseBackup = handleDashboardSubmit;
handleDashboardSubmit = async function handleDashboardSubmitDatabaseBackupOverride(event) {
    const form = event.target instanceof HTMLFormElement
        ? event.target
        : event.target?.closest?.("form");
    const formId = form?.getAttribute("id") || "";

    if (formId !== "database-backup-settings-form" && formId !== "database-restore-form") {
        return previousHandleDashboardSubmitWithDatabaseBackup(event);
    }

    event.preventDefault();
    if (!form) return;
    setFormMessage(formId, "");

    try {
        const values = Object.fromEntries(new FormData(form).entries());
        const endpoint = formId === "database-backup-settings-form"
            ? "/api/browser/developer/database-backup-settings/save"
            : "/api/browser/developer/database-restore/run";
        const body = formId === "database-backup-settings-form"
            ? {
                defaultDirectory: values.defaultDirectory?.trim() || "",
                retentionCount: Number(values.retentionCount) || 30
            }
            : {
                sourceFilePath: values.sourceFilePath?.trim() || "",
                confirmText: values.confirmText?.trim() || ""
            };
        const result = await requestJson(endpoint, {
            method: "POST",
            auth: true,
            body
        });
        if (result.dashboard) renderDashboard(result.dashboard);
        else await reloadDashboard(result.message || "資料庫備份設定已更新。");
        setMessage(ui.dashboardMessage, result.message || "作業已完成。", "success");
        setFormMessage(formId, result.message || "作業已完成。", "success");
    } catch (error) {
        setMessage(ui.dashboardMessage, error.message, "error");
        setFormMessage(formId, error.message, "error");
    }
};

const workspaceSubnavBaseRenderers = {
    admin: {
        people: renderAdminPeopleSection,
        security: renderAdminSecuritySection,
        shifts: renderAdminShiftSection,
        manualPunch: renderAdminManualPunchSection,
        reports: renderAdminReportSection,
        leave: renderAdminLeaveSection,
        system: renderAdminSystemSection,
        bells: renderAdminBellSection,
        themes: renderAdminThemeSection
    },
    developer: {
        automation: renderDeveloperAutomationSection,
        automationLogs: renderDeveloperAutomationLogSection,
        auditLogs: renderDeveloperAuditSection,
        systemSettings: renderDeveloperSystemSettingsSection,
        export: renderDeveloperExportSection,
        status: renderDeveloperStatusSection
    }
};

const workspaceSubnavConfigs = {
    admin: {
        people: {
            introIndexes: [0],
            removeSelectors: ["#employee-import-file"],
            appendHtml: `<input id="employee-import-file" type="file" accept=".csv,text/csv" class="hidden">`,
            groups: [
                {
                    label: "人員主檔",
                    items: [
                        { id: "form", label: "新增 / 編輯員工", panelIndex: 1 },
                        {
                            id: "roster",
                            label: "員工名冊資料",
                            panelIndex: 2,
                            badge: (datasets) => `${filterAdminEmployees(datasets.employees || []).length}/${(datasets.employees || []).length}`
                        }
                    ]
                }
            ]
        },
        security: {
            introIndexes: [0],
            groups: [
                {
                    label: "安全政策",
                    items: [
                        { id: "settings", label: "遠端打卡規則", panelIndex: 1 },
                        { id: "devices", label: "裝置綁定清單", panelIndex: 2 },
                        { id: "recent", label: "最近安全紀錄", panelIndex: 3 }
                    ]
                }
            ]
        },
        shifts: {
            introIndexes: [0],
            groups: [
                {
                    label: "班表基礎",
                    items: [
                        { id: "editor", label: "班別時間設定", panelIndex: 1 }
                    ]
                }
            ]
        },
        manualPunch: {
            introIndexes: [0],
            groups: [
                {
                    label: "考勤修正",
                    items: [
                        { id: "form", label: "補登打卡表單", panelIndex: 1 }
                    ]
                }
            ]
        },
        reports: {
            introIndexes: [0],
            groups: [
                {
                    label: "查詢輸出",
                    items: [
                        { id: "query", label: "查詢條件 / 匯出", panelIndex: 1 },
                        { id: "summary", label: "查詢摘要", panelIndex: 2 },
                        { id: "details", label: "考勤明細", panelIndex: 3 }
                    ]
                }
            ]
        },
        leave: {
            introIndexes: [0],
            groups: [
                {
                    label: "審核作業",
                    items: [
                        {
                            id: "pending",
                            label: "管理部待複核",
                            panelIndex: 1,
                            badge: (datasets) => String(datasets.leave?.pendingAdmin?.length || 0)
                        },
                        {
                            id: "records",
                            label: "請假紀錄",
                            panelIndex: 2,
                            badge: (datasets) => String(datasets.leave?.requests?.length || 0)
                        }
                    ]
                },
                {
                    label: "制度設定",
                    items: [
                        { id: "types", label: "假別設定", panelIndex: 3 },
                        { id: "routes", label: "主管審核路徑", panelIndex: 4 }
                    ]
                }
            ]
        },
        system: {
            introIndexes: [0],
            groups: [
                {
                    label: "系統資料",
                    items: [
                        { id: "display", label: "主畫面資料", panelIndex: 1 },
                        { id: "password", label: "管理者密碼", panelIndex: 2 },
                        { id: "greetings", label: "問候語管理", panelIndex: 3 }
                    ]
                }
            ]
        },
        bells: {
            introIndexes: [0],
            groups: [
                {
                    label: "響鈴作業",
                    items: [
                        { id: "schedules", label: "響鈴場景", panelIndex: 1 },
                        { id: "sounds", label: "聲音庫", panelIndex: 2 },
                        { id: "history", label: "響鈴歷史", panelIndex: 3 }
                    ]
                }
            ]
        },
        themes: {
            introIndexes: [0],
            groups: [
                {
                    label: "視覺排程",
                    items: [
                        { id: "effects", label: "節日特效", panelIndex: 1 },
                        { id: "schedules", label: "主題排程", panelIndex: 2 }
                    ]
                },
                {
                    label: "主題設計",
                    items: [
                        { id: "editor", label: "自訂主題編輯器", panelIndex: 3 }
                    ]
                }
            ]
        }
    },
    developer: {
        automation: {
            introIndexes: [0],
            groups: [
                {
                    label: "任務作業",
                    items: [
                        { id: "form", label: "任務設定", panelIndex: 1 },
                        {
                            id: "tasks",
                            label: "目前任務清單",
                            panelIndex: 2,
                            badge: (datasets) => String((datasets.automationTasks || []).length)
                        }
                    ]
                }
            ]
        },
        automationLogs: {
            introIndexes: [],
            groups: [
                {
                    label: "執行紀錄",
                    items: [
                        {
                            id: "logs",
                            label: "自動化日誌",
                            panelIndex: 0,
                            badge: (datasets) => String((datasets.automationLog || []).length)
                        }
                    ]
                }
            ]
        },
        auditLogs: {
            introIndexes: [],
            groups: [
                {
                    label: "稽核追蹤",
                    items: [
                        { id: "query", label: "查詢條件與紀錄", panelIndex: 0 }
                    ]
                }
            ]
        },
        systemSettings: {
            introIndexes: [],
            groups: [
                {
                    label: "系統權限",
                    items: [
                        { id: "password", label: "系統密碼", panelIndex: 0 },
                        { id: "impersonation", label: "角色切換設定", panelIndex: 1 },
                        { id: "navOrder", label: "主頁籤排序", panelIndex: 2 },
                        { id: "accountAccess", label: "帳號權限管理", panelIndex: 3 }
                    ]
                }
            ]
        },
        export: {
            introIndexes: [0],
            groups: [
                {
                    label: "匯出設定",
                    items: [
                        { id: "directory", label: "自動化匯出資料夾", panelIndex: 1 },
                        { id: "databaseBackup", label: "完整資料庫備份與還原", panelIndex: 2 },
                        { id: "archive", label: "稽核封存策略", panelIndex: 3 },
                        { id: "templates", label: "內建模板", panelIndex: 4 },
                        { id: "custom", label: "自訂格式", panelIndex: 5 }
                    ]
                }
            ]
        },
        status: {
            introIndexes: [],
            groups: [
                {
                    label: "服務監控",
                    items: [
                        { id: "overview", label: "系統健康總覽", panelIndex: 0 },
                        { id: "details", label: "同步與紀錄狀態", panelIndex: 1 },
                        { id: "apiCatalog", label: "API 目錄", panelStartIndex: 2, panelEndIndex: Infinity, emptyText: "目前沒有 API 清單資料。" }
                    ]
                }
            ]
        }
    }
};

function ensureWorkspaceSubnavState(role) {
    if (!state.activeSubSections) state.activeSubSections = {};
    if (!state.activeSubSections[role]) state.activeSubSections[role] = {};
    return state.activeSubSections[role];
}

function flattenWorkspaceSubnavGroups(groups = []) {
    return groups.flatMap((group) => Array.isArray(group.items) ? group.items : []);
}

function getWorkspaceSubnavItemPanelHtml(panels, item) {
    const safePanels = Array.isArray(panels) ? panels : [];
    if (Number.isInteger(item.panelIndex)) return safePanels[item.panelIndex] || "";
    if (Array.isArray(item.panelIndexes)) {
        return item.panelIndexes.map((index) => safePanels[index] || "").filter(Boolean).join("");
    }
    if (Number.isInteger(item.panelStartIndex)) {
        const endIndex = item.panelEndIndex === Infinity ? safePanels.length : Number(item.panelEndIndex);
        return safePanels.slice(item.panelStartIndex, Number.isFinite(endIndex) ? endIndex : safePanels.length).filter(Boolean).join("");
    }
    return "";
}

function warnMissingWorkspaceSubnavPanel(item, panelCount) {
    if (!item || item.panelHtml || item.emptyText) return;
    console.warn("Workspace subsection panel is missing.", {
        subsection: item.id,
        label: item.label,
        panelIndex: item.panelIndex,
        panelIndexes: item.panelIndexes,
        panelStartIndex: item.panelStartIndex,
        panelCount
    });
}

function compactWorkspaceSummaryCard(card) {
    if (!card?.matches?.("article.workspace-card")) return;
    const helperNodes = Array.from(card.children).filter((child) => child.matches?.("p.helper-text"));
    const description = helperNodes
        .map((node) => String(node.textContent || "").trim())
        .filter(Boolean)
        .join("\n\n");
    helperNodes.forEach((node) => node.remove());
    card.classList.add("workspace-summary-card");
    if (!description) return;

    const toolbar = card.querySelector(":scope > .list-toolbar");
    if (!toolbar) return;
    const title = card.querySelector("h3")?.textContent?.trim() || "頁籤";
    let actionHost = toolbar.querySelector(":scope > .badge-row");
    if (!actionHost) {
        actionHost = document.createElement("div");
        actionHost.className = "badge-row";
        toolbar.appendChild(actionHost);
    }
    const helpButton = document.createElement("button");
    helpButton.type = "button";
    helpButton.className = "outline-btn workspace-summary-help-btn";
    helpButton.dataset.action = "open-workspace-summary-help";
    helpButton.dataset.title = title;
    helpButton.dataset.description = description;
    helpButton.textContent = "說明";
    actionHost.appendChild(helpButton);
}

function parseWorkspaceSubnavPanels(baseHtml, config = {}) {
    if (typeof document === "undefined") return { panels: [], introHtml: "" };
    const template = document.createElement("template");
    template.innerHTML = String(baseHtml || "").trim();
    (config.removeSelectors || []).forEach((selector) => {
        template.content.querySelectorAll(selector).forEach((node) => node.remove());
    });

    const stack = template.content.querySelector(".workspace-stack") || template.content;
    const panelNodes = Array.from(stack.children).flatMap((child) => {
        if (child.matches?.("article")) return [child];
        if (child.matches?.(".split-panels")) {
            return Array.from(child.children).filter((node) => node.matches?.("article"));
        }
        return [];
    });

    panelNodes.forEach((node) => node.setAttribute("data-no-collapsible", "true"));
    const introIndexes = Array.isArray(config.introIndexes) ? config.introIndexes : [0];
    introIndexes.forEach((index) => compactWorkspaceSummaryCard(panelNodes[index]));
    const panels = panelNodes.map((node) => node.outerHTML);
    const introHtml = introIndexes.map((index) => panels[index] || "").filter(Boolean).join("");
    return { panels, introHtml };
}

function prepareWorkspaceSubnavGroups(config, panels, datasets) {
    return (config.groups || []).map((group) => {
        const items = (group.items || []).map((item) => {
            const html = getWorkspaceSubnavItemPanelHtml(panels, item);
            const preparedItem = {
                ...item,
                badgeText: typeof item.badge === "function" ? item.badge(datasets || {}) : item.badge,
                panelHtml: html || (item.emptyText ? renderEmptyState(item.emptyText) : "")
            };
            warnMissingWorkspaceSubnavPanel(preparedItem, panels.length);
            return preparedItem;
        }).filter((item) => item.panelHtml);
        return { ...group, items };
    }).filter((group) => group.items.length);
}

function getActiveWorkspaceSubnavItem(role, sectionId, groups) {
    const items = flattenWorkspaceSubnavGroups(groups);
    const scopedState = ensureWorkspaceSubnavState(role);
    if (!items.length) return null;
    if (!items.some((item) => item.id === scopedState[sectionId])) {
        scopedState[sectionId] = items[0].id;
    }
    return items.find((item) => item.id === scopedState[sectionId]) || items[0];
}

function renderWorkspaceSubnav(role, sectionId, groups, activeItem) {
    return `
        <aside class="workspace-subnav-sidebar" aria-label="${escapeHtml(sectionId)} 子導覽">
            <div class="workspace-subnav-card">
                ${groups.map((group) => `
                    <div class="workspace-subnav-group">
                        <p class="workspace-subnav-group-title">${escapeHtml(group.label || "")}</p>
                        <div class="workspace-subnav-items">
                            ${(group.items || []).map((item) => `
                                <button
                                    type="button"
                                    class="workspace-subnav-item ${activeItem?.id === item.id ? "is-active" : ""}"
                                    data-action="switch-workspace-subsection"
                                    data-role="${escapeHtml(role)}"
                                    data-section="${escapeHtml(sectionId)}"
                                    data-subsection="${escapeHtml(item.id)}"
                                    aria-current="${activeItem?.id === item.id ? "page" : "false"}"
                                >
                                    <span>${escapeHtml(item.label || "")}</span>
                                    ${item.badgeText ? `<span class="workspace-subnav-badge">${escapeHtml(item.badgeText)}</span>` : ""}
                                </button>
                            `).join("")}
                        </div>
                    </div>
                `).join("")}
            </div>
        </aside>
    `;
}

function renderWorkspaceSubnavSection(role, sectionId, datasets, config, baseRenderer) {
    if (!config || typeof baseRenderer !== "function") return typeof baseRenderer === "function" ? baseRenderer(datasets) : "";
    const baseHtml = baseRenderer(datasets);
    const { panels, introHtml } = parseWorkspaceSubnavPanels(baseHtml, config);
    const groups = prepareWorkspaceSubnavGroups(config, panels, datasets);
    const activeItem = getActiveWorkspaceSubnavItem(role, sectionId, groups);
    if (!activeItem) return baseHtml;

    return `
        <div class="workspace-stack workspace-subnav-stack" data-workspace-role="${escapeHtml(role)}" data-workspace-section="${escapeHtml(sectionId)}">
            ${introHtml}
            <div class="workspace-subnav-layout">
                ${renderWorkspaceSubnav(role, sectionId, groups, activeItem)}
                <section class="workspace-subnav-content" aria-live="polite">
                    ${activeItem.panelHtml}
                </section>
            </div>
            ${config.appendHtml || ""}
        </div>
    `;
}

Object.entries(workspaceSubnavConfigs.admin).forEach(([sectionId, config]) => {
    const baseRenderer = workspaceSubnavBaseRenderers.admin[sectionId];
    if (typeof baseRenderer !== "function") return;
    if (sectionId === "people") {
        renderAdminPeopleSection = (datasets) => renderWorkspaceSubnavSection("admin", sectionId, datasets, config, baseRenderer);
    } else if (sectionId === "security") {
        renderAdminSecuritySection = (datasets) => renderWorkspaceSubnavSection("admin", sectionId, datasets, config, baseRenderer);
    } else if (sectionId === "shifts") {
        renderAdminShiftSection = (datasets) => renderWorkspaceSubnavSection("admin", sectionId, datasets, config, baseRenderer);
    } else if (sectionId === "manualPunch") {
        renderAdminManualPunchSection = (datasets) => renderWorkspaceSubnavSection("admin", sectionId, datasets, config, baseRenderer);
    } else if (sectionId === "reports") {
        renderAdminReportSection = (datasets) => renderWorkspaceSubnavSection("admin", sectionId, datasets, config, baseRenderer);
    } else if (sectionId === "leave") {
        renderAdminLeaveSection = (datasets) => renderWorkspaceSubnavSection("admin", sectionId, datasets, config, baseRenderer);
    } else if (sectionId === "system") {
        renderAdminSystemSection = (datasets) => renderWorkspaceSubnavSection("admin", sectionId, datasets, config, baseRenderer);
    } else if (sectionId === "bells") {
        renderAdminBellSection = (datasets) => renderWorkspaceSubnavSection("admin", sectionId, datasets, config, baseRenderer);
    } else if (sectionId === "themes") {
        renderAdminThemeSection = (datasets) => renderWorkspaceSubnavSection("admin", sectionId, datasets, config, baseRenderer);
    }
});

Object.entries(workspaceSubnavConfigs.developer).forEach(([sectionId, config]) => {
    const baseRenderer = workspaceSubnavBaseRenderers.developer[sectionId];
    if (typeof baseRenderer !== "function") return;
    if (sectionId === "automation") {
        renderDeveloperAutomationSection = (datasets) => renderWorkspaceSubnavSection("developer", sectionId, datasets, config, baseRenderer);
    } else if (sectionId === "automationLogs") {
        renderDeveloperAutomationLogSection = (datasets) => renderWorkspaceSubnavSection("developer", sectionId, datasets, config, baseRenderer);
    } else if (sectionId === "auditLogs") {
        renderDeveloperAuditSection = (datasets) => renderWorkspaceSubnavSection("developer", sectionId, datasets, config, baseRenderer);
    } else if (sectionId === "systemSettings") {
        renderDeveloperSystemSettingsSection = (datasets) => renderWorkspaceSubnavSection("developer", sectionId, datasets, config, baseRenderer);
    } else if (sectionId === "export") {
        renderDeveloperExportSection = (datasets) => renderWorkspaceSubnavSection("developer", sectionId, datasets, config, baseRenderer);
    } else if (sectionId === "status") {
        renderDeveloperStatusSection = (datasets) => renderWorkspaceSubnavSection("developer", sectionId, datasets, config, baseRenderer);
    }
});

function activateWorkspaceSubsection(role, sectionId, subsectionId) {
    if (!role || !sectionId || !subsectionId) return;
    ensureWorkspaceSubnavState(role)[sectionId] = subsectionId;
}

const workspaceSubnavEditRoutes = {
    "edit-employee": { role: "admin", section: "people", subsection: "form", run: (target) => fillEmployeeForm(target.dataset.id) },
    "edit-greeting": { role: "admin", section: "system", subsection: "greetings", run: (target) => fillGreetingForm(target.dataset.id) },
    "edit-bell": { role: "admin", section: "bells", subsection: "schedules", run: (target) => fillBellForm(target.dataset.id) },
    "edit-effect": { role: "admin", section: "themes", subsection: "effects", run: (target) => fillEffectForm(target.dataset.id) },
    "edit-theme-schedule": { role: "admin", section: "themes", subsection: "schedules", run: (target) => fillThemeScheduleForm(target.dataset.id) },
    "edit-custom-theme": { role: "admin", section: "themes", subsection: "editor", run: (target) => fillCustomThemeForm(target.dataset.id) },
    "edit-automation-task": { role: "developer", section: "automation", subsection: "form", run: (target) => fillAutomationForm(target.dataset.id) }
};

const originalHandleDashboardClickWithWorkspaceSubnav = handleDashboardClick;
handleDashboardClick = async function handleDashboardClickWorkspaceSubnavOverride(event) {
    const actionTarget = event.target?.closest?.("[data-action]");
    if (!actionTarget) return originalHandleDashboardClickWithWorkspaceSubnav(event);
    const action = actionTarget.dataset.action;

    if (action === "switch-workspace-subsection") {
        event.preventDefault();
        activateWorkspaceSubsection(actionTarget.dataset.role, actionTarget.dataset.section, actionTarget.dataset.subsection);
        renderDashboard(state.dashboard);
        return;
    }

    if (action === "open-workspace-summary-help") {
        event.preventDefault();
        openWorkspaceSummaryHelpModal(actionTarget.dataset.title || "", actionTarget.dataset.description || "");
        return;
    }

    if (action === "jump-leave-routes") {
        activateWorkspaceSubsection("admin", "leave", "routes");
        return originalHandleDashboardClickWithWorkspaceSubnav(event);
    }

    const editRoute = workspaceSubnavEditRoutes[action];
    if (editRoute) {
        event.preventDefault();
        activateWorkspaceSubsection(editRoute.role, editRoute.section, editRoute.subsection);
        state.activeSections[editRoute.role] = editRoute.section;
        renderDashboard(state.dashboard);
        requestAnimationFrame(() => {
            try {
                editRoute.run(actionTarget);
            } catch (error) {
                console.error("Failed to run workspace subsection edit action.", error);
                setMessage(ui.dashboardMessage, error.message || "切換到編輯表單時發生錯誤。", "error");
            }
        });
        return;
    }

    return originalHandleDashboardClickWithWorkspaceSubnav(event);
};

function initialize() {
    ui.roleSelector.addEventListener("click", (event) => {
        const button = event.target.closest("[data-role]");
        if (!button) return;
        setActiveRole(button.dataset.role);
    });

    ui.loginForm.addEventListener("submit", handleLoginSubmit);
    ui.heroDescriptionEditBtn?.addEventListener("click", startHeroDescriptionEdit);
    ui.heroDescriptionCancelBtn?.addEventListener("click", cancelHeroDescriptionEdit);
    ui.heroDescriptionForm?.addEventListener("submit", handleDashboardSubmit);
    ui.dashboardHelpBtn?.addEventListener("click", openDashboardHelpModal);
    ui.dashboardHelpCloseBtn?.addEventListener("click", closeDashboardHelpModal);
    ui.dashboardInsightCloseBtn?.addEventListener("click", closeDashboardInsightModal);
    ui.dashboardHelpModal?.addEventListener("click", (event) => {
        if (event.target === ui.dashboardHelpModal) closeDashboardHelpModal();
    });
    ui.dashboardInsightModal?.addEventListener("click", (event) => {
        if (event.target === ui.dashboardInsightModal) closeDashboardInsightModal();
    });
    ui.dashboardInsightContent?.addEventListener("change", handleDashboardInsightChange);
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeDashboardHelpModal();
            closeDashboardInsightModal();
        }
    });
    ui.logoutBtn.addEventListener("click", () => handleLogout());
    ui.dashboardContent.addEventListener("click", handleDashboardClick);
    ui.dashboardContent.addEventListener("change", handleDashboardChange);
    ui.dashboardContent.addEventListener("dragstart", handleWorkspaceNavOrderDragStart);
    ui.dashboardContent.addEventListener("dragover", handleWorkspaceNavOrderDragOver);
    ui.dashboardContent.addEventListener("drop", handleWorkspaceNavOrderDrop);
    ui.dashboardContent.addEventListener("dragend", handleWorkspaceNavOrderDragEnd);
    ui.dashboardContent.addEventListener("keydown", handleEmployeeCardCaptureKeydown);
    ui.dashboardContent.addEventListener("focusin", handleEmployeeCardCaptureFocus);
    // Use capture so dynamically-rendered forms always reach the shared submit handler.
    ui.dashboardContent.addEventListener("submit", handleDashboardSubmit, true);
    ui.dashboardContent.addEventListener("input", (event) => {
        if (event.target.id === "employee-card-capture-input") {
            handleEmployeeCardCaptureInput(event);
            return;
        }
        if (event.target.id === "employee-filter-query") {
            ensureAdminPeopleFilters().query = event.target.value || "";
            refreshEmployeeDirectoryView();
            return;
        }
        if (event.target.id === "account-access-search") {
            filterAccountAccessRows();
            return;
        }
        const dataTable = event.target.closest(".data-table");
        if (dataTable) {
            scheduleDataTableColumnFit(dataTable);
        }
        if (event.target.closest("#custom-theme-form")) updateThemePreviewFromForm();
    });
    window.addEventListener("resize", () => scheduleDataTableColumnFit(document));

    setActiveRole(state.activeRole);
    syncHeroHeader();
    loadPublicDisplaySettings();
    restoreSessionIfNeeded();
}

document.addEventListener("DOMContentLoaded", initialize);
