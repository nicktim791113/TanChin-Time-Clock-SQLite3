const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');
const Database = require('better-sqlite3');

const db = require('../database');
const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'tanchin-paper-correction-'));
const databasePath = path.join(tempDirectory, 'test.sqlite');
const timestamp = 1760000000000;

function loadApprovalSteps(tableName, requestId) {
  const allowedTables = new Set(['leave_approval_steps', 'overtime_approval_steps']);
  assert.ok(allowedTables.has(tableName));
  const inspectionDb = new Database(databasePath, { readonly: true });
  try {
    return inspectionDb.prepare(`
      SELECT step_order, reviewer_role, reviewer_id, status, comment, decided_at, created_at
      FROM ${tableName}
      WHERE request_id = ?
      ORDER BY step_order
    `).all(requestId);
  } finally {
    inspectionDb.close();
  }
}

function auditLog(targetType, targetId, beforeData, afterData) {
  return {
    timestamp: Date.now(),
    actor_id: 'admin-1',
    actor_name: '測試管理者',
    role: 'admin',
    channel: 'browser',
    action: 'correct',
    target_type: targetType,
    target_id: targetId,
    summary: `修正 ${targetId}`,
    before_data: beforeData,
    after_data: afterData,
    success: true
  };
}

function createPaperLeave(id, overrides = {}) {
  db.createLeaveRequest({
    id,
    employee_id: 'E001',
    leave_type_id: 'annual',
    start_at: timestamp,
    end_at: timestamp + 3600000,
    duration_hours: 1,
    reason: '原請假原因',
    status: 'approved',
    supervisor_id: 'S001',
    supervisor_decision: 'approved',
    supervisor_comment: '原備註',
    supervisor_decided_at: timestamp,
    admin_decision_by: 'admin-1',
    admin_comment: '原備註',
    admin_decided_at: timestamp,
    approval_mode: 'admin_paper_approved',
    paper_no: 'L-001',
    paper_approved_by: '主管甲',
    paper_comment: '原紙本備註',
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides
  });
}

function createPaperOvertime(id, overrides = {}) {
  db.createOvertimeRequest({
    id,
    employee_id: 'E001',
    applicant_id: 'admin-1',
    applicant_role: 'admin_paper_proxy',
    start_at: timestamp,
    end_at: timestamp + 3600000,
    duration_hours: 1,
    reason: '原加班原因',
    status: 'approved',
    supervisor_id: 'admin-1',
    supervisor_decision: 'approved',
    supervisor_comment: '原備註',
    supervisor_decided_at: timestamp,
    approval_mode: 'admin_paper_approved',
    paper_no: 'O-001',
    paper_approved_by: '主管甲',
    paper_comment: '原紙本備註',
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides
  });
}

