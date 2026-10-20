/**
 * Backward compatibility alias: js/lms.js -> lms-adapter.js
 */
(function () {
    if (!window.LMSAdapter) {
        const s = document.createElement('script');
        s.src = 'lms-adapter.js';
        document.head.appendChild(s);
    }
})();
