const crypto = require('crypto');
const credentials = require('./web-credentials');

const ROLE_LABELS = { employee: '員工工作台', admin: '管理者工作台', developer: '開發人員工作台' };
const RESET_PERMISSION = 'admin.accounts.password.reset';
const REVEAL_PERMISSION = 'admin.accounts.password.reveal';
const fingerprint = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

function createBrowserAccounts(context) {
  const { db, sessions, eventClients, getEmployee, getAccess, hasPermission, createSession, buildDashboard,
    getSystemAdminCredentials, normalizeDeviceInfo, authorizeDevice, getIp, auditEntry, displaySettings } = context;
  const attempts = new Map();

  function throttle(request, accountId) {
    const now = Date.now();
    for (const [key, item] of attempts) if (now - item.start > 10 * 60 * 1000) attempts.delete(key);
    const ip = request.socket.remoteAddress || 'local';
    const keys = [[ip, 150], [`${ip}:${accountId}`, 25]];
    for (const [key, limit] of keys) {
      const item = attempts.get(key) || { start: now, count: 0 };
      if (item.count >= limit) throw httpError('嘗試次數過多，請於 10 分鐘後再試。', 429);
    }
    for (const [key] of keys) {
      const item = attempts.get(key) || { start: now, count: 0 };
      item.count++;
      attempts.set(key, item);
    }
    return () => { for (const [key] of keys) { const item = attempts.get(key); if (item) item.count = Math.max(0, item.count - 1); } };
  }

  function httpError(message, statusCode = 400) {
    return Object.assign(new Error(message), { statusCode });
  }

  function revoke(token) {
    sessions.delete(token);
    for (const [id, client] of eventClients) {
      if (client.token !== token) continue;
      clearInterval(client.heartbeat);
      client.response.end();
      eventClients.delete(id);
    }
  }

  function revokeEmployee(employeeId) {
    for (const [token, session] of sessions) {
      if (session.authMethod !== 'system_admin' && (session.realEmployeeId || session.employeeId) === employeeId) revoke(token);
    }
  }

  function revokeSystemAdmins() {
    for (const [token, session] of sessions) if (session.authMethod === 'system_admin') revoke(token);
  }

  function validSession(session) {
    if (!session || Date.now() - (session.authenticatedAt || session.createdAt) > 12 * 60 * 60 * 1000) return false;
    if (session.role === 'system_admin') {
      const account = getSystemAdminCredentials();
      return session.systemSignature === fingerprint(`${account.username}:${account.password}`);
    }
    const employeeId = session.realEmployeeId || session.employeeId;
    const employee = getEmployee(employeeId);
    if (!employee || !getEmployee(session.employeeId)) return false;
    if (session.authMethod === 'card') {
      return session.role === 'employee' && !session.impersonation?.active && session.cardSignature === fingerprint(employee.card);
    }
    if (session.authMethod !== 'web_password') return false;
    const stored = db.getWebCredential(employeeId);
    if (!stored || stored.revision !== session.credentialRevision) return false;
    if (stored.must_change_password && session.role !== 'password_change') return false;
    if (session.impersonation?.active) return getAccess(employeeId).allowed_roles.includes('developer');
    return ['workspace', 'password_change'].includes(session.role) || getAccess(employeeId).allowed_roles.includes(session.role);
  }

  function requireSession(request, response, next) {
    const header = String(request.headers.authorization || '');
    const session = sessions.get(header.startsWith('Bearer ') ? header.slice(7) : '');
    if (!validSession(session)) {
      if (session) revoke(session.token);
      return response.status(401).json({ success: false, error: '登入已失效或權限已變更，請重新登入。' });
    }
    if (['workspace', 'password_change'].includes(session.role)) {
      const allowedPaths = ['/api/browser/dashboard', '/api/browser/logout', '/api/browser/account/password'];
      if (session.role === 'workspace') allowedPaths.push('/api/browser/workspace');
      if (!allowedPaths.includes(request.path)) return response.status(403).json({ success: false, error: '請先修改臨時密碼或選擇工作台。' });
    }
    request.browserSession = session;
    next();
  }

  function metadata(employeeId) {
    const row = db.getWebCredential(employeeId);
    return { configured: !!row, mustChangePassword: !!row?.must_change_password, updatedAt: row?.updated_at || null };
  }

  function canManage(session, action, target) {
    if (!session || session.impersonation?.active) return false;
    if (session.role === 'system_admin' || session.role === 'developer') return true;
    if (session.role !== 'admin' || !hasPermission(session, action === 'reset' ? RESET_PERMISSION : REVEAL_PERMISSION)) return false;
    // Delegated administrators can manage employee-only accounts, never peer administrators or developers.
    return !target || getAccess(target.id).allowed_roles.every((role) => role === 'employee');
  }

  function decorateDashboard(dashboard, session) {
    const systemAdmin = session.role === 'system_admin';
    const id = session.realEmployeeId || session.employeeId;
    const canReset = canManage(session, 'reset');
    const canReveal = canManage(session, 'reveal');
    const account = {
      ...(!systemAdmin ? metadata(id) : {}), authMethod: session.authMethod,
      canChangePassword: !systemAdmin && !!db.getWebCredential(id) && !session.impersonation?.active,
      availableRoles: !systemAdmin && session.authMethod === 'web_password' && !session.impersonation?.active
        ? getAccess(id).allowed_roles.map((role) => ({ id: role, label: ROLE_LABELS[role] })) : [],
      canReset, canReveal
    };
    if (canReset || canReveal) {
      account.credentialAccounts = db.loadEmployees().filter((employee) => canManage(session, 'reset', employee) || canManage(session, 'reveal', employee))
        .map((employee) => ({ id: employee.id, name: employee.name, ...metadata(employee.id),
          canReset: canManage(session, 'reset', employee), canReveal: canManage(session, 'reveal', employee) }));
    }
    return { ...dashboard, webAccount: account };
  }

  function pendingDashboard(session) {
    const employee = getEmployee(session.employeeId);
    return { role: session.role, user: { id: employee.id, name: employee.name, department: employee.department }, displaySettings: displaySettings() };
  }

  function deviceBinding(authorization, device) {
    return { enabled: authorization?.securitySettings?.deviceBindingEnabled ?? false,
      newlyBound: authorization?.newlyBound === true,
      deviceName: authorization?.deviceRecord?.device_name || device.deviceName || '',
      issuedDeviceToken: authorization?.issuedDeviceToken || '' };
  }

  function sessionMetadata(request, device, extra) {
    return { ...extra, deviceId: device.deviceId, deviceName: device.deviceName, devicePlatform: device.platform,
      deviceBrowserName: device.browserName, ipAddress: getIp(request), userAgent: request.headers['user-agent'] || null };
  }

  function endpoint(handler) {
    return async (request, response) => {
      response.setHeader('Cache-Control', 'no-store');
      try { await handler(request, response); }
      catch (error) { response.status(error.statusCode || 500).json({ success: false, error: error.message }); }
    };
  }

  const login = endpoint(async (request, response) => {
    const { role, employeeId, secret, deviceInfo } = request.body || {};
    const id = String(employeeId || '').trim();
    if (!id || typeof secret !== 'string' || !secret || secret.length > 128) throw httpError('請輸入帳號與卡號或個人網頁密碼。');
    const authenticated = throttle(request, `login:${id}`);
    const device = normalizeDeviceInfo(deviceInfo || {});
    let activeRole, extra, employee, authorization;
    if (role === 'system_admin') {
      const account = getSystemAdminCredentials();
      if (id !== account.username || secret !== account.password) throw httpError('系統管理者帳號或密碼不正確。', 401);
      activeRole = 'system_admin';
      extra = { authMethod: 'system_admin', systemSignature: fingerprint(`${account.username}:${account.password}`), realEmployeeName: '系統管理者' };
    } else {
      employee = getEmployee(id);
      if (!employee) throw httpError('工號與卡號或個人網頁密碼不正確。', 401);
      if (employee.card && String(employee.card).trim() === secret.trim()) {
        activeRole = 'employee';
        extra = { authMethod: 'card', cardSignature: fingerprint(employee.card) };
        authorization = authorizeDevice(employee, request, device);
      } else {
        const stored = db.getWebCredential(id);
        if (!await credentials.verifyPassword(stored?.credential, secret)) throw httpError('工號與卡號或個人網頁密碼不正確。', 401);
        if (db.getWebCredential(id)?.revision !== stored.revision) throw httpError('密碼已變更，請重新登入。', 401);
        activeRole = stored.must_change_password ? 'password_change' : 'workspace';
        if (!stored.must_change_password && getAccess(id).allowed_roles.length === 1) {
          activeRole = 'employee';
          authorization = authorizeDevice(employee, request, device);
        }
        extra = { authMethod: 'web_password', credentialRevision: stored.revision };
      }
      extra.realEmployeeName = employee.name;
    }
    authenticated();
    const token = createSession(activeRole, employee?.id || '__system_admin__', sessionMetadata(request, device, extra));
    request.browserSession = sessions.get(token);
    db.addAuditLog(auditEntry(request, { action: 'login', target_type: 'session', target_id: id, summary: '網頁個人帳號登入。', after_data: { role: activeRole, auth_method: extra.authMethod } }));
    response.json({ success: true, token, dashboard: buildDashboard(request.browserSession), deviceBinding: deviceBinding(authorization, device) });
  });

  async function reauthenticate(request) {
    const session = request.browserSession;
    const authenticated = throttle(request, `reauth:${session.realEmployeeId || session.employeeId}`);
    const provided = request.body?.currentPassword;
    const correct = session.role === 'system_admin'
      ? typeof provided === 'string' && provided === getSystemAdminCredentials().password
      : await credentials.verifyPassword(db.getWebCredential(session.employeeId)?.credential, provided);
    if (!correct) throw httpError('目前登入帳號的密碼不正確。', 403);
    authenticated();
    if (!validSession(session)) throw httpError('登入已失效，請重新登入。', 401);
  }

  function attachRoutes(server) {
    server.post('/api/browser/login', login);
    server.post('/api/browser/workspace', requireSession, endpoint(async (request, response) => {
      const session = request.browserSession;
      const role = request.body?.role;
      if (session.authMethod !== 'web_password' || session.impersonation?.active || session.role === 'password_change'
        || !getAccess(session.employeeId).allowed_roles.includes(role)) throw httpError('這個登入方式或帳號沒有此工作台權限。', 403);
      const employee = getEmployee(session.employeeId);
      const device = normalizeDeviceInfo(request.body?.deviceInfo || {});
      const authorization = role === 'employee' ? authorizeDevice(employee, request, device) : null;
      const token = createSession(role, employee.id, sessionMetadata(request, device,
        { authMethod: session.authMethod, credentialRevision: session.credentialRevision, realEmployeeName: employee.name, authenticatedAt: session.authenticatedAt }));
      db.addAuditLog(auditEntry(request, { action: 'workspace_switch', target_type: 'session', target_id: employee.id,
        summary: `切換至${ROLE_LABELS[role]}。`, before_data: { role: session.role }, after_data: { role } }));
      const dashboard = buildDashboard(sessions.get(token));
      revoke(session.token);
      response.json({ success: true, token, dashboard, deviceBinding: deviceBinding(authorization, device) });
    }));

    server.post('/api/browser/account/password', requireSession, endpoint(async (request, response) => {
      const session = request.browserSession;
      if (!['card', 'web_password'].includes(session.authMethod) || session.impersonation?.active) throw httpError('此登入方式不可修改個人網頁密碼。', 403);
      const previousRevision = db.getWebCredential(session.employeeId)?.revision;
      await reauthenticate(request);
      const { newPassword, confirmPassword } = request.body || {};
      credentials.validatePassword(newPassword, getEmployee(session.employeeId).card);
      if (newPassword !== confirmPassword) throw httpError('兩次新密碼不一致。');
      if (newPassword === request.body.currentPassword) throw httpError('新密碼不可與目前密碼相同。');
      const credential = await credentials.createCredential(db.getDatabasePath(), session.employeeId, newPassword);
      if (!validSession(session) || db.getWebCredential(session.employeeId)?.revision !== previousRevision) throw httpError('密碼或權限已變更，請重新登入。', 401);
      credentials.validatePassword(newPassword, getEmployee(session.employeeId).card);
      db.saveWebCredential({ employee_id: session.employeeId, credential, revision: crypto.randomUUID(), must_change_password: false, updated_by: session.employeeId },
        auditEntry(request, { action: 'web_password_change', target_type: 'web_account', target_id: session.employeeId, summary: '修改個人網頁密碼；原登入已失效。' }));
      revokeEmployee(session.employeeId);
      response.json({ success: true, requiresLogin: true, message: '個人網頁密碼已修改，請使用新密碼重新登入。' });
    }));

    for (const action of ['reset', 'reveal']) {
      server.post(`/api/browser/accounts/password/${action}`, requireSession, endpoint(async (request, response) => {
        const session = request.browserSession;
        const target = getEmployee(String(request.body?.employeeId || '').trim());
        if (!target || !canManage(session, action, target)) throw httpError('沒有管理這個帳號網頁密碼的權限。', 403);
        await reauthenticate(request);
        if (!canManage(session, action, target)) throw httpError('帳號權限已變更。', 403);
        if (action === 'reveal') {
          const stored = db.getWebCredential(target.id);
          if (!stored) throw httpError('這個帳號尚未設定個人網頁密碼。', 404);
          const password = credentials.revealPassword(db.getDatabasePath(), target.id, stored.credential);
          // Write the audit first and fail closed; never include the secret in the audit payload.
          db.addAuditLog(auditEntry(request, { action: 'web_password_reveal', target_type: 'web_account', target_id: target.id, summary: '查看目前有效的個人網頁密碼。' }));
          return response.json({ success: true, password, mustChangePassword: !!stored.must_change_password });
        }
        const { newPassword, confirmPassword } = request.body || {};
        credentials.validatePassword(newPassword, target.card);
        if (newPassword !== confirmPassword) throw httpError('兩次臨時密碼不一致。');
        const credential = await credentials.createCredential(db.getDatabasePath(), target.id, newPassword);
        if (!validSession(session) || !getEmployee(target.id) || !canManage(session, action, target)) throw httpError('帳號或權限已變更，請重新登入。', 401);
        credentials.validatePassword(newPassword, getEmployee(target.id).card);
        db.saveWebCredential({ employee_id: target.id, credential, revision: crypto.randomUUID(), must_change_password: true,
          updated_by: session.employeeId }, auditEntry(request, { action: 'web_password_reset', target_type: 'web_account', target_id: target.id,
          summary: '設定或重設個人網頁臨時密碼；下次登入須修改密碼，原登入已失效。' }));
        revokeEmployee(target.id);
        response.json({ success: true, requiresLogin: target.id === session.employeeId, message: '臨時網頁密碼已設定，下次登入必須修改。' });
      }));
    }
  }

  return { attachRoutes, requireSession, validSession, decorateDashboard, pendingDashboard, revoke, revokeEmployee, revokeSystemAdmins };
}

module.exports = { createBrowserAccounts, RESET_PERMISSION, REVEAL_PERMISSION };
