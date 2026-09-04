const ATTENDANCE_EXPORT_FIELD_DEFINITIONS = [
  { id: 'employeeId', label: '工號', description: '員工工號 / 主要識別碼' },
  { id: 'employeeName', label: '姓名', description: '員工姓名' },
  { id: 'department', label: '部門', description: '員工所屬部門' },
  { id: 'jobTitle', label: '職稱', description: '員工職稱' },
  { id: 'dateText', label: '日期', description: '本地日期（YYYY-MM-DD）' },
  { id: 'timeText', label: '時間', description: '本地時間（HH:mm:ss）' },
  { id: 'timestamp', label: '原始時間戳(毫秒)', description: 'Unix Epoch 毫秒值，適合系統串接與對帳' },
  { id: 'shift', label: '班別', description: '此次打卡所屬班別' },
  { id: 'typeText', label: '打卡類型', description: '上班 / 下班' },
  { id: 'attendanceStatusText', label: '系統狀態', description: '正常 / 重複打卡等系統判斷結果' },
  { id: 'sourceText', label: '來源', description: '現場感應、密碼輸入、手動補登、遠端介接、瀏覽器打卡' },
  { id: 'recordKindText', label: '紀錄類型', description: '打卡 / 請假，用來讓薪資與 ERP 分流解析' },
  { id: 'leaveTypeName', label: '假別', description: '請假紀錄的假別名稱，非請假紀錄留空' },
  { id: 'leaveStartText', label: '請假開始', description: '請假當日區段開始時間' },
  { id: 'leaveEndText', label: '請假結束', description: '請假當日區段結束時間' },
  { id: 'leaveDurationHours', label: '請假時數', description: '請假當日區段核准時數，可含 0.5 小時' },
  { id: 'leaveRequestId', label: '假單編號', description: '對應原始請假申請單號' },
  // ★ [1] 新版手動薪資明細在既有請假欄位後追加核准加班單欄位，舊模板欄位順序保持不變。
  { id: 'overtimeStartText', label: '加班開始', description: '核准加班當日區段開始時間' },
  { id: 'overtimeEndText', label: '加班結束', description: '核准加班當日區段結束時間' },
  { id: 'overtimeDurationHours', label: '核准加班時數', description: '核准加班當日區段時數，不代表實際出勤時數' },
  { id: 'overtimeRequestId', label: '加班單編號', description: '對應原始加班申請單號' },
  { id: 'overtimeReason', label: '加班原因', description: '加班申請填寫的原因' },
  { id: 'overtimeStatusText', label: '加班狀態', description: '薪資明細只會輸出已核准加班' },
  { id: 'overtimeApprovalModeText', label: '加班核准方式', description: '本人申請、主管代申請或紙本補登流程' }
];

const ATTENDANCE_EXPORT_TARGETS = [
  'last_week_records',
  'last_month_records',
  'manual_records',
  'all_records'
];

const DEFAULT_ATTENDANCE_EXPORT_TEMPLATE_ID = 'full';
const DEFAULT_CUSTOM_EXPORT_FIELDS = [
  'employeeId',
  'employeeName',
  'department',
  'jobTitle',
  'dateText',
  'timeText',
  'timestamp',
  'shift',
  'typeText',
  'attendanceStatusText',
  'sourceText'
];

const ATTENDANCE_SOURCE_LABELS = {
  auto: '現場感應',
  password: '密碼輸入',
  manual: '手動補登',
  api: '遠端介接',
  browser: '瀏覽器打卡',
  leave: '請假模組',
  overtime: '加班模組'
};

