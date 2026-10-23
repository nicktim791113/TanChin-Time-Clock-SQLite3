(() => {
    const button = document.getElementById('back-to-top');
    if (!button) return;
    let scheduled = false;
    const update = () => {
        scheduled = false;
        button.hidden = window.scrollY < 240;
    };
    const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        window.requestAnimationFrame(update);
    };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    if (typeof ResizeObserver === 'function') new ResizeObserver(schedule).observe(document.body);
    button.addEventListener('click', () => {
        const title = document.getElementById('hero-title');
        title?.focus({ preventScroll: true });
        window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    });
    update();
})();
