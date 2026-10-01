auditRoleLabels.workspace = "個人帳號";
auditRoleLabels.password_change = "個人帳號";

function renderWebPasswordForm() {
    return `<form class="stack-form" data-web-password-change>
        <label class="field"><span>目前個人網頁密碼</span><input name="currentPassword" type="password" autocomplete="current-password" maxlength="128" required></label>
        <label class="field"><span>新個人網頁密碼</span><input name="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label>
        <label class="field"><span>確認新密碼</span><input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label>
        <button class="primary-btn" type="submit">修改密碼</button>
        <div class="inline-message" data-web-message aria-live="polite"></div>
    </form>`;
}

function renderWebCredentialManager(account) {
    const options = (account.credentialAccounts || []).map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.id)} ${escapeHtml(item.name)} (${item.configured ? item.mustChangePassword ? "待修改臨時密碼" : "已設定" : "未設定"})</option>`).join("");
    return `<section class="web-credential-manager" aria-labelledby="web-credential-title">
        <h3 id="web-credential-title">個人網頁密碼管理</h3>
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
    </section>`;
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

function readAccountDeviceTokens() {
    try {
        const value = JSON.parse(localStorage.getItem("browserPortalAccountDeviceTokens") || "{}");
        return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch { return {}; }
}

const previousWebBuildDeviceInfo = buildClientDeviceInfo;
buildClientDeviceInfo = function buildAccountDeviceInfo(employeeId = state.dashboard?.user?.id || ui.employeeIdInput.value.trim()) {
    const identity = previousWebBuildDeviceInfo();
    const tokens = readAccountDeviceTokens();
    const key = `id:${employeeId}`;
    if (Object.hasOwn(tokens, key)) identity.deviceToken = tokens[key];
    return identity;
};

const previousWebStoreDeviceToken = storeIssuedDeviceToken;
storeIssuedDeviceToken = function storeAccountDeviceToken(token, employeeId) {
    if (!token) return;
    if (!employeeId) return previousWebStoreDeviceToken(token);
    const tokens = readAccountDeviceTokens();
    tokens[`id:${employeeId}`] = token;
    localStorage.setItem("browserPortalAccountDeviceTokens", JSON.stringify(tokens));
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
            ? `<div class="web-password-change">${renderWebPasswordForm()}</div>`
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
    document.getElementById("personal-account-btn").classList.toggle("hidden", !account.canChangePassword || dashboard.role === "password_change");
    const showManager = dashboard.role === "system_admin"
        || (dashboard.role === "developer" && state.activeSections.developer === "systemSettings")
        || (dashboard.role === "admin" && state.activeSections.admin === "security");
    if (showManager && (account.canReset || account.canReveal)) ui.dashboardContent.insertAdjacentHTML("afterbegin", renderWebCredentialManager(account));
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
        storeIssuedDeviceToken(result.deviceBinding?.issuedDeviceToken || "", result.dashboard?.user?.id);
        state.token = result.token;
        sessionStorage.setItem("browserPortalToken", result.token);
        renderDashboard(result.dashboard);
        initializeRealtimeSync();
        setMessage(ui.dashboardMessage, "", "success");
    } catch (error) {
        switcher.value = state.dashboard?.role || "";
        setMessage(ui.dashboardMessage, error.message, "error");
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
    if (!changing && !managing) return false;
    event.preventDefault();
    if (form.dataset.webBusy) return true;
    const message = form.querySelector("[data-web-message]");
    const values = Object.fromEntries(new FormData(form));
    const operation = changing ? "change" : event.submitter?.value || "reset";
    if (!values.currentPassword || (operation !== "change" && !values.employeeId)) {
        setMessage(message, "請選擇帳號並輸入你目前的登入密碼。", "error");
        return true;
    }
    clearWebSecrets();
    form.dataset.webBusy = "true";
    form.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    try {
        const url = changing ? "/api/browser/account/password" : `/api/browser/accounts/password/${operation}`;
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
    if (event.target.matches("[data-web-password-change], [data-web-credential-manager]")) return submitWebAccountForm(event);
    return previousWebHandleDashboardSubmit(event);
};

document.addEventListener("DOMContentLoaded", () => {
    const dialog = document.getElementById("personal-account-dialog");
    document.getElementById("personal-account-btn").addEventListener("click", () => {
        document.getElementById("personal-account-content").innerHTML = renderWebPasswordForm();
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
