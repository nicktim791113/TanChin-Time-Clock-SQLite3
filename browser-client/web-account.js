auditRoleLabels.workspace = "個人帳號";
auditRoleLabels.password_change = "個人帳號";
Object.assign(auditActionLabels, {
    web_password_initialize: "首次設定個人網頁密碼",
    web_password_change: "修改個人網頁密碼",
    web_password_reset: "重設個人網頁密碼",
    web_password_reveal: "查看個人網頁密碼",
    web_privileged_access_change: "變更管理工作台登入",
    workspace_switch: "切換工作台"
});
auditTargetTypeLabels.web_account = "個人網頁帳號";

function renderWebPasswordForm(account = {}) {
    const initializing = account.canSetPassword && !account.configured;
    return `<form class="stack-form" data-web-password-change>
        <p class="muted">${initializing
            ? "你尚未設定個人網頁密碼。請輸入目前卡號驗證本人身分，再建立密碼；日後仍可使用原卡號登入及刷卡打卡。"
            : "修改密碼須驗證目前的個人網頁密碼。若忘記密碼，請聯絡具密碼管理權限的人員重設；卡號不能直接覆寫已有密碼。"}</p>
        <input type="hidden" name="passwordAction" value="${initializing ? "initialize" : "change"}">
        <label class="field"><span>${initializing ? "目前卡號" : "目前個人網頁密碼"}</span><input name="${initializing ? "currentCard" : "currentPassword"}" type="password" autocomplete="current-password" maxlength="128" required></label>
        <label class="field"><span>新個人網頁密碼</span><input name="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label>
        <label class="field"><span>確認新密碼</span><input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label>
        <p class="muted">密碼須為 8 至 128 個字元，前後不可留空白，也不可與卡號相同。儲存後須重新登入。管理者與開發者工作台另由有權人員授權啟用。</p>
        <button class="primary-btn" type="submit">${initializing ? "建立個人網頁密碼" : "修改密碼"}</button>
        <div class="inline-message" data-web-message aria-live="polite"></div>
    </form>`;
}

function renderWebCredentialManager(account) {
    const options = (account.credentialAccounts || []).map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.id)} ${escapeHtml(item.name)} (${item.configured ? item.mustChangePassword ? "待修改臨時密碼" : "已設定" : "未設定"})</option>`).join("");
    return `<section class="table-card web-credential-manager" aria-labelledby="web-credential-title">
        <h3 id="web-credential-title">個人網頁密碼管理</h3>
        <p class="muted">員工可在「個人帳號」自行首次建立密碼。此處供忘記密碼時設定臨時密碼；本人下次以臨時密碼登入後須修改。設定／重設密碼不會自動啟用管理工作台。</p>
        <form class="web-credential-form" data-web-credential-manager autocomplete="off">
            <label class="field"><span>員工帳號</span><select name="employeeId" required><option value="">選擇員工</option>${options}</select></label>
            <label class="field"><span>你目前的登入密碼</span><input name="currentPassword" type="password" autocomplete="current-password" maxlength="128" required></label>
            ${account.canReset ? `<label class="field"><span>新臨時網頁密碼</span><input name="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128"></label>
            <label class="field"><span>確認臨時密碼</span><input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128"></label>` : ""}
            <div class="inline-actions">
                ${account.canReset ? '<button class="secondary-btn" type="submit" name="operation" value="reset">設定／重設</button>' : ""}
                ${account.canReveal ? '<button class="outline-btn" type="submit" name="operation" value="reveal" formnovalidate>查看目前密碼</button>' : ""}
            </div>
            <div class="web-secret-result hidden"><label class="field"><span>目前有效的個人網頁密碼</span><input data-web-secret type="text" readonly autocomplete="off"></label><button class="ghost-btn" type="button" data-web-secret-hide>隱藏</button></div>
            <div class="inline-message" data-web-message aria-live="polite"></div>
        </form>
        ${account.canManagePrivilegedAccess ? renderPrivilegedAccessManager(account) : ""}
    </section>`;
}

function renderPrivilegedAccessManager(account) {
    const accounts = (account.credentialAccounts || []).filter((item) => (item.allowedRoles || []).some((role) => ["admin", "developer"].includes(role)));
    const options = accounts.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.id)} ${escapeHtml(item.name)} (${!item.configured ? "尚未設定密碼" : item.privilegedAccessEnabled ? "管理登入已啟用" : "管理登入未啟用"})</option>`).join("");
    return `<div class="web-privileged-access-manager">
        <h4>管理工作台登入啟用</h4>
        <p class="muted">僅系統管理者或開發人員可操作。先在帳號權限管理指定角色，再於此啟用；不會新增角色或擴大權限。停用後仍可使用員工功能。每次變更均記錄原因，並使該員工目前的登入失效。</p>
        ${accounts.length ? `<form class="stack-form" data-web-privileged-access autocomplete="off">
            <label class="field"><span>管理工作台帳號</span><select name="employeeId" required><option value="">選擇已有管理角色的員工</option>${options}</select></label>
            <label class="field"><span>驗證你的登入密碼</span><input name="currentPassword" type="password" autocomplete="current-password" maxlength="128" required></label>
            <label class="field"><span>啟用／停用原因</span><input name="reason" type="text" maxlength="500" required></label>
            <div class="inline-actions"><button class="secondary-btn" type="submit" value="enable_privileged">啟用管理登入</button><button class="outline-btn" type="submit" value="disable_privileged">停用管理登入</button></div>
            <div class="inline-message" data-web-message aria-live="polite"></div>
        </form>` : '<p class="muted">目前沒有已指定管理者或開發人員角色的員工。</p>'}
    </div>`;
}

