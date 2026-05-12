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
  { id: 'sourceText', label: '來源', description: '現場感應、密碼輸入、手動補登、遠端介接、瀏覽器打卡' }
];

const ATTENDANCE_EXPORT_TARGETS = [
  'last_week_records',
  'last_month_records',
  'manual_records',
  'all_records'
];

const DEFAULT_ATTENDANCE_EXPORT_TEMPLATE_ID = 'full';
const DEFAULT_CUSTOM_EXPORT_FIELDS = ATTENDANCE_EXPORT_FIELD_DEFINITIONS.map((field) => field.id);

const ATTENDANCE_SOURCE_LABELS = {
  auto: '現場感應',
  password: '密碼輸入',
  manual: '手動補登',
  api: '遠端介接',
  browser: '瀏覽器打卡',
  leave: '請假模組'
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
    id: 'full',
    label: '完整格式',
    description: '輸出全部支援欄位，適合完整封存與複雜整合。',
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
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
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
  return normalizedStatus;
}

function getAttendanceSourceLabel(source) {
  return ATTENDANCE_SOURCE_LABELS[source] || String(source || ATTENDANCE_SOURCE_LABELS.auto);
}

function getAttendanceExportTemplateDefinitions(customFieldIds = DEFAULT_CUSTOM_EXPORT_FIELDS) {
  const normalizedCustomFieldIds = normalizeAttendanceExportCustomFields(customFieldIds);
  return ATTENDANCE_EXPORT_TEMPLATE_DEFINITIONS.map((template) => {
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
    typeText: String(record?.type ? getAttendanceTypeLabel(record.type) : (record?.typeText ?? '')),
    attendanceStatusText: String(record?.status ? getAttendanceStatusLabel(record.status) : (record?.attendanceStatusText ?? getAttendanceStatusLabel())),
    sourceText: String(record?.source ? getAttendanceSourceLabel(record.source) : (record?.sourceText ?? getAttendanceSourceLabel()))
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
