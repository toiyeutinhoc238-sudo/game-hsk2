/**
 * HSK 2 Millionaire - LMS (Learning Management System) & SCORM Compatibility Bridge
 * Supports: Moodle, Canvas, Blackboard, Schoology, Google Classroom, WordPress/LearnDash,
 * iFrames, SCORM 1.2, SCORM 2004, and HTML5 postMessage integration.
 */

(function (window) {
    'use strict';

    // 1. Safe Storage Layer (prevents SecurityError / DOMException in 3rd-party cross-origin iframes)
    const memStorage = {};
    const safeStorage = {
        getItem: function (key) {
            try {
                if (window.localStorage) {
                    return window.localStorage.getItem(key);
                }
            } catch (e) {
                // localStorage blocked by iframe sandbox or third-party cookie policy
            }
            return Object.prototype.hasOwnProperty.call(memStorage, key) ? memStorage[key] : null;
        },
        setItem: function (key, val) {
            try {
                if (window.localStorage) {
                    window.localStorage.setItem(key, val);
                    return;
                }
            } catch (e) {
                // Fallback to in-memory store
            }
            memStorage[key] = String(val);
        },
        removeItem: function (key) {
            try {
                if (window.localStorage) {
                    window.localStorage.removeItem(key);
                    return;
                }
            } catch (e) {}
            delete memStorage[key];
        }
    };
    window.safeStorage = safeStorage;

    // 2. Safe Audio Playback Helper (prevents unhandled NotAllowedError / Autoplay restrictions in LMS iframes)
    window.safePlayAudio = function (audio) {
        if (!audio) return;
        try {
            const p = audio.play();
            if (p && typeof p.catch === 'function') {
                p.catch(function (err) {
                    // Audio autoplay restricted until user gesture; harmless log
                    console.log('[LMS Audio] Playback deferred or restricted:', err.name || err.message);
                });
            }
        } catch (e) {
            console.log('[LMS Audio] Play error:', e);
        }
    };

    // 3. SCORM 1.2 & SCORM 2004 Discovery
    let scormAPI = null;
    let scormVersion = null; // '1.2' or '2004'
    let isScormInitialized = false;
    const startTime = new Date();

    function findScormAPI(win) {
        let attempts = 0;
        const maxAttempts = 10;
        let current = win;

        while (current && attempts < maxAttempts) {
            try {
                if (current.API) {
                    return { api: current.API, version: '1.2' };
                }
                if (current.API_1484_11) {
                    return { api: current.API_1484_11, version: '2004' };
                }
            } catch (e) {
                // Cross-origin iframe security error on accessing parent
                break;
            }

            try {
                if (current.parent && current.parent !== current) {
                    current = current.parent;
                } else if (current.opener) {
                    current = current.opener;
                } else {
                    break;
                }
            } catch (e) {
                break;
            }
            attempts++;
        }
        return null;
    }

    function formatScormTime(startDate) {
        const diff = Math.floor((new Date() - startDate) / 1000);
        const hours = Math.floor(diff / 3600);
        const minutes = Math.floor((diff % 3600) / 60);
        const seconds = diff % 60;
        
        const pad = (n) => (n < 10 ? '0' + n : n);
        return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }

    // 4. LMS Bridge Object
    const LMSBridge = {
        isEmbedded: false,

        init: function () {
            // Check if embedded in iframe
            try {
                this.isEmbedded = (window.self !== window.top);
            } catch (e) {
                this.isEmbedded = true;
            }

            if (this.isEmbedded && document.body) {
                document.body.classList.add('embedded-lms');
            }

            // SCORM Auto-Detection
            const found = findScormAPI(window);
            if (found) {
                scormAPI = found.api;
                scormVersion = found.version;
                try {
                    if (scormVersion === '1.2') {
                        const res = scormAPI.LMSInitialize('');
                        if (res === 'true' || res === true) {
                            isScormInitialized = true;
                            scormAPI.LMSSetValue('cmi.core.lesson_status', 'incomplete');
                            scormAPI.LMSCommit('');
                        }
                    } else if (scormVersion === '2004') {
                        const res = scormAPI.Initialize('');
                        if (res === 'true' || res === true) {
                            isScormInitialized = true;
                            scormAPI.SetValue('cmi.completion_status', 'incomplete');
                            scormAPI.SetValue('cmi.success_status', 'unknown');
                            scormAPI.Commit('');
                        }
                    }
                } catch (e) {
                    console.warn('[LMS SCORM] Init error:', e);
                }
            }

            // Setup Auto-Resize for LMS iframe
            this.setupAutoResize();

            // Setup postMessage Listeners
            this.setupPostMessageListener();

            // Notify LMS
            this.postToParent('HSK2_LMS_LOADED', {
                isEmbedded: this.isEmbedded,
                hasScorm: isScormInitialized,
                scormVersion: scormVersion
            });
        },

        reportProgress: function (questionIdx, isCorrect, currentScore) {
            this.postToParent('HSK2_LMS_PROGRESS', {
                questionIndex: questionIdx,
                isCorrect: isCorrect,
                score: currentScore,
                progressPercent: Math.round(((questionIdx + 1) / 15) * 100)
            });
        },

        reportComplete: function (isWin, currentIdx, finalScore, stoppedManually) {
            const scorePercent = Math.round((currentIdx / 15) * 100);
            const passed = isWin || currentIdx >= 5; // Passed milestone 5
            const sessionTime = formatScormTime(startTime);

            // 1. SCORM Reporting
            if (isScormInitialized && scormAPI) {
                try {
                    if (scormVersion === '1.2') {
                        scormAPI.LMSSetValue('cmi.core.score.raw', String(scorePercent));
                        scormAPI.LMSSetValue('cmi.core.score.min', '0');
                        scormAPI.LMSSetValue('cmi.core.score.max', '100');
                        scormAPI.LMSSetValue('cmi.core.session_time', sessionTime);
                        scormAPI.LMSSetValue('cmi.core.lesson_status', passed ? 'passed' : 'failed');
                        scormAPI.LMSCommit('');
                    } else if (scormVersion === '2004') {
                        scormAPI.SetValue('cmi.score.raw', String(scorePercent));
                        scormAPI.SetValue('cmi.score.scaled', (scorePercent / 100).toFixed(2));
                        scormAPI.SetValue('cmi.score.min', '0');
                        scormAPI.SetValue('cmi.score.max', '100');
                        scormAPI.SetValue('cmi.session_time', 'PT' + Math.floor((new Date() - startTime) / 1000) + 'S');
                        scormAPI.SetValue('cmi.completion_status', 'completed');
                        scormAPI.SetValue('cmi.success_status', passed ? 'passed' : 'failed');
                        scormAPI.Commit('');
                    }
                } catch (e) {
                    console.warn('[LMS SCORM] Report error:', e);
                }
            }

            // 2. HTML5 postMessage Reporting
            this.postToParent('HSK2_LMS_COMPLETE', {
                won: !!isWin,
                stoppedManually: !!stoppedManually,
                correctQuestions: currentIdx,
                totalQuestions: 15,
                scorePercent: scorePercent,
                finalPrize: finalScore,
                passed: passed,
                duration: sessionTime
            });
        },

        finishSession: function () {
            if (isScormInitialized && scormAPI) {
                try {
                    if (scormVersion === '1.2') {
                        scormAPI.LMSFinish('');
                    } else if (scormVersion === '2004') {
                        scormAPI.Terminate('');
                    }
                } catch (e) {}
                isScormInitialized = false;
            }
        },

        postToParent: function (eventType, data) {
            try {
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({
                        source: 'HSK2_MILLIONAIRE',
                        type: eventType,
                        data: data || {},
                        timestamp: Date.now()
                    }, '*');
                }
            } catch (e) {}
        },

        setupAutoResize: function () {
            const sendHeight = () => {
                try {
                    if (window.parent && window.parent !== window) {
                        const h = Math.max(
                            document.documentElement.scrollHeight || 0,
                            document.body.scrollHeight || 0,
                            document.documentElement.offsetHeight || 0
                        );
                        window.parent.postMessage({
                            source: 'HSK2_MILLIONAIRE',
                            type: 'HSK2_RESIZE',
                            height: h
                        }, '*');
                    }
                } catch (e) {}
            };

            // Initial height send
            window.addEventListener('load', sendHeight);
            window.addEventListener('resize', sendHeight);

            if (typeof ResizeObserver !== 'undefined' && document.body) {
                const ro = new ResizeObserver(sendHeight);
                ro.observe(document.body);
            }
        },

        setupPostMessageListener: function () {
            window.addEventListener('message', function (event) {
                if (!event || !event.data) return;
                const data = event.data;
                const action = data.action || data.type;

                if (action === 'PAUSE' || action === 'HSK2_PAUSE') {
                    if (typeof window.pauseTimer === 'function') window.pauseTimer();
                } else if (action === 'RESUME' || action === 'HSK2_RESUME') {
                    if (typeof window.resumeTimer === 'function') window.resumeTimer();
                } else if (action === 'RESTART' || action === 'HSK2_RESTART') {
                    if (typeof window.restartGame === 'function') window.restartGame();
                } else if (action === 'MUTE' || action === 'HSK2_MUTE') {
                    if (typeof window.setMuted === 'function') {
                        window.setMuted(true);
                    }
                } else if (action === 'UNMUTE' || action === 'HSK2_UNMUTE') {
                    if (typeof window.setMuted === 'function') {
                        window.setMuted(false);
                    }
                }
            });
        }
    };

    // Auto-clean up SCORM on window unload
    window.addEventListener('beforeunload', function () {
        LMSBridge.finishSession();
    });

    window.LMSBridge = LMSBridge;

    // Run initialization on DOM load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            LMSBridge.init();
        });
    } else {
        LMSBridge.init();
    }
})(window);