const previousWebSetActiveRole = setActiveRole;
setActiveRole = function setUnifiedLoginRole(role) {
    if (role === "system_admin") return previousWebSetActiveRole(role);
    state.activeRole = "account";
    ui.roleSelector.querySelectorAll(".role-chip").forEach((button) => button.classList.toggle("active", button.dataset.role === "account"));
    ui.employeeIdLabel.textContent = "員工編號";
    ui.employeeIdInput.placeholder = "輸入員工編號";
    ui.secretLabel.textContent = "卡號或個人網頁密碼";
    ui.secretInput.placeholder = "輸入卡號或個人網頁密碼";
    ui.roleHelp.textContent = "";
    ui.loginSubmitBtn.textContent = "登入";
    setMessage(ui.loginMessage, "");
};

let webSecretTimer = null;
let workspaceSwitchBusy = false;

const previousWebBuildDeviceInfo = buildClientDeviceInfo;
buildClientDeviceInfo = function buildAccountDeviceInfo(employeeId = state.dashboard?.user?.id || ui.employeeIdInput.value.trim()) {
    return previousWebBuildDeviceInfo(employeeId);
};

const previousWebStoreDeviceToken = storeIssuedDeviceToken;
storeIssuedDeviceToken = function storeAccountDeviceToken(token, employeeId, canonicalDeviceId) {
    return previousWebStoreDeviceToken(token, employeeId, canonicalDeviceId);
};

function clearWebSecrets() {
    clearTimeout(webSecretTimer);
    document.querySelectorAll("[data-web-secret]").forEach((input) => { input.value = ""; });
    document.querySelectorAll(".web-secret-result").forEach((element) => element.classList.add("hidden"));
}

