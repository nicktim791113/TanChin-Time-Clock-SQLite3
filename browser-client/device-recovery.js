/* Recovery proof stays in this tab. IP and browser metadata are never identity proof. */
(() => {
    'use strict';
    const key = 'tanchin.pendingDeviceRecovery';
    const esc = (value) => escapeHtml(String(value ?? ''));
    const time = (value) => value ? new Date(value).toLocaleString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' }) : '未提供';
    const labels = { pending: '待管理者確認', approved: '已核准，等待本人完成', rejected: '已拒絕', completed: '已完成恢復', expired: '已逾期' };
    const canView = () => state.dashboard?.role === 'system_admin' || hasCurrentAdminPermission('admin.security.view');
    const canManage = () => !state.dashboard?.impersonation?.active
        && (state.dashboard?.role === 'system_admin' || hasCurrentAdminPermission('admin.security.manage'));
    let pending = null, dialog = null, origin = null, rows = [], generation = 0, listSequence = 0;
    try { pending = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { /* memory-only fallback */ }
    if (!pending?.requestId || !pending?.requestToken || Number(pending.expiresAt) <= Date.now()) pending = null;
    function remember(value) {
        pending = value;
        try { if (value) sessionStorage.setItem(key, JSON.stringify(value)); else sessionStorage.removeItem(key); } catch { /* retain in memory while tab is open */ }
    }
    async function requestRecovery(route, body) {
        // Failed applicant credentials must not log out an unrelated workspace or erase progress.
        const response = await fetch(`/api/browser/device-recovery/${route}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.success === false) throw new Error(result.error || '無法處理恢復申請，請稍後再試。');
        return result;
    }
    function close() { if (dialog && dialog.dataset.busy !== 'true') dialog.close(); }
    function open(title, content) {
        if (!dialog) {
            origin = document.activeElement;
            dialog = document.createElement('dialog');
            dialog.className = 'directory-dialog recovery-dialog';
            dialog.setAttribute('aria-labelledby', 'device-recovery-title');
            document.body.append(dialog);
            const current = dialog;
            current.addEventListener('cancel', (event) => { if (current.dataset.busy === 'true') event.preventDefault(); });
            current.addEventListener('close', () => {
                current.replaceChildren(); current.remove();
                if (dialog === current) { dialog = null; origin?.isConnected && origin.focus(); origin = null; }
            });
        }
        dialog.innerHTML = `<div class="modal-header"><h2 id="device-recovery-title">${esc(title)}</h2><button type="button" class="ghost-btn" data-recovery-action="close">關閉</button></div><div class="directory-dialog-body">${content}<div data-recovery-message class="inline-message" role="status" aria-live="polite"></div></div>`;
        if (!dialog.open) dialog.showModal();
    }
    function message(value) { const target = dialog?.querySelector('[data-recovery-message]'); if (target) target.textContent = value; }
    async function busy(operation) {
        if (!dialog || dialog.dataset.busy === 'true') return;
        const current = dialog, identity = generation;
        current.dataset.busy = 'true';
        const controls = [...current.querySelectorAll('button,input,select,textarea')];
        controls.forEach((control) => { control.disabled = true; });
        try { await operation(() => generation === identity && dialog === current); }
        catch (error) { if (generation === identity && dialog === current) message(error.message); }
        finally { current.dataset.busy = 'false'; controls.forEach((control) => { if (control.isConnected) control.disabled = false; }); }
    }
    function showRequest() {
        const employeeId = state.dashboard?.user?.id || ui.employeeIdInput.value.trim();
        if (pending && employeeId && pending.employeeId !== employeeId) remember(null);
        if (pending && Number(pending.expiresAt) > Date.now()) return showPending();
        remember(null);
        open('申請恢復原裝置', `<p>原本使用的電腦因綁定資料遺失而無法登入時，可請管理者確認並恢復原綁定。</p>
            <p class="helper-text">核准前不會取得員工工作台權限。請使用平常的瀏覽器與一般視窗，並保留此分頁；申請有效時間為 15 分鐘。</p>
            <form data-recovery-form="request" class="stack-form">
                <label class="field"><span>員工編號</span><input name="employeeId" autocomplete="username" value="${esc(employeeId)}" required maxlength="80"></label>
                <label class="field"><span>卡號或個人網頁密碼</span><input name="secret" type="password" autocomplete="current-password" required></label>
                <label class="field"><span>恢復原因</span><textarea name="reason" rows="3" maxlength="500" required placeholder="例如：原本辦公室電腦今天無法登入，請協助確認舊綁定。"></textarea></label>
                <button type="submit" class="primary-btn">送出恢復申請</button>
            </form>`);
    }
    function showPending(result = pending) {
        const status = result.status || 'pending';
        const retrySave = status === 'completed';
        open('原裝置恢復進度', `<div class="recovery-status"><strong>${esc(retrySave ? '伺服器已恢復，等待本機保存憑證' : labels[status] || status)}</strong><p>工號 ${esc(pending.employeeId)} · 申請 ${esc(pending.requestId)}</p><p>有效期限：${esc(time(pending.expiresAt))}</p></div>
            ${result.decisionReason ? `<p>管理者說明：${esc(result.decisionReason)}</p>` : ''}
            <p class="helper-text">${retrySave ? '請允許此網站保存資料，再於有效期限內重新保存憑證；這不會再次替換綁定或增加名額。' : status === 'approved' ? '管理者已選定一筆舊綁定。完成恢復後，該筆舊憑證會失效，綁定總數不會增加。' : '請通知管理者至「安全設定 → 原裝置恢復申請」確認，並保留此分頁。關閉時清除網站資料可能使問題再次發生。'}</p>
            <div class="form-toolbar">
                ${['pending', 'approved'].includes(status) ? '<button type="button" class="outline-btn" data-recovery-action="status">查看核准結果</button>' : ''}
                ${status === 'approved' || retrySave ? `<button type="button" class="primary-btn" data-recovery-action="complete">${retrySave ? '重新保存裝置憑證' : '完成恢復'}</button>` : ''}
                ${['expired', 'rejected'].includes(status) ? '<button type="button" class="outline-btn" data-recovery-action="new">重新申請</button>' : ''}
            </div>`);
    }
    function offer() {
        const container = ui.loginView.classList.contains('hidden') ? ui.dashboardContent : ui.loginView;
        let button = container.querySelector('[data-recovery-action="request"]');
        if (!button) {
            button = document.createElement('button');
            button.type = 'button'; button.className = 'outline-btn recovery-entry';
            button.dataset.recoveryAction = 'request'; button.textContent = '原裝置無法登入？申請恢復';
            container.append(button);
        }
    }
    function renderAdmin() {
        if (!canView()) return '<p class="helper-text">需要安全設定檢視權限才能查看恢復申請。</p>';
        return `<section data-recovery-admin aria-label="原裝置恢復申請"><p class="helper-text">先與員工確認使用的電腦，再選擇要替換的舊綁定。員工完成恢復時才使舊憑證及相關登入失效；沿用每人裝置上限（最多 4 台），不依 IP 自動合併。</p>
            <button class="outline-btn" type="button" data-recovery-action="refresh">重新整理申請</button><div data-recovery-list role="status">正在載入恢復申請…</div></section>`;
    }
    function renderRows() {
        return rows.length ? `<div class="recovery-list">${rows.map((row) => `<article class="recovery-card">
            <div class="list-toolbar"><div><strong>${esc(row.employeeId)} / ${esc(row.employeeName)}</strong><div class="directory-muted">申請時間 ${esc(time(row.requestedAt))}</div></div>${renderBadge(labels[row.status] || row.status, row.status === 'pending' ? 'warning' : row.status === 'completed' ? 'success' : '')}</div>
            <p>${esc(row.reason)}</p><div class="directory-muted">${esc(row.deviceName || row.platform)} · ${esc(row.ipAddress)} · 有效期限 ${esc(time(row.expiresAt))}</div>
            ${row.decisionReason ? `<p>確認說明：${esc(row.decisionReason)}</p>` : ''}
            ${row.status === 'pending' && canManage() ? `<button class="primary-btn" type="button" data-recovery-action="review" data-request-id="${esc(row.requestId)}">確認恢復申請</button>` : ''}
        </article>`).join('')}</div>` : '<p class="helper-text">目前沒有恢復申請。員工須先在登入頁提出申請。</p>';
    }
    async function loadAdmin() {
        const container = document.querySelector('[data-recovery-admin]');
        if (!container || !canView()) return;
        const identity = generation, token = state.token, sequence = ++listSequence;
        const target = container.querySelector('[data-recovery-list]');
        target.textContent = '正在載入恢復申請…';
        try {
            const result = await requestJson('/api/browser/admin/device-recovery-requests', { auth: true });
            if (generation !== identity || state.token !== token || !container.isConnected || sequence !== listSequence) return;
            rows = result.requests || []; target.innerHTML = renderRows();
        } catch (error) { if (target.isConnected && generation === identity && sequence === listSequence) target.textContent = error.message; }
    }
    function review(requestId) {
        if (!canManage()) return;
        const row = rows.find((item) => item.requestId === requestId);
        if (!row || row.status !== 'pending') return;
        open('確認恢復原裝置', `<div class="directory-warning"><strong>${esc(row.employeeId)} / ${esc(row.employeeName)}</strong><p>請與本人確認後，明確選定一筆舊綁定。員工完成恢復時會替換其憑證，並登出該舊綁定的登入階段；其他綁定保留。</p></div>
            <p>申請原因：${esc(row.reason)}</p><p class="helper-text">本次瀏覽器：${esc(row.deviceName)} · ${esc(row.siteOrigin)} · ${esc(row.ipAddress)}。相同 IP 不能證明是同一臺電腦。</p>
            <form data-recovery-form="decision" data-request-id="${esc(requestId)}" class="stack-form">
                <fieldset class="recovery-choices"><legend>選擇要恢復的舊綁定</legend>${(row.oldDevices || []).map((device) => `<label class="recovery-choice"><input type="radio" name="oldDeviceId" value="${esc(device.device_id || device.deviceId)}"><span><strong>${esc(device.device_name || device.deviceName || device.deviceDisplayName)}</strong><small>${esc(device.device_id || device.deviceId)}</small><small>最近登入 ${esc(time(device.last_seen_at || device.lastSeenAt))} · ${esc(device.last_ip || device.lastIp)}</small></span></label>`).join('')}</fieldset>
                <label class="field"><span>確認或拒絕原因</span><textarea name="reason" rows="2" maxlength="500" required></textarea></label>
                <label class="directory-confirm-check"><input type="checkbox" name="confirmed"><span>我已與員工確認，核准時僅恢復選定的一筆舊綁定。</span></label>
                <div class="form-toolbar"><button type="submit" name="decision" value="reject" class="outline-btn">拒絕申請</button><button type="submit" name="decision" value="approve" class="primary-btn">確認核准恢復</button></div>
            </form>`);
    }
    document.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-recovery-action]');
        if (!button) return;
        const action = button.dataset.recoveryAction;
        if (action === 'close') return close();
        if (action === 'request') return showRequest();
        if (action === 'new') { remember(null); return showRequest(); }
        if (action === 'refresh') return loadAdmin();
        if (action === 'review') return review(button.dataset.requestId);
        if (!pending) return;
        if (action === 'status') await busy(async (current) => {
            const result = await requestRecovery('status', { requestId: pending.requestId, requestToken: pending.requestToken });
            if (!current()) return;
            remember({ ...pending, status: result.status }); showPending(result);
        });
        if (action === 'complete') await busy(async (current) => {
            const applicant = { ...pending };
            const result = await requestRecovery('complete', { requestId: applicant.requestId, requestToken: applicant.requestToken });
            if (!current()) return;
            const binding = result.deviceBinding;
            let storage;
            try { storage = storeIssuedDeviceToken(binding.issuedDeviceToken, applicant.employeeId, binding.deviceId); }
            catch (error) {
                requestRecovery('storage-status', { requestId: applicant.requestId, requestToken: applicant.requestToken,
                    deviceId: binding.deviceId, ...(error.devicePersistence || { persisted: false }) }).catch(() => {});
                throw error;
            }
            requestRecovery('storage-status', { requestId: applicant.requestId, requestToken: applicant.requestToken,
                deviceId: binding.deviceId, persisted: storage?.persisted === true,
                localStorageStatus: storage?.localStorageStatus, cookieStorageStatus: storage?.cookieStorageStatus }).catch(() => {});
            remember(null);
            open('已恢復原裝置', '<p>裝置憑證已保存，綁定總數沒有增加。請關閉此視窗，重新登入或重新選擇員工工作台。</p><p class="helper-text">請沿用同一瀏覽器與網站網址，並確認關閉瀏覽器時不會清除本網站資料。</p>');
        });
    });
    document.addEventListener('submit', async (event) => {
        const form = event.target.closest('[data-recovery-form]');
        if (!form) return;
        event.preventDefault();
        if (!form.checkValidity()) { form.reportValidity(); return; }
        const values = Object.fromEntries(new FormData(form));
        const decision = event.submitter?.value;
        if (form.dataset.recoveryForm === 'decision' && decision === 'approve' && (!values.oldDeviceId || !values.confirmed)) { message('請選擇一筆舊綁定，並勾選已與員工確認。'); return; }
        await busy(async (current) => {
            if (form.dataset.recoveryForm === 'request') {
                const employeeId = values.employeeId.trim();
                const deviceInfo = getBrowserDeviceIdentityStore().read(employeeId);
                const result = await requestRecovery('request', { employeeId, secret: values.secret, reason: values.reason,
                    deviceInfo: { ...deviceInfo, browserName: detectBrowserName(), platform: detectPlatformName() } });
                if (!current()) return;
                remember({ requestId: result.requestId, requestToken: result.requestToken, expiresAt: result.expiresAt, employeeId, status: result.status });
                form.elements.secret.value = ''; showPending();
            } else {
                if (!['approve', 'reject'].includes(decision)) return;
                await requestJson(`/api/browser/admin/device-recovery/${decision}`, { method: 'POST', auth: true,
                    body: { requestId: form.dataset.requestId, oldDeviceId: values.oldDeviceId, reason: values.reason } });
                if (!current()) return;
                dialog.dataset.busy = 'false'; close(); await loadAdmin();
            }
        });
        if (form.elements.secret) form.elements.secret.value = '';
    });
    document.addEventListener('DOMContentLoaded', () => {
        offer();
        const previousRender = renderDashboard;
        let identity = '';
        renderDashboard = function renderRecoveryDashboard(dashboard) {
            const next = `${state.token}:${dashboard.role}:${dashboard.user?.id}`;
            if (next !== identity) {
                generation++; rows = []; identity = next;
                if (dialog) { dialog.dataset.busy = 'false'; close(); }
                // A different signed-in person must never inherit an applicant's proof.
                if (pending && dashboard.user?.id !== pending.employeeId) remember(null);
            }
            const result = previousRender(dashboard);
            if (dashboard.role === 'employee') remember(null);
            if (document.querySelector('[data-recovery-admin]')) loadAdmin();
            return result;
        };
        const previousLogout = handleLogout;
        handleLogout = function logoutDeviceRecovery(...args) {
            generation++; rows = []; remember(null);
            if (dialog) { dialog.dataset.busy = 'false'; close(); }
            return previousLogout(...args);
        };
    });
    window.DeviceRecovery = { renderAdmin, offer };
})();
