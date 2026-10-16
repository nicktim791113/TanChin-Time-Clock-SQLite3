(() => {
    'use strict';
    const filters = { devices: { query: '', department: '', status: '' }, remote: { query: '', department: '', status: '' } };
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
        dialogOrigin = null;
        if (dialog) {
            const previousDialog = dialog;
            dialog = null;
            if (previousDialog.open) previousDialog.close();
            previousDialog.replaceChildren();
            previousDialog.remove();
        }
        for (const kind of ['devices', 'remote']) filters[kind] = { query: '', department: '', status: '' };
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
    const security = () => getDatasets().security || {};
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
        if (kind === 'remote' && filter.status === 'risky' && !group.riskyCount) return false;
        if (kind === 'remote' && filter.status === 'normal' && group.riskyCount) return false;
        const query = filter.query.trim().toLowerCase();
        return !query || [group.employeeId, group.employeeName, group.department,
            ...(group.devices || []).flatMap((device) => [device.deviceDisplayName, device.device_id, device.last_ip])
        ].join(' ').toLowerCase().includes(query);
    }

    function renderFilters(kind, groups) {
        const filter = filters[kind], departments = [...new Set(groups.map((group) => group.department).filter(Boolean))].sort();
        const statuses = kind === 'devices' ? [['bound', '已綁定'], ['unbound', '尚未綁定']] : [['risky', '有風險提示'], ['normal', '無風險提示']];
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

    function renderDeviceResults(groups) {
        const rows = groups.filter((group) => matches(group, 'devices'));
        return `<p class="helper-text" role="status">顯示 ${rows.length} / ${groups.length} 人 · 篩選結果共 ${rows.reduce((sum, group) => sum + group.devices.length, 0)} 台裝置</p>
            ${rows.length ? `<div class="data-table-wrap directory-table-wrap"><table class="data-table directory-table"><thead><tr><th>人員</th><th>部門</th><th>綁定狀態</th><th>最近登入</th><th>操作</th></tr></thead><tbody>
            ${rows.map((group) => `<tr><td>${employeeCell(group)}</td><td>${esc(group.department || '未指定')}</td><td>${renderBadge(group.devices.length ? `${group.devices.length} 台已綁定` : '尚未綁定', group.devices.length ? 'success' : '')}</td><td>${esc(formatTime(group.latestAt))}</td><td>${group.devices.length ? `<button class="mini-btn" type="button" data-directory-action="devices" data-employee-id="${esc(group.employeeId)}">檢視裝置</button>` : '<span class="directory-muted">無可解除裝置</span>'}</td></tr>`).join('')}</tbody></table></div>` : renderEmptyState('沒有符合篩選條件的人員。')}`;
    }

    function renderRemoteResults(groups) {
        const rows = groups.filter((group) => matches(group, 'remote'));
        return `<p class="helper-text" role="status">顯示 ${rows.length} / ${groups.length} 人 · 篩選結果共 ${rows.reduce((sum, group) => sum + group.totalCount, 0)} 筆 · 風險提示 ${rows.reduce((sum, group) => sum + group.riskyCount, 0)} 筆</p>
            ${rows.length ? `<div class="data-table-wrap directory-table-wrap"><table class="data-table directory-table"><thead><tr><th>人員</th><th>部門</th><th>打卡總數</th><th>上班 / 下班</th><th>打卡天數</th><th>裝置數</th><th>風險提示</th><th>最近打卡</th><th>操作</th></tr></thead><tbody>
            ${rows.map((group) => `<tr><td>${employeeCell(group)}</td><td>${esc(group.department || '未指定')}</td><td><strong>${group.totalCount}</strong></td><td>${group.inCount} / ${group.outCount}</td><td>${group.activeDays} 天</td><td>${group.deviceCount}</td><td>${renderBadge(`${group.riskyCount} 筆`, group.riskyCount ? 'warning' : 'success')}</td><td>${esc(group.latestText)}</td><td><button class="mini-btn" type="button" data-directory-action="remote" data-employee-id="${esc(group.employeeId)}">查看明細</button></td></tr>`).join('')}</tbody></table></div>` : renderEmptyState('最近 14 日沒有符合條件的遠端打卡人員。')}`;
    }

    function renderDevices(datasets) {
        const groups = deviceGroups(datasets);
        return `<section data-directory-kind="devices" aria-label="裝置綁定人員清單">${renderFilters('devices', groups)}<div data-directory-results>${renderDeviceResults(groups)}</div></section>`;
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
        openDialog(`${group.employeeId} / ${group.employeeName} 的綁定裝置`, `<p class="helper-text">共 ${group.devices.length} 台；解除只影響這位員工。解除後原裝置需重新登入及綁定，依目前遠端打卡規則驗證。</p>
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
        if (action === 'reset') {
            const kind = button.dataset.kind;
            filters[kind] = { query: '', department: '', status: '' };
            const section = button.closest('[data-directory-kind]');
            section.outerHTML = kind === 'devices' ? renderDevices(getDatasets()) : renderRemote(getDatasets());
        }
    });
    document.addEventListener('submit', async (event) => {
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
    window.AdminDirectory = { renderDevices, renderRemote, renderManual };
})();