const previousWebRenderDashboard = renderDashboard;
renderDashboard = function renderPersonalLoginDashboard(dashboard) {
    clearWebSecrets();
    if (["workspace", "password_change"].includes(dashboard.role)) {
        state.dashboard = dashboard;
        stopClock();
        closeRealtimeSync();
        syncHeroHeader(dashboard);
        syncDashboardIdentityPill(dashboard);
        ui.dashboardHelpBtn.classList.add("hidden");
        ui.dashboardTitle.textContent = dashboard.role === "password_change" ? "修改臨時網頁密碼" : "選擇工作台";
        ui.dashboardContent.innerHTML = dashboard.role === "password_change"
            ? `<div class="web-password-change">${renderWebPasswordForm(dashboard.webAccount)}</div>`
            : `<div class="web-workspace-options">${(dashboard.webAccount?.availableRoles || []).map((role) => `<button class="outline-btn" type="button" data-web-workspace="${escapeHtml(role.id)}">${escapeHtml(role.label)}</button>`).join("")}</div>`;
    } else {
        previousWebRenderDashboard(dashboard);
    }
    const account = dashboard.webAccount || {};
    const switcher = document.getElementById("workspace-switch");
    const roles = account.availableRoles || [];
    switcher.innerHTML = roles.map((role) => `<option value="${escapeHtml(role.id)}">${escapeHtml(role.label)}</option>`).join("");
    switcher.value = dashboard.role;
    switcher.classList.toggle("hidden", roles.length < 2 || ["workspace", "password_change"].includes(dashboard.role));
    document.getElementById("personal-account-btn").classList.toggle("hidden", !(account.canSetPassword || account.canChangePassword) || dashboard.role === "password_change");
    const showManager = dashboard.role === "system_admin"
        || (dashboard.role === "developer" && state.activeSections.developer === "systemSettings"
            && state.activeSubSections?.developer?.systemSettings === "accountAccess")
        || (dashboard.role === "admin" && state.activeSections.admin === "security");
    if (showManager && (account.canReset || account.canReveal)) {
        const content = ui.dashboardContent.querySelector(dashboard.role === "system_admin" ? ".workspace-shell" : ".workspace-subnav-content");
        const accountCard = content?.querySelector(":scope > .account-access-card");
        const toolbar = content?.querySelector(":scope > .wb-page-toolbar");
        if (accountCard) accountCard.insertAdjacentHTML("beforebegin", renderWebCredentialManager(account));
        else if (toolbar) toolbar.insertAdjacentHTML("afterend", renderWebCredentialManager(account));
        else content?.insertAdjacentHTML("beforeend", renderWebCredentialManager(account));
    }
};

const previousWebInitializeRealtimeSync = initializeRealtimeSync;
initializeRealtimeSync = function initializeAccountRealtimeSync() {
    if (["workspace", "password_change"].includes(state.dashboard?.role)) return;
    return previousWebInitializeRealtimeSync();
};

const previousWebHandleLogin = handleLoginSubmit;
handleLoginSubmit = async function handleUnifiedAccountLogin(event) {
    await previousWebHandleLogin(event);
    ui.secretInput.value = "";
};

const previousWebHandleLogout = handleLogout;
handleLogout = async function logoutPersonalAccount(isSilent = false) {
    clearWebSecrets();
    const dialog = document.getElementById("personal-account-dialog");
    dialog.close();
    document.getElementById("personal-account-content").innerHTML = "";
    document.getElementById("workspace-switch").classList.add("hidden");
    document.getElementById("personal-account-btn").classList.add("hidden");
    return previousWebHandleLogout(isSilent);
};

async function switchWebWorkspace(role) {
    if (workspaceSwitchBusy) return;
    workspaceSwitchBusy = true;
    const switcher = document.getElementById("workspace-switch");
    switcher.disabled = true;
    document.querySelectorAll("[data-web-workspace]").forEach((button) => { button.disabled = true; });
    clearWebSecrets();
    closeRealtimeSync();
    try {
        const result = await requestJson("/api/browser/workspace", { method: "POST", auth: true, body: { role, deviceInfo: buildClientDeviceInfo() } });
        await persistBrowserDeviceBinding(result);
        state.token = result.token;
        sessionStorage.setItem("browserPortalToken", result.token);
        renderDashboard(result.dashboard);
        initializeRealtimeSync();
        setMessage(ui.dashboardMessage, "", "success");
    } catch (error) {
        switcher.value = state.dashboard?.role || "";
        setMessage(ui.dashboardMessage, error.message, "error");
        if (/P21[237]/.test(error.message)) window.DeviceRecovery?.offer();
        initializeRealtimeSync();
    } finally {
        workspaceSwitchBusy = false;
        switcher.disabled = false;
        document.querySelectorAll("[data-web-workspace]").forEach((button) => { button.disabled = false; });
    }
}