const ATTENDANCE_EXPORT_TEMPLATE_DEFINITIONS = [
  {
    id: 'payroll',
    label: '薪資系統',
    description: '固定提供薪資與人資匯入最常用的穩定欄位。',
    fieldIds: ['employeeId', 'employeeName', 'department', 'jobTitle', 'dateText', 'timeText', 'shift', 'typeText', 'attendanceStatusText']
  },
  {
    id: 'anomaly',
    label: '異常稽核',
    description: '保留時間戳與來源，方便追查重複打卡、補登與外部介接來源。',
    fieldIds: ['employeeId', 'employeeName', 'dateText', 'timeText', 'timestamp', 'shift', 'typeText', 'attendanceStatusText', 'sourceText']
  },
  {
    id: 'analysis',
    label: '報表分析',
    description: '保留部門、職稱與來源，適合統計與交叉分析。',
    fieldIds: ['employeeId', 'employeeName', 'department', 'jobTitle', 'dateText', 'timeText', 'shift', 'typeText', 'attendanceStatusText', 'sourceText']
  },
  {
    id: 'payroll_leave',
    label: '薪資含請假明細',
    description: '保留薪資系統既有欄位，並追加假別、起訖、時數與假單編號。',
    fieldIds: ['employeeId', 'employeeName', 'department', 'jobTitle', 'dateText', 'timeText', 'shift', 'typeText', 'attendanceStatusText', 'sourceText', 'recordKindText', 'leaveTypeName', 'leaveStartText', 'leaveEndText', 'leaveDurationHours', 'leaveRequestId']
  },
  // ★ [2] 新增管理者手動匯出專用模板；不放入自動化模板清單，避免舊自動化流程輸出同名但不同資料。
  {
    id: 'payroll_leave_overtime',
    label: '薪資請假／加班明細',
    description: '保留既有薪資請假欄位，並追加已核准加班的起訖、時數、單號、原因與流程。',
    manualReportOnly: true,
    fieldIds: ['employeeId', 'employeeName', 'department', 'jobTitle', 'dateText', 'timeText', 'shift', 'typeText', 'attendanceStatusText', 'sourceText', 'recordKindText', 'leaveTypeName', 'leaveStartText', 'leaveEndText', 'leaveDurationHours', 'leaveRequestId', 'overtimeStartText', 'overtimeEndText', 'overtimeDurationHours', 'overtimeRequestId', 'overtimeReason', 'overtimeStatusText', 'overtimeApprovalModeText']
  },
  {
    id: 'full',
    label: '完整格式',
    description: '輸出既有完整欄位，保持舊版 ERP 解析相容。',
    fieldIds: DEFAULT_CUSTOM_EXPORT_FIELDS
  },
  {
    id: 'custom',
    label: '自訂格式',
    description: '依開發控制台勾選欄位輸出。',
    fieldIds: DEFAULT_CUSTOM_EXPORT_FIELDS
  }
];

const FIELD_DEFINITION_MAP = new Map(
  ATTENDANCE_EXPORT_FIELD_DEFINITIONS.map((field) => [field.id, field])
);

const TEMPLATE_DEFINITION_MAP = new Map(
  ATTENDANCE_EXPORT_TEMPLATE_DEFINITIONS.map((template) => [template.id, template])
);

function padDatePart(value) {
  return String(value).padStart(2, '0');
}

function isValidTimestamp(value) {
  return Number.isFinite(Number(value));
}

function formatCsvDate(timestamp) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function formatCsvTime(timestamp) {
  const date = new Date(timestamp);
  return `${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}:${padDatePart(date.getSeconds())}`;
}

