(() => {
    'use strict';
    const defaultFilter = (kind) => {
        if (kind !== 'diagnostics') return { query: '', department: '', status: '' };
        const today = new Date(Date.now() + 8 * 60 * 60 * 1000);
        return { employeeId: '', status: 'failure', endDate: today.toISOString().slice(0, 10),
            startDate: new Date(today.getTime() - 13 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) };
    };
    const filters = { devices: defaultFilter('devices'), remote: defaultFilter('remote'), diagnostics: defaultFilter('diagnostics') };
    let diagnosticQuery = { data: null, applied: null, loading: false, error: '', request: 0 };
    let dialog;
    let dialogOrigin;
    let sessionGeneration = 0;
    const sessionIdentity = (dashboard = state.dashboard) => JSON.stringify([
        state.token || '', dashboard?.role || '', dashboard?.user?.id || '',
        dashboard?.impersonation?.realEmployeeId || '', dashboard?.impersonation?.targetEmployeeId || '',
        dashboard?.impersonation?.active || false, [...(dashboard?.permissions?.admin || [])].sort()
    ]);
    let renderedIdentity = sessionIdentity();
    function clearDirectorySession() {
        sessionGeneration += 1;
        diagnosticQuery = { data: null, applied: null, loading: false, error: '', request: diagnosticQuery.request + 1 };
        dialogOrigin = null;
        if (dialog) {
            const previousDialog = dialog;
            dialog = null;
            if (previousDialog.open) previousDialog.close();
            previousDialog.replaceChildren();
            previousDialog.remove();
        }
        for (const kind of Object.keys(filters)) filters[kind] = defaultFilter(kind);
    }
    // Wait until all deferred modules have installed their render/logout wrappers,
    // including the workspace chooser which bypasses the base dashboard renderer.
    document.addEventListener('DOMContentLoaded', () => {
        const previousRender = renderDashboard;
        renderDashboard = function renderDirectorySession(dashboard) {
            const nextIdentity = sessionIdentity(dashboard);
            if (nextIdentity !== renderedIdentity) clearDirectorySession();
            renderedIdentity = nextIdentity;
            return previousRender(dashboard);
        };
        const previousLogout = handleLogout;
        handleLogout = function logoutDirectorySession(...args) {
            clearDirectorySession();
            renderedIdentity = '';
            return previousLogout(...args);
        };
    });
    const esc = (value) => escapeHtml(value == null ? '' : String(value));
    const canManage = () => state.dashboard?.role === 'system_admin' || hasCurrentAdminPermission('admin.security.manage');
    const canViewDiagnostics = () => state.dashboard?.role === 'system_admin' || hasCurrentAdminPermission('admin.security.view');
    const security = () => getDatasets().security || {};
    const deviceLimit = (settings = security().settings) => {
        const value = Number(settings?.maxDevicesPerEmployee);
        return Number.isInteger(value) && value >= 1 && value <= 4 ? value : 4;
    };
    const formatTime = (value) => value ? new Date(value).toLocaleString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' }) : '尚無紀錄';

    function deviceGroups(datasets = getDatasets()) {
        const groups = new Map((datasets.employees || []).map((employee) => [employee.id, {
            employeeId: employee.id, employeeName: employee.name, department: employee.department || '', devices: [], employeeMissing: false
        }]));
        for (const device of datasets.security?.employeeDevices || []) {
            if (!groups.has(device.employee_id)) groups.set(device.employee_id, {
                employeeId: device.employee_id, employeeName: device.employeeName || '已刪除員工',
                department: device.employeeDepartment || '', employeeMissing: true, devices: []
            });
            groups.get(device.employee_id).devices.push(device);
        }
        return [...groups.values()].map((group) => ({ ...group,
            latestAt: Math.max(0, ...group.devices.map((device) => Number(device.last_seen_at) || 0))
        })).sort((a, b) => b.devices.length - a.devices.length || a.employeeId.localeCompare(b.employeeId, 'zh-TW'));
    }

    function matches(group, kind) {
        const filter = filters[kind];
        if (filter.department && group.department !== filter.department) return false;
        if (kind === 'devices' && filter.status === 'bound' && !group.devices.length) return false;
        if (kind === 'devices' && filter.status === 'unbound' && group.devices.length) return false;
        if (kind === 'devices' && filter.status === 'review' && group.devices.length < 3) return false;
        if (kind === 'remote' && filter.status === 'risky' && !group.riskyCount) return false;
        if (kind === 'remote' && filter.status === 'normal' && group.riskyCount) return false;
        const query = filter.query.trim().toLowerCase();
        return !query || [group.employeeId, group.employeeName, group.department,
            ...(group.devices || []).flatMap((device) => [device.deviceDisplayName, device.device_id, device.last_ip])
        ].join(' ').toLowerCase().includes(query);
    }

    function renderFilters(kind, groups) {
        const filter = filters[kind], departments = [...new Set(groups.map((group) => group.department).filter(Boolean))].sort();
        const statuses = kind === 'devices' ? [['bound', '已綁定'], ['unbound', '尚未綁定'], ['review', '3 台以上待查看']] : [['risky', '有風險提示'], ['normal', '無風險提示']];
        return `<div class="directory-filter-row">
            <label class="field directory-search"><span>搜尋${kind === 'devices' ? '人員 / 裝置' : '人員'}</span>
                <input data-directory-filter="query" value="${esc(filter.query)}" placeholder="${kind === 'devices' ? '工號、姓名、裝置名稱、裝置 ID 或 IP' : '工號、姓名或部門'}"></label>
            <label class="field"><span>部門</span><select data-directory-filter="department"><option value="">全部部門</option>${departments.map((department) => `<option value="${esc(department)}" ${department === filter.department ? 'selected' : ''}>${esc(department)}</option>`).join('')}</select></label>
            <label class="field"><span>${kind === 'devices' ? '綁定狀態' : '風險狀態'}</span><select data-directory-filter="status"><option value="">全部狀態</option>${statuses.map(([value, label]) => `<option value="${value}" ${value === filter.status ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
            <button class="outline-btn" type="button" data-directory-action="reset" data-kind="${kind}">清除篩選</button>
        </div>`;
    }

    function employeeCell(group) {
        return `<strong>${esc(group.employeeName || '未命名員工')}</strong><div class="directory-muted">${esc(group.employeeId)}${group.employeeMissing ? ' · 原員工資料已刪除' : ''}</div>`;
    }

    function deviceCountBadges(count, limit) {
        return `${renderBadge(count ? `${count} 台已綁定` : '尚未綁定', count >= 3 ? 'warning' : count ? 'success' : '')}${count >= 3 ? '<div class="directory-muted">3 台以上待查看</div>' : ''}${count >= limit ? `<div class="directory-muted">已達目前 ${limit} 台上限；啟用綁定時會擋下新裝置</div>` : ''}`;
    }

    function renderDeviceResults(groups, limit = deviceLimit()) {
        const rows = groups.filter((group) => matches(group, 'devices'));
        return `<p class="helper-text" role="status">顯示 ${rows.length} / ${groups.length} 人 · 篩選結果共 ${rows.reduce((sum, group) => sum + group.devices.length, 0)} 台裝置</p>
            ${rows.length ? `<div class="data-table-wrap directory-table-wrap"><table class="data-table directory-table"><thead><tr><th>人員</th><th>部門</th><th>綁定狀態</th><th>最近登入</th><th>操作</th></tr></thead><tbody>
            ${rows.map((group) => `<tr><td>${employeeCell(group)}</td><td>${esc(group.department || '未指定')}</td><td>${deviceCountBadges(group.devices.length, limit)}</td><td>${esc(formatTime(group.latestAt))}</td><td>${group.devices.length ? `<button class="mini-btn" type="button" data-directory-action="devices" data-employee-id="${esc(group.employeeId)}">檢視裝置</button>` : '<span class="directory-muted">無可解除裝置</span>'}</td></tr>`).join('')}</tbody></table></div>` : renderEmptyState('沒有符合篩選條件的人員。')}`;
    }

    function renderRemoteResults(groups) {
        const rows = groups.filter((group) => matches(group, 'remote'));
        return `<p class="helper-text" role="status">顯示 ${rows.length} / ${groups.length} 人 · 篩選結果共 ${rows.reduce((sum, group) => sum + group.totalCount, 0)} 筆 · 風險提示 ${rows.reduce((sum, group) => sum + group.riskyCount, 0)} 筆</p>
            ${rows.length ? `<div class="data-table-wrap directory-table-wrap"><table class="data-table directory-table"><thead><tr><th>人員</th><th>部門</th><th>打卡總數</th><th>上班 / 下班</th><th>打卡天數</th><th>裝置數</th><th>風險提示</th><th>最近打卡</th><th>操作</th></tr></thead><tbody>
            ${rows.map((group) => `<tr><td>${employeeCell(group)}</td><td>${esc(group.department || '未指定')}</td><td><strong>${group.totalCount}</strong></td><td>${group.inCount} / ${group.outCount}</td><td>${group.activeDays} 天</td><td>${group.deviceCount}</td><td>${renderBadge(`${group.riskyCount} 筆`, group.riskyCount ? 'warning' : 'success')}</td><td>${esc(group.latestText)}</td><td><button class="mini-btn" type="button" data-directory-action="remote" data-employee-id="${esc(group.employeeId)}">查看明細</button></td></tr>`).join('')}</tbody></table></div>` : renderEmptyState('最近 14 日沒有符合條件的遠端打卡人員。')}`;
    }

    function renderDevices(datasets) {
        const groups = deviceGroups(datasets);
        return `<section data-directory-kind="devices" aria-label="裝置綁定人員清單"><p class="helper-text">目前每人上限 ${deviceLimit(datasets.security?.settings)} 台。3 台以上會標記待查看，可先比對裝置登入診斷；系統不會自行解除任何綁定。裝置名稱及 IP 不能單獨證明是同一台實體電腦。</p>${renderFilters('devices', groups)}<div data-directory-results>${renderDeviceResults(groups, deviceLimit(datasets.security?.settings))}</div></section>`;
    }

    function renderDiagnosticRecords(records = []) {
        if (!canViewDiagnostics()) return renderEmptyState('目前沒有「安全設定檢視」權限，無法查看裝置登入診斷。');
        const stageLabels = { login: '登入', workspace_switch: '切換工作台', punch: '打卡驗證', device_recovery: '恢復原裝置', recovery_complete: '恢復原裝置', device_storage: '儲存確認', storage_ack: '儲存確認' };
        const identityLabels = { local_storage: '沿用網站儲存', cookie: '從 Cookie 備援恢復', generated: '新產生', unknown: '舊紀錄未記錄' };
        const tokenLabels = { local_storage: '網站儲存', cookie: 'Cookie 備援', legacy: '舊版憑證', multiple: '多份候選憑證', none: '沒有憑證', unknown: '舊紀錄未記錄' };
        const storageLabels = { available: '可用', unavailable: '不可用', unknown: '舊紀錄未記錄' };
        const outcomeLabels = { new: '新增綁定', existing: '沿用原綁定', recovered: '恢復原綁定', disabled: '未啟用裝置綁定', blocked: '驗證遭拒', persistence: '回報憑證儲存' };
        const verificationLabels = { verified: '有效', missing: '未提供', invalid: '無效', ambiguous: '對應多筆綁定，無法確認', not_required: '此步驟不需驗證' };
        const persistenceLabels = { saved: '已確認保存', partial: '僅部分位置保存成功', retained: '沿用既存憑證（無法重新寫入）', failed: '保存失敗', unknown: '尚無儲存回報' };
        const label = (labels, value, fallback = '舊紀錄未記錄') => Object.hasOwn(labels, value || '') ? labels[value] : fallback;
        return records.length ? `<div class="directory-diagnostic-list">${records.map((record) => `<article class="directory-diagnostic">
                <div class="directory-diagnostic-heading"><div><strong>${record.employeeId ? `${esc(record.employeeId)} / ${esc(record.employeeName || '未提供姓名')}` : '未確認帳號'}</strong><div class="directory-muted">${esc(record.timestampText || '未提供時間')}${record.department ? ` · ${esc(record.department)}` : ''}</div>${!record.employeeId && record.submittedAccount ? `<div class="directory-muted">輸入帳號：${esc(record.submittedAccount)}（尚未驗證身分）</div>` : ''}</div><div class="badge-row">${renderBadge(record.success === true ? '成功' : '失敗', record.success === true ? 'success' : 'danger')}${renderBadge(Object.hasOwn(stageLabels, record.stage) ? stageLabels[record.stage] : record.stage || '未提供階段')}</div></div>
                <p class="directory-diagnostic-reason"><strong>${esc(record.failureCode || (record.success === true ? '成功' : '未提供錯誤碼'))}</strong> · ${esc(record.reason || '未提供原因')}</p>
                <dl class="directory-diagnostic-fields"><div><dt>裝置 ID / 名稱</dt><dd>${esc(record.deviceId || '未提供')}<div class="directory-muted">${esc(record.deviceName || '未提供名稱')}</div></dd></div><div><dt>瀏覽器 / 平台</dt><dd>${esc(record.browserName || '未提供瀏覽器')} / ${esc(record.platform || '未提供平台')}</dd></div><div><dt>來源網址</dt><dd>${esc(record.siteOrigin || '未提供')}</dd></div><div><dt>IP</dt><dd>${esc(record.ipAddress || '未提供')}</dd></div><div><dt>有無提供裝置憑證</dt><dd>${record.tokenPresent === true ? '有提供（不代表驗證有效）' : '未提供'}</dd></div><div><dt>當時綁定數 / 上限</dt><dd>${esc(record.boundDeviceCount ?? '未確認')} / ${esc(record.maxDevicesPerEmployee ?? '未確認')}</dd></div></dl>
                <dl class="directory-diagnostic-fields"><div><dt>識別來源</dt><dd>${esc(identityLabels[record.identitySource] || identityLabels.unknown)}${record.identityRecovered ? (['device_recovery', 'recovery_complete'].includes(record.stage) ? ' · 已經管理者確認恢復' : ' · 已用有效憑證找回原綁定') : ''}</dd></div><div><dt>憑證來源</dt><dd>${esc(tokenLabels[record.tokenSource] || tokenLabels.unknown)}</dd></div><div><dt>網站儲存 / Cookie 備援</dt><dd>${esc(storageLabels[record.localStorageStatus] || storageLabels.unknown)} / ${esc(storageLabels[record.cookieStorageStatus] || storageLabels.unknown)}</dd></div></dl>
                <dl class="directory-diagnostic-fields directory-diagnostic-outcome"><div><dt>送出時裝置 ID</dt><dd>${esc(record.originalDeviceId || '舊紀錄未記錄')}</dd></div><div><dt>確認後裝置 ID</dt><dd>${esc(record.canonicalDeviceId || '尚未確認')}</dd></div><div><dt>綁定處理</dt><dd>${esc(label(outcomeLabels, record.bindingOutcome))}</dd></div><div><dt>處理前 → 處理後綁定數</dt><dd>${esc(record.boundDeviceCountBefore ?? '未記錄')} → ${esc(record.boundDeviceCountAfter ?? '未記錄')}</dd></div><div><dt>憑證驗證結果</dt><dd>${esc(label(verificationLabels, record.tokenVerification))}${Number.isInteger(record.tokenCandidateCount) ? ` · ${esc(record.tokenCandidateCount)} 份候選` : ''}</dd></div><div><dt>憑證保存結果</dt><dd>${esc(label(persistenceLabels, record.persistenceStatus, persistenceLabels.unknown))}</dd></div></dl>
                <details class="directory-user-agent"><summary>瀏覽器完整資訊（User-Agent）</summary><p>${esc(record.userAgent || '未提供')}</p></details>
            </article>`).join('')}</div>` : renderEmptyState('這個查詢範圍沒有紀錄，可調整員工、日期或診斷結果。');
    }

    function renderDiagnosticResults() {
        if (!canViewDiagnostics()) return renderEmptyState('目前沒有「安全設定檢視」權限，無法查看裝置登入診斷。');
        if (diagnosticQuery.loading) return '<p class="helper-text" role="status">正在查詢裝置登入診斷…</p>';
        if (diagnosticQuery.error) return `<p class="directory-diagnostic-error" role="alert">${esc(diagnosticQuery.error)} 請重新查詢。</p>`;
        const data = diagnosticQuery.data;
        if (!data) return '<p class="helper-text" role="status">正在準備查詢；若未自動載入，請按「查詢診斷」。</p>';
        const total = Number.isSafeInteger(data.total) && data.total >= 0 ? data.total : 0;
        const page = Number.isSafeInteger(data.page) && data.page > 0 ? data.page : 1;
        const pageSize = Number.isSafeInteger(data.pageSize) && data.pageSize > 0 ? data.pageSize : 25;
        const pages = Math.max(1, Math.ceil(total / pageSize));
        const applied = diagnosticQuery.applied || {};
        const resultLabel = applied.status === 'success' ? '成功' : applied.status === 'failure' ? '失敗' : '全部結果';
        return `<div class="directory-range"><strong>${esc(data.startDate)} — ${esc(data.endDate)}</strong><span>台北時間 · ${applied.employeeId ? `工號 ${esc(applied.employeeId)}` : '全部員工與未確認帳號'} · ${resultLabel} · 共 ${total} 筆</span></div>
            ${renderDiagnosticRecords(Array.isArray(data.records) ? data.records : [])}
            <div class="directory-diagnostic-pagination" aria-label="診斷分頁"><button class="outline-btn" type="button" data-directory-action="diagnostics-previous" ${page <= 1 ? 'disabled' : ''}>上一頁</button><span role="status">第 ${page} / ${pages} 頁 · 每頁 ${pageSize} 筆</span><button class="outline-btn" type="button" data-directory-action="diagnostics-next" ${page >= pages ? 'disabled' : ''}>下一頁</button></div>`;
    }

    function updateDiagnosticResults() {
        const section = document.querySelector('[data-directory-kind="diagnostics"]');
        if (section) section.querySelector('[data-directory-results]').innerHTML = renderDiagnosticResults();
    }

    async function loadDiagnostics(page = 1, query = filters.diagnostics) {
        if (!canViewDiagnostics()) return;
        const applied = { ...query };
        const submittedIdentity = sessionIdentity(), submittedGeneration = sessionGeneration;
        const request = ++diagnosticQuery.request;
        const isCurrent = () => submittedIdentity === sessionIdentity() && submittedGeneration === sessionGeneration && request === diagnosticQuery.request && canViewDiagnostics();
        diagnosticQuery.loading = true; diagnosticQuery.error = ''; diagnosticQuery.applied = applied;
        updateDiagnosticResults();
        try {
            const params = new URLSearchParams({ employeeId: applied.employeeId || '', startDate: applied.startDate,
                endDate: applied.endDate, result: applied.status || 'all', page: String(page), pageSize: '25' });
            const result = await requestJson(`/api/browser/admin/device-login-diagnostics?${params}`, { auth: true });
            if (!isCurrent()) return;
            diagnosticQuery.data = result;
        } catch (error) {
            if (!isCurrent()) return;
            diagnosticQuery.data = null; diagnosticQuery.error = error.message || '查詢失敗。';
        } finally {
            if (isCurrent()) { diagnosticQuery.loading = false; updateDiagnosticResults(); }
        }
    }

    function renderDiagnostics(datasets) {
        if (!canViewDiagnostics()) return renderEmptyState('目前沒有「安全設定檢視」權限，無法查看裝置登入診斷。');
        const data = datasets.security?.deviceLoginDiagnostics || {}, filter = filters.diagnostics;
        const scheduledIdentity = sessionIdentity(), scheduledGeneration = sessionGeneration;
        Promise.resolve().then(() => {
            if (scheduledIdentity === sessionIdentity() && scheduledGeneration === sessionGeneration && !diagnosticQuery.data && !diagnosticQuery.loading && !diagnosticQuery.error && document.querySelector('[data-directory-kind="diagnostics"]')) loadDiagnostics();
        });
        const employees = [...(datasets.employees || [])].sort((a, b) => String(a.id).localeCompare(String(b.id), 'zh-TW'));
        return `<section data-directory-kind="diagnostics" aria-label="裝置登入診斷查詢">
            <p class="helper-text">預設查詢最近 14 日失敗紀錄。選擇員工、日期及結果後按「查詢診斷」；伺服器會先查該員工，再分頁顯示，不受工作台摘要最新 200 筆限制。未驗證帳號仍會標明身分尚未確認。</p>
            <p class="helper-text">不會補記過去未留下的登入失敗；網路連線失敗可能沒有紀錄。儲存可用只代表當下可存取，不保證關閉瀏覽器後仍保留。相同名稱、IP 或瀏覽器資訊不能直接判定是同一台實體電腦。</p>
            <form data-directory-diagnostics-query><div class="directory-filter-row directory-diagnostic-filters"><label class="field"><span>診斷員工</span><select data-directory-filter="employeeId"><option value="">全部員工與未確認帳號</option>${employees.map(employee => `<option value="${esc(employee.id)}" ${filter.employeeId === employee.id ? 'selected' : ''}>${esc(employee.id)} / ${esc(employee.name)}</option>`).join('')}</select></label><label class="field"><span>開始日期</span><input type="date" required data-directory-filter="startDate" value="${esc(filter.startDate)}"></label><label class="field"><span>結束日期</span><input type="date" required data-directory-filter="endDate" value="${esc(filter.endDate)}"></label><label class="field"><span>診斷結果</span><select data-directory-filter="status"><option value="all" ${filter.status === 'all' ? 'selected' : ''}>全部</option><option value="failure" ${filter.status === 'failure' ? 'selected' : ''}>失敗</option><option value="success" ${filter.status === 'success' ? 'selected' : ''}>成功</option></select></label><button class="primary-btn" type="submit">查詢診斷</button><button class="outline-btn" type="button" data-directory-action="reset" data-kind="diagnostics">重設最近 14 日</button></div></form><div data-directory-results aria-live="polite">${renderDiagnosticResults()}</div>
            <details class="directory-diagnostic-preview"><summary>工作台載入時摘要（僅最近 14 日最新 ${esc(data.limit || 200)} 筆，不套用上方查詢）</summary><p class="helper-text">這是載入工作台當時的有限摘要，不能用來判斷某位員工沒有其他紀錄。請以上方伺服器查詢為準。</p>${renderDiagnosticRecords(Array.isArray(data.records) ? data.records : [])}</details></section>`;
    }

    function renderRemote(datasets) {
        const data = datasets.security || {}, groups = data.recentBrowserPunchEmployees || [], range = data.recentBrowserPunchRange;
        return `<section data-directory-kind="remote" aria-label="最近 14 日遠端打卡人員清單"><div class="directory-range"><strong>${range ? `${esc(range.startDate)} — ${esc(range.endDate)}` : '最近 14 日'}</strong><span>台北時間 · 今天及前 13 日 · 區間全部紀錄</span></div>${renderFilters('remote', groups)}<div data-directory-results>${renderRemoteResults(groups)}</div></section>`;
    }

    function renderManual(records = []) {
        return `<section class="directory-manual-history" aria-label="最近 50 筆手動補登紀錄"><div class="list-toolbar"><div><h3>最近 50 筆手動補登紀錄</h3><p class="helper-text">僅顯示來源為手動補登的紀錄，依打卡時間由新到舊排序；較早資料可至考勤報表查詢。</p></div>${renderBadge(`${records.length} 筆`)}</div>
        ${records.length ? `<div class="data-table-wrap directory-table-wrap"><table class="data-table directory-table"><thead><tr><th>人員</th><th>部門</th><th>打卡時間</th><th>班別</th><th>類型</th><th>考勤狀態</th></tr></thead><tbody>${records.map((record) => `<tr><td>${esc(record.employeeId)} / ${esc(record.employeeName)}</td><td>${esc(record.department || '未指定')}</td><td>${esc(record.dateText)} ${esc(record.timeText)}</td><td>${esc(record.shift || '手動補登')}</td><td>${esc(record.typeText)}</td><td>${esc(record.attendanceStatusText || record.status)}</td></tr>`).join('')}</tbody></table></div>` : renderEmptyState('尚無手動補登紀錄。')}</section>`;
    }

    function openDialog(title, body) {
        if (!dialog) {
            dialog = document.createElement('dialog');
            dialog.id = 'admin-directory-dialog';
            dialog.className = 'directory-dialog';
            dialog.setAttribute('aria-labelledby', 'admin-directory-dialog-title');
            document.body.append(dialog);
            const currentDialog = dialog;
            dialog.addEventListener('close', () => {
                if (dialog === currentDialog) {
                    if (dialogOrigin?.isConnected) dialogOrigin.focus();
                    dialogOrigin = null;
                    dialog = null;
                }
                currentDialog.replaceChildren();
                currentDialog.remove();
            });
            dialog.addEventListener('cancel', (event) => { if (dialog.querySelector('[data-directory-confirm][data-busy="true"]')) event.preventDefault(); });
        }
        if (!dialog.open) dialogOrigin = document.activeElement;
        dialog.innerHTML = `<div class="modal-header"><h2 id="admin-directory-dialog-title">${esc(title)}</h2><button class="ghost-btn" type="button" data-directory-action="close">關閉</button></div><div class="directory-dialog-body">${body}</div>`;
        if (!dialog.open) dialog.showModal();
    }

    function showDevices(employeeId) {
        const group = deviceGroups().find((entry) => entry.employeeId === employeeId);
        if (!group) return;
        openDialog(`${group.employeeId} / ${group.employeeName} 的綁定裝置`, `<p class="helper-text">共 ${group.devices.length} 台 / 上限 ${deviceLimit()} 台。${group.devices.length >= 3 ? '已達 3 台以上，請先比對裝置登入診斷。' : ''}${group.devices.length >= deviceLimit() ? '已達目前上限，啟用綁定時會擋下新裝置。' : ''}解除只影響這位員工，系統不會自動刪除綁定；解除後原裝置需重新登入及綁定，依目前遠端打卡規則驗證。</p><p class="helper-text">裝置是瀏覽器與網站來源儲存的身分；裝置名稱及 IP 不能單獨證明是同一台實體電腦。</p>
            <div class="directory-device-list">${group.devices.map((device) => `<article class="directory-device"><div class="list-toolbar"><h3>${esc(device.deviceDisplayName || device.device_name || device.device_id)}</h3>${canManage() ? `<button class="outline-btn" type="button" data-directory-action="remove-one" data-employee-id="${esc(employeeId)}" data-device-id="${esc(device.device_id)}">解除此裝置</button>` : ''}</div><dl><div><dt>裝置 ID</dt><dd>${esc(device.device_id)}</dd></div><div><dt>平台</dt><dd>${esc(device.platform || '未提供')}</dd></div><div><dt>綁定時間</dt><dd>${esc(formatTime(device.created_at))}</dd></div><div><dt>最近登入</dt><dd>${esc(formatTime(device.last_seen_at))}</dd></div><div><dt>最近 IP</dt><dd>${esc(device.last_ip || '未提供')}</dd></div><div><dt>最近 GPS</dt><dd>${esc(device.lastLocationText || '尚未記錄 GPS')}</dd></div><div><dt>GPS 記錄時間</dt><dd>${esc(formatTime(device.last_gps_at))}</dd></div></dl></article>`).join('')}</div>
            ${canManage() && group.devices.length ? `<div class="directory-danger-zone"><div><strong>解除此人全部裝置</strong><p class="helper-text">僅限 ${esc(employeeId)} 的 ${group.devices.length} 台；下一步會列出影響範圍並要求輸入工號。</p></div><button class="outline-btn" type="button" data-directory-action="remove-all" data-employee-id="${esc(employeeId)}">解除此人全部裝置</button></div>` : ''}`);
    }

    function showRemote(employeeId) {
        const group = (security().recentBrowserPunchEmployees || []).find((entry) => entry.employeeId === employeeId);
        if (!group) return;
        const range = security().recentBrowserPunchRange;
        openDialog(`${group.employeeId} / ${group.employeeName} 的遠端打卡`, `<div class="directory-range"><strong>${esc(range?.startDate)} — ${esc(range?.endDate)}</strong><span>${group.totalCount} 筆 · ${group.activeDays} 天 · ${group.deviceCount} 台裝置 · 風險提示 ${group.riskyCount} 筆</span></div><p class="helper-text">時間採台北時間；風險提示用於查核，不等同違規判定。${group.employeeMissing ? '原員工主檔已刪除，仍保留工號及打卡紀錄。' : ''}</p>
            <div class="data-table-wrap directory-table-wrap"><table class="data-table directory-table"><thead><tr><th>打卡時間</th><th>類型 / 狀態</th><th>裝置</th><th>GPS / 精度</th><th>風險提示</th></tr></thead><tbody>${group.records.map((record) => `<tr><td>${esc(record.timestampText)}</td><td>${esc(record.typeText)}<div class="directory-muted">${esc(record.status || '正常')}</div></td><td>${esc(record.deviceName || record.deviceId || '未提供')}<div class="directory-muted">${esc(record.deviceId)}</div></td><td>${esc(record.locationText || '未提供定位')}<div class="directory-muted">GPS 狀態：${esc(record.gpsStatus || '未提供')}</div></td><td>${renderSecurityRiskBadges(record.riskFlags)}</td></tr>`).join('')}</tbody></table></div>`);
    }

    function confirmRemoval(employeeId, deviceId) {
        if (!canManage()) return;
        const group = deviceGroups().find((entry) => entry.employeeId === employeeId);
        const selected = group?.devices.filter((device) => !deviceId || device.device_id === deviceId) || [];
        if (!selected.length) return;
        openDialog('確認解除裝置綁定', `<form data-directory-confirm="${deviceId ? 'one' : 'all'}" data-employee-id="${esc(employeeId)}" data-device-id="${esc(deviceId || '')}"><div class="directory-warning"><strong>${esc(group.employeeName)}（${esc(employeeId)}） · 將解除 ${selected.length} 台</strong><p>其他員工不受影響。以下裝置的原綁定憑證將失效，員工需重新登入並依安全規則重新綁定；打卡歷史紀錄會保留。</p></div><ul class="directory-impact-list">${selected.map((device) => `<li>${esc(device.deviceDisplayName || device.device_name || device.device_id)}<span class="directory-muted"> · ${esc(device.device_id)}</span></li>`).join('')}</ul>
            <input type="hidden" name="expectedDeviceIds" value="${esc(JSON.stringify(selected.map((device) => device.device_id)))}">
            ${!deviceId ? `<label class="field"><span>輸入工號 ${esc(employeeId)} 以確認範圍</span><input name="confirmEmployeeId" autocomplete="off" required></label>` : ''}
            <label class="directory-confirm-check"><input name="confirmed" type="checkbox" required>我已確認上述人員、裝置與解除後的影響</label>
            <div class="inline-message" data-directory-message role="alert"></div>
            <div class="form-toolbar"><button class="outline-btn" type="button" data-directory-action="devices" data-employee-id="${esc(employeeId)}">返回裝置清單</button><button class="primary-btn directory-confirm-submit" type="submit" disabled>確認解除 ${selected.length} 台裝置</button></div></form>`);
    }

    function updateConfirm(form) {
        const checkbox = form.elements.confirmed;
        const valid = checkbox.checked && (form.dataset.directoryConfirm === 'one' || form.elements.confirmEmployeeId.value.trim() === form.dataset.employeeId);
        form.querySelector('[type="submit"]').disabled = !valid;
    }

    function refreshFilter(control) {
        const section = control.closest('[data-directory-kind]');
        if (!section) return;
        const kind = section.dataset.directoryKind;
        filters[kind][control.dataset.directoryFilter] = control.value;
        if (kind === 'diagnostics') return;
        section.querySelector('[data-directory-results]').innerHTML = kind === 'devices' ? renderDeviceResults(deviceGroups()) : renderRemoteResults(security().recentBrowserPunchEmployees || []);
    }

    document.addEventListener('input', (event) => {
        if (event.target.matches('[data-directory-filter]')) refreshFilter(event.target);
        const form = event.target.closest('[data-directory-confirm]');
        if (form) updateConfirm(form);
    });
    document.addEventListener('change', (event) => {
        if (event.target.matches('select[data-directory-filter]')) refreshFilter(event.target);
        const form = event.target.closest('[data-directory-confirm]');
        if (form) updateConfirm(form);
    });
    document.addEventListener('click', (event) => {
        const button = event.target.closest('[data-directory-action]');
        if (!button) return;
        const action = button.dataset.directoryAction, employeeId = button.dataset.employeeId;
        if (action === 'close' && !dialog?.querySelector('[data-directory-confirm][data-busy="true"]')) dialog?.close();
        if (action === 'devices') showDevices(employeeId);
        if (action === 'remote') showRemote(employeeId);
        if (action === 'remove-one') confirmRemoval(employeeId, button.dataset.deviceId);
        if (action === 'remove-all') confirmRemoval(employeeId);
        if ((action === 'diagnostics-previous' || action === 'diagnostics-next') && !diagnosticQuery.loading && diagnosticQuery.data) {
            const page = Number(diagnosticQuery.data.page) || 1;
            const next = page + (action === 'diagnostics-next' ? 1 : -1);
            const pages = Math.max(1, Math.ceil(Number(diagnosticQuery.data.total) / Number(diagnosticQuery.data.pageSize)));
            if (next >= 1 && next <= pages) loadDiagnostics(next, diagnosticQuery.applied);
        }
        if (action === 'reset') {
            const kind = button.dataset.kind;
            filters[kind] = defaultFilter(kind);
            if (kind === 'diagnostics') {
                diagnosticQuery.request += 1; diagnosticQuery.loading = false;
                diagnosticQuery.data = null; diagnosticQuery.error = ''; diagnosticQuery.applied = null;
            }
            const section = button.closest('[data-directory-kind]');
            section.outerHTML = kind === 'devices' ? renderDevices(getDatasets()) : kind === 'diagnostics' ? renderDiagnostics(getDatasets()) : renderRemote(getDatasets());
        }
    });
    document.addEventListener('submit', async (event) => {
        const queryForm = event.target.closest('[data-directory-diagnostics-query]');
        if (queryForm) {
            event.preventDefault();
            if (!queryForm.checkValidity()) { queryForm.reportValidity(); return; }
            await loadDiagnostics(1);
            return;
        }
        const form = event.target.closest('[data-directory-confirm]');
        if (!form) return;
        event.preventDefault();
        if (form.dataset.busy === 'true' || !form.checkValidity()) return;
        const all = form.dataset.directoryConfirm === 'all', values = new FormData(form), employeeId = form.dataset.employeeId;
        if (!values.has('confirmed') || (all && values.get('confirmEmployeeId').trim() !== employeeId)) return;
        const controls = [...form.querySelectorAll('button, input')];
        const submittedToken = state.token, submittedIdentity = sessionIdentity(), submittedGeneration = sessionGeneration;
        const isCurrentSession = () => state.token === submittedToken && sessionIdentity() === submittedIdentity && sessionGeneration === submittedGeneration;
        form.dataset.busy = 'true'; controls.forEach((control) => { control.disabled = true; });
        try {
            const result = await requestJson(all ? '/api/browser/admin/employee-devices/clear' : '/api/browser/admin/employee-device/delete', {
                method: 'POST', auth: true, body: all ? { employeeId, confirmed: true, confirmEmployeeId: values.get('confirmEmployeeId').trim(), expectedDeviceIds: JSON.parse(values.get('expectedDeviceIds')) } : { employeeId, deviceId: form.dataset.deviceId }
            });
            if (!isCurrentSession()) return;
            dialog?.close();
            const refreshedDashboard = await fetchDashboard();
            if (!isCurrentSession()) return;
            renderDashboard(refreshedDashboard);
            setMessage(ui.dashboardMessage, result.message || '裝置綁定已解除。', 'success');
        } catch (error) {
            if (!isCurrentSession() || !form.isConnected) return;
            form.querySelector('[data-directory-message]').textContent = error.message;
            controls.forEach((control) => { control.disabled = false; });
            form.dataset.busy = 'false'; updateConfirm(form);
        }
    });
    window.AdminDirectory = { renderDevices, renderRemote, renderManual, renderDiagnostics };
})();