async function submitWebAccountForm(event) {
    const form = event.target;
    const changing = form.matches("[data-web-password-change]");
    const managing = form.matches("[data-web-credential-manager]");
    const privileged = form.matches("[data-web-privileged-access]");
    if (!changing && !managing && !privileged) return false;
    event.preventDefault();
    if (form.dataset.webBusy) return true;
    const message = form.querySelector("[data-web-message]");
    const values = Object.fromEntries(new FormData(form));
    const operation = changing ? values.passwordAction : event.submitter?.value || "reset";
    const initializing = changing && operation === "initialize";
    if (!(initializing ? values.currentCard : values.currentPassword) || (!changing && !values.employeeId)) {
        setMessage(message, initializing ? "請輸入目前卡號驗證本人身分。" : changing ? "請輸入目前個人網頁密碼。" : "請選擇帳號並輸入你目前的登入密碼。", "error");
        return true;
    }
    if (privileged && !String(values.reason || "").trim()) {
        setMessage(message, "請填寫啟用或停用管理登入的原因。", "error");
        return true;
    }
    if (privileged && !["enable_privileged", "disable_privileged"].includes(operation)) {
        setMessage(message, "請選擇啟用管理登入或停用管理登入。", "error");
        return true;
    }
    if (privileged) values.enabled = operation === "enable_privileged";
    delete values.passwordAction;
    clearWebSecrets();
    form.dataset.webBusy = "true";
    form.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    try {
        const url = changing ? `/api/browser/account/password${initializing ? "/initialize" : ""}`
            : privileged ? "/api/browser/accounts/privileged-access" : `/api/browser/accounts/password/${operation}`;
        const result = await requestJson(url, { method: "POST", auth: true, body: values });
        form.querySelectorAll('input[type="password"]').forEach((input) => { input.value = ""; });
        if (result.requiresLogin) {
            await handleLogout(true);
            setMessage(ui.loginMessage, result.message, "success");
        } else if (operation === "reveal") {
            form.querySelector("[data-web-secret]").value = result.password;
            form.querySelector(".web-secret-result").classList.remove("hidden");
            setMessage(message, "", "success");
            webSecretTimer = setTimeout(clearWebSecrets, 60000);
        } else {
            await reloadDashboard(result.message);
        }
    } catch (error) {
        if (!state.token) setMessage(ui.loginMessage, error.message, "error");
        else setMessage(message, error.message, "error");
    } finally {
        delete form.dataset.webBusy;
        form.querySelectorAll("button").forEach((button) => { button.disabled = false; });
    }
    return true;
}

const previousWebHandleDashboardSubmit = handleDashboardSubmit;
handleDashboardSubmit = async function handleWebAccountDashboardSubmit(event) {
    if (event.target.matches("[data-web-password-change], [data-web-credential-manager], [data-web-privileged-access]")) return submitWebAccountForm(event);
    return previousWebHandleDashboardSubmit(event);
};

document.addEventListener("DOMContentLoaded", () => {
    const dialog = document.getElementById("personal-account-dialog");
    document.getElementById("personal-account-btn").addEventListener("click", () => {
        const account = state.dashboard?.webAccount || {};
        document.getElementById("personal-account-title").textContent = account.canSetPassword && !account.configured ? "首次設定個人網頁密碼" : "修改個人網頁密碼";
        document.getElementById("personal-account-content").innerHTML = renderWebPasswordForm(account);
        dialog.showModal();
    });
    const close = () => { dialog.close(); document.getElementById("personal-account-content").innerHTML = ""; };
    document.getElementById("personal-account-close").addEventListener("click", close);
    dialog.addEventListener("cancel", close);
    dialog.addEventListener("submit", submitWebAccountForm);
    document.getElementById("workspace-switch").addEventListener("change", (event) => switchWebWorkspace(event.target.value));
    ui.dashboardContent.addEventListener("click", (event) => {
        const button = event.target.closest("[data-web-workspace]");
        if (button) switchWebWorkspace(button.dataset.webWorkspace);
        if (event.target.closest("[data-web-secret-hide]")) clearWebSecrets();
    });
    ui.dashboardContent.addEventListener("change", (event) => {
        if (event.target.closest("[data-web-credential-manager]")) clearWebSecrets();
    });
    document.addEventListener("visibilitychange", () => { if (document.hidden) clearWebSecrets(); });
});