function escapeCsvValue(value) {
  const text = String(value ?? '');
  // ★ [3] 防止員工姓名、請假／加班原因等可輸入文字在 Excel 開啟 CSV 時被當成公式執行。
  const spreadsheetSafeText = /^[\u0000-\u0020]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${spreadsheetSafeText.replace(/"/g, '""')}"`;
}

function normalizeAttendanceExportTemplateId(templateId) {
  const normalizedTemplateId = String(templateId || DEFAULT_ATTENDANCE_EXPORT_TEMPLATE_ID).trim();
  return TEMPLATE_DEFINITION_MAP.has(normalizedTemplateId)
    ? normalizedTemplateId
    : DEFAULT_ATTENDANCE_EXPORT_TEMPLATE_ID;
}

function normalizeAttendanceExportCustomFields(fieldIds) {
  if (!Array.isArray(fieldIds)) {
    return [...DEFAULT_CUSTOM_EXPORT_FIELDS];
  }

  const normalizedFieldIds = [];
  fieldIds.forEach((fieldId) => {
    const normalizedFieldId = String(fieldId || '').trim();
    if (!FIELD_DEFINITION_MAP.has(normalizedFieldId)) return;
    if (normalizedFieldIds.includes(normalizedFieldId)) return;
    normalizedFieldIds.push(normalizedFieldId);
  });

  return normalizedFieldIds.length
    ? normalizedFieldIds
    : [...DEFAULT_CUSTOM_EXPORT_FIELDS];
}

function getAttendanceTypeLabel(type) {
  if (type === 'in') return '上班';
  if (type === 'out') return '下班';
  if (type === 'leave') return '請假';
  if (type === 'overtime') return '加班';
  return String(type || '');
}

function getAttendanceStatusLabel(status) {
  const normalizedStatus = String(status || '正常').trim();
  if (!normalizedStatus || normalizedStatus === 'normal' || normalizedStatus === '正常') {
    return '正常';
  }
  if (normalizedStatus === 'duplicate' || normalizedStatus === '重複打卡') {
    return '重複打卡';
  }
  if (normalizedStatus === 'approved_leave' || normalizedStatus === '已核准請假') {
    return '已核准請假';
  }
  if (normalizedStatus === 'approved_overtime' || normalizedStatus === '已核准加班') {
    return '已核准加班';
  }
  return normalizedStatus;
}

function getAttendanceSourceLabel(source) {
  return ATTENDANCE_SOURCE_LABELS[source] || String(source || ATTENDANCE_SOURCE_LABELS.auto);
}

function getAttendanceExportTemplateDefinitions(customFieldIds = DEFAULT_CUSTOM_EXPORT_FIELDS, options = {}) {
  const normalizedCustomFieldIds = normalizeAttendanceExportCustomFields(customFieldIds);
  return ATTENDANCE_EXPORT_TEMPLATE_DEFINITIONS
    .filter((template) => options.includeManualReportTemplates === true || !template.manualReportOnly)
    .map((template) => {
      const fieldIds = template.id === 'custom'
        ? normalizedCustomFieldIds
        : [...template.fieldIds];

      return {
        id: template.id,
        label: template.label,
        description: template.description,
        fieldIds,
        fields: fieldIds
          .map((fieldId) => FIELD_DEFINITION_MAP.get(fieldId))
          .filter(Boolean)
          .map((field) => ({ ...field }))
      };
    });
}

function getAttendanceExportTemplateLabel(templateId) {
  const normalizedTemplateId = normalizeAttendanceExportTemplateId(templateId);
  return TEMPLATE_DEFINITION_MAP.get(normalizedTemplateId)?.label || TEMPLATE_DEFINITION_MAP.get(DEFAULT_ATTENDANCE_EXPORT_TEMPLATE_ID).label;
}

function resolveAttendanceExportFieldIds(templateId, customFieldIds = DEFAULT_CUSTOM_EXPORT_FIELDS) {
  const normalizedTemplateId = normalizeAttendanceExportTemplateId(templateId);
  if (normalizedTemplateId === 'custom') {
    return normalizeAttendanceExportCustomFields(customFieldIds);
  }
  return [...(TEMPLATE_DEFINITION_MAP.get(normalizedTemplateId)?.fieldIds || DEFAULT_CUSTOM_EXPORT_FIELDS)];
}

function isAttendanceExportTarget(target) {
  return ATTENDANCE_EXPORT_TARGETS.includes(String(target || '').trim());
}

function normalizeEmployeeId(record) {
  return String(record?.employeeId ?? record?.id ?? '').trim();
}

function resolveRecordTimestamp(record) {
  if (isValidTimestamp(record?.timestamp)) {
    return Number(record.timestamp);
  }
  return null;
}

function normalizeAttendanceRecord(record, employeeMap) {
  const employeeId = normalizeEmployeeId(record);
  const employee = employeeMap.get(employeeId) || {};
  const timestamp = resolveRecordTimestamp(record);

  return {
    employeeId,
    employeeName: String(record?.employeeName ?? employee.name ?? '未知員工'),
    department: String(record?.department ?? employee.department ?? ''),
    jobTitle: String(record?.jobTitle ?? record?.job_title ?? employee.job_title ?? ''),
    dateText: String(record?.dateText ?? (timestamp !== null ? formatCsvDate(timestamp) : '')),
    timeText: String(record?.timeText ?? (timestamp !== null ? formatCsvTime(timestamp) : '')),
    timestamp: timestamp !== null ? String(timestamp) : '',
    shift: String(record?.shift ?? ''),
    typeText: String(record?.typeText ?? (record?.type ? getAttendanceTypeLabel(record.type) : '')),
    attendanceStatusText: String(record?.attendanceStatusText ?? (record?.status ? getAttendanceStatusLabel(record.status) : getAttendanceStatusLabel())),
    sourceText: String(record?.sourceText ?? (record?.source ? getAttendanceSourceLabel(record.source) : getAttendanceSourceLabel())),
    recordKindText: String(record?.recordKindText ?? (
      record?.recordKind === 'leave' || record?.type === 'leave'
        ? '請假'
        : record?.recordKind === 'overtime' || record?.type === 'overtime'
          ? '加班'
          : '打卡'
    )),
    leaveTypeName: String(record?.leaveTypeName ?? ''),
    leaveStartText: String(record?.leaveStartText ?? ''),
    leaveEndText: String(record?.leaveEndText ?? ''),
    leaveDurationHours: record?.leaveDurationHours === undefined || record?.leaveDurationHours === null
      ? ''
      : String(record.leaveDurationHours),
    leaveRequestId: String(record?.leaveRequestId ?? ''),
    overtimeStartText: String(record?.overtimeStartText ?? ''),
    overtimeEndText: String(record?.overtimeEndText ?? ''),
    overtimeDurationHours: record?.overtimeDurationHours === undefined || record?.overtimeDurationHours === null
      ? ''
      : String(record.overtimeDurationHours),
    overtimeRequestId: String(record?.overtimeRequestId ?? ''),
    overtimeReason: String(record?.overtimeReason ?? ''),
    overtimeStatusText: String(record?.overtimeStatusText ?? ''),
    overtimeApprovalModeText: String(record?.overtimeApprovalModeText ?? '')
  };
}

function buildAttendanceExportCsv(records, employees = [], options = {}) {
  const employeeMap = new Map(
    (employees || []).map((employee) => [String(employee.id || '').trim(), employee])
  );
  const fieldIds = resolveAttendanceExportFieldIds(options.templateId, options.customFieldIds);
  const fieldDefinitions = fieldIds
    .map((fieldId) => FIELD_DEFINITION_MAP.get(fieldId))
    .filter(Boolean);

  const sortedRecords = [...(records || [])].sort((left, right) => {
    const leftTimestamp = resolveRecordTimestamp(left);
    const rightTimestamp = resolveRecordTimestamp(right);
    if (leftTimestamp === null && rightTimestamp === null) return 0;
    if (leftTimestamp === null) return 1;
    if (rightTimestamp === null) return -1;
    return leftTimestamp - rightTimestamp;
  });

  const rows = sortedRecords.map((record) => {
    const normalizedRecord = normalizeAttendanceRecord(record, employeeMap);
    return fieldIds
      .map((fieldId) => escapeCsvValue(normalizedRecord[fieldId]))
      .join(',');
  });

  return `${fieldDefinitions.map((field) => field.label).join(',')}\r\n${rows.join('\r\n')}`;
}

module.exports = {
  ATTENDANCE_EXPORT_FIELD_DEFINITIONS,
  ATTENDANCE_EXPORT_TARGETS,
  DEFAULT_ATTENDANCE_EXPORT_TEMPLATE_ID,
  DEFAULT_CUSTOM_EXPORT_FIELDS,
  buildAttendanceExportCsv,
  getAttendanceExportTemplateDefinitions,
  getAttendanceExportTemplateLabel,
  getAttendanceSourceLabel,
  getAttendanceStatusLabel,
  getAttendanceTypeLabel,
  isAttendanceExportTarget,
  normalizeAttendanceExportCustomFields,
  normalizeAttendanceExportTemplateId
};
