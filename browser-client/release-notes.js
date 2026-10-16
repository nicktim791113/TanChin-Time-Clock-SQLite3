async function openReleaseNotes() {
    if (document.getElementById('release-notes-dialog')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'release-notes-dialog'; dialog.className = 'wb-dialog'; dialog.setAttribute('aria-labelledby', 'release-notes-title');
    dialog.innerHTML = '<header class="wb-dialog-header"><div><h2 id="release-notes-title">版本更新重點</h2><p>查看目前版本與歷次功能變更。</p></div><button type="button" class="outline-btn" aria-label="關閉更新重點">關閉</button></header><div class="wb-dialog-body" role="status">讀取更新重點中…</div>';
    dialog.querySelector('button').onclick = () => dialog.close();
    dialog.addEventListener('close', () => dialog.remove()); document.body.append(dialog); dialog.showModal();
    try {
        const response = await fetch(`./release-notes.json?v=${encodeURIComponent(state.appVersion || '')}`, { cache: 'no-cache' });
        if (!response.ok) throw new Error('目前無法讀取更新重點，請稍後再試。');
        const entries = await response.json(), current = String(state.appVersion || '').replace(/^v/i, '');
        if (!Array.isArray(entries)) throw new Error('更新重點格式錯誤，請聯絡管理者。');
        dialog.querySelector('.wb-dialog-body').removeAttribute('role');
        dialog.querySelector('.wb-dialog-body').innerHTML = `<div class="wb-release-list">${entries.map((entry, index) => `<details ${entry.version === current || (!current && index === 0) ? 'open' : ''}><summary>v${escapeHtml(entry.version)}${entry.version === current ? ' · 目前版本' : ''}<time>${escapeHtml(entry.date)}</time></summary><ul>${entry.highlights.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul></details>`).join('')}</div>`;
    } catch (error) { dialog.querySelector('.wb-dialog-body').textContent = error.message; }
}
document.addEventListener('DOMContentLoaded', () => {
    const badge = ui.heroVersionPill;
    if (!badge) return;
    // Preserve the shared version synchronizer and existing visual placement.
    badge.setAttribute('role', 'button'); badge.tabIndex = 0; badge.setAttribute('aria-haspopup', 'dialog');
    badge.setAttribute('aria-label', '查看版本更新重點'); badge.classList.add('wb-version-button');
    badge.addEventListener('click', openReleaseNotes);
    badge.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openReleaseNotes(); } });
});
