function requestTimingPeriods(kind, body) {
    if (kind === 'leave') {
        return (body.leaveSegments || []).map(({ startAt, endAt }) => [startAt, endAt])
            .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
    }
    return [[Date.parse(`${body.startDate}T${body.startTime}:00+08:00`),
        Date.parse(`${body.endDate}T${body.endTime}:00+08:00`)]];
}

let pendingPastRequestTiming = null;

function cancelPendingPastRequestTiming() {
    pendingPastRequestTiming?.(false);
}

function confirmPastRequestTiming(kind, body, draft, now = Date.now()) {
    const periods = requestTimingPeriods(kind, body);
    const key = JSON.stringify(periods);
    if (draft.pastTimingConfirmed !== key) draft.pastTimingConfirmed = null;
    if (!periods.some(([start]) => Number.isFinite(start) && start < now) || draft.pastTimingConfirmed === key) return true;
    if (pendingPastRequestTiming) return false;
    return new Promise(resolve => {
        const dialog = document.createElement('dialog');
        dialog.id = 'past-request-timing-dialog';
        dialog.className = 'wb-dialog';
        dialog.setAttribute('aria-labelledby', 'past-request-timing-title');
        dialog.innerHTML = '<header class="wb-dialog-header"><h2 id="past-request-timing-title">事後申請確認</h2></header><div class="wb-dialog-body"><p>此為事後提出申請，請確認是否違反申請流程</p><div class="form-actions"><button type="button" class="outline-btn" data-past-request-back autofocus>返回修改</button><button type="button" class="primary-btn" data-past-request-confirm>確認繼續</button></div></div>';
        dialog.querySelector('[data-past-request-back]').onclick = () => dialog.close();
        dialog.querySelector('[data-past-request-confirm]').onclick = () => dialog.close('continue');
        const finish = confirmed => {
            if (pendingPastRequestTiming !== finish) return;
            pendingPastRequestTiming = null;
            if (confirmed) draft.pastTimingConfirmed = key;
            if (dialog.open) dialog.close();
            dialog.remove();
            resolve(confirmed);
        };
        pendingPastRequestTiming = finish;
        dialog.addEventListener('close', () => finish(dialog.returnValue === 'continue'), { once: true });
        document.body.append(dialog);
        dialog.showModal();
    });
}