before(() => db.init(databasePath));
after(() => {
  db.close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

test('紙本請假修正會保留同一 id、筆數，並寫入完整前後稽核', () => {
  createPaperLeave('leave-paper-1', { corrected_from_request_id: 'legacy-leave-source' });
  const beforeData = db.getLeaveRequestById('leave-paper-1');
  const updates = {
    employee_id: 'E002', leave_type_id: 'sick', start_at: timestamp + 7200000,
    end_at: timestamp + 14400000, duration_hours: 2, reason: '修正後請假原因',
    supervisor_id: 'S002', supervisor_decision: 'approved', supervisor_comment: '修正後備註',
    supervisor_decided_at: timestamp + 1, admin_decision_by: 'admin-1', admin_comment: '修正後備註',
    admin_decided_at: timestamp + 1, paper_no: 'L-002', paper_approved_by: '主管乙',
    paper_comment: '修正後紙本備註', updated_at: timestamp + 1
  };
  const updated = db.updatePaperLeaveRequest({
    requestId: beforeData.id,
    updates,
    auditLog: auditLog('leave_request', beforeData.id, beforeData, { ...beforeData, ...updates })
  });

  assert.equal(updated.id, beforeData.id);
  assert.equal(updated.status, 'approved');
  assert.equal(updated.created_at, beforeData.created_at);
  assert.equal(updated.corrected_from_request_id, 'legacy-leave-source');
  assert.equal(db.countLeaveRequests({}), 1);
  assert.deepEqual(loadApprovalSteps('leave_approval_steps', beforeData.id), [
    {
      step_order: 1,
      reviewer_role: 'supervisor',
      reviewer_id: 'S002',
      status: 'approved',
      comment: '修正後備註',
      decided_at: timestamp + 1,
      created_at: timestamp
    },
    {
      step_order: 2,
      reviewer_role: 'admin',
      reviewer_id: 'admin-1',
      status: 'approved',
      comment: '修正後備註',
      decided_at: timestamp + 1,
      created_at: timestamp
    }
  ]);
  const audit = db.queryAuditLogs({}).find((entry) => entry.target_id === beforeData.id && entry.action === 'correct');
  assert.deepEqual(audit.before_data, beforeData);
  assert.deepEqual(audit.after_data, { ...beforeData, ...updates });
});

test('稽核寫入失敗時，紙本請假修正會回滾', () => {
  const beforeData = db.getLeaveRequestById('leave-paper-1');
  const beforeSteps = loadApprovalSteps('leave_approval_steps', beforeData.id);
  assert.throws(() => db.updatePaperLeaveRequest({
    requestId: beforeData.id,
    updates: {
      ...beforeData,
      reason: '不應保留的變更',
      supervisor_id: 'S999',
      supervisor_comment: '不應保留的核准備註',
      updated_at: timestamp + 2
    },
    auditLog: { ...auditLog('leave_request', beforeData.id, beforeData, { changed: true }), after_data: BigInt(1) }
  }));
  const afterFailure = db.getLeaveRequestById(beforeData.id);
  assert.equal(afterFailure.reason, beforeData.reason);
  assert.deepEqual(loadApprovalSteps('leave_approval_steps', beforeData.id), beforeSteps);
  assert.equal(db.queryAuditLogs({}).filter((entry) => entry.target_id === beforeData.id && entry.action === 'correct').length, 1);
});

test('線上請假申請不能由紙本修正流程更新', () => {
  createPaperLeave('leave-online-1', { approval_mode: 'employee_request', reason: '線上申請' });
  const beforeData = db.getLeaveRequestById('leave-online-1');
  assert.throws(
    () => db.updatePaperLeaveRequest({
      requestId: beforeData.id,
      updates: { ...beforeData, reason: '不得更新', updated_at: timestamp + 3 },
      auditLog: auditLog('leave_request', beforeData.id, beforeData, { ...beforeData, reason: '不得更新' })
    }),
    { code: 'PAPER_REQUEST_STATE_CHANGED' }
  );
  assert.equal(db.getLeaveRequestById(beforeData.id).reason, '線上申請');
});

test('紙本加班修正會保留同一 id，作廢行為維持改為 cancelled 並留下稽核', () => {
  createPaperOvertime('overtime-paper-1');
  const beforeData = db.getOvertimeRequestById('overtime-paper-1');
  const updates = {
    ...beforeData, employee_id: 'E002', start_at: timestamp + 7200000,
    end_at: timestamp + 14400000, duration_hours: 2, reason: '修正後加班原因',
    supervisor_id: 'S003', supervisor_comment: '修正後加班核准備註',
    supervisor_decided_at: timestamp + 4,
    paper_no: 'O-002', paper_approved_by: '主管乙', paper_comment: '修正後紙本備註',
    updated_at: timestamp + 4
  };
  const updated = db.updatePaperOvertimeRequest({
    requestId: beforeData.id,
    updates,
    auditLog: auditLog('overtime_request', beforeData.id, beforeData, { ...beforeData, ...updates })
  });
  assert.equal(updated.id, beforeData.id);
  assert.equal(db.countOvertimeRequests({}), 1);
  assert.deepEqual(loadApprovalSteps('overtime_approval_steps', beforeData.id), [
    {
      step_order: 1,
      reviewer_role: 'supervisor',
      reviewer_id: 'S003',
      status: 'approved',
      comment: '修正後加班核准備註',
      decided_at: timestamp + 4,
      created_at: timestamp
    }
  ]);
  const correctionAudit = db.queryAuditLogs({})
    .find((entry) => entry.target_id === beforeData.id && entry.action === 'correct');
  assert.deepEqual(correctionAudit.before_data, beforeData);
  assert.deepEqual(correctionAudit.after_data, { ...beforeData, ...updates });

  const cancelledAt = timestamp + 5;
  const cancellation = db.cancelPaperOvertimeRequest({
    requestId: updated.id,
    cancelledAt,
    auditLog: { ...auditLog('overtime_request', updated.id, updated, { status: 'cancelled', cancelled_at: cancelledAt }), action: 'cancel' }
  });
  assert.equal(cancellation.changes, 1);
  assert.equal(db.getOvertimeRequestById(updated.id).status, 'cancelled');
  assert.equal(db.queryAuditLogs({}).filter((entry) => entry.target_id === updated.id).length, 2);
});

test('線上加班申請不能由紙本修正流程更新', () => {
  createPaperOvertime('overtime-online-1', { approval_mode: 'self_request', reason: '線上加班申請' });
  const beforeData = db.getOvertimeRequestById('overtime-online-1');
  assert.throws(
    () => db.updatePaperOvertimeRequest({
      requestId: beforeData.id,
      updates: { ...beforeData, reason: '不得更新', updated_at: timestamp + 6 },
      auditLog: auditLog('overtime_request', beforeData.id, beforeData, { ...beforeData, reason: '不得更新' })
    }),
    { code: 'PAPER_REQUEST_STATE_CHANGED' }
  );
  assert.equal(db.getOvertimeRequestById(beforeData.id).reason, '線上加班申請');
});
