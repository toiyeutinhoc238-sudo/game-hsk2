/**
 * HSK 2 Millionaire - Universal LMS & SCORM Integration Engine
 * Standards Supported:
 * - ADL SCORM 1.2 & SCORM 2004 (Moodle, Canvas, Blackboard, D2L Brightspace, Schoology)
 * - xAPI / Tin Can API (Experience API for modern LRS/LMS)
 * - IMS Global LTI Frame Resize Protocol (Canvas, Blackboard Ultra)
 * - David Bradshaw iframe-resizer protocol (Moodle iframeResizer)
 * - HTML5 Web Messaging (postMessage API for parent LMS wrappers)
 * - WCAG 2.1 AA Keyboard Accessibility (A/B/C/D, 1/2/3/4, Space, Esc)
 * - Strict CSP Compatibility (Zero-inline event dependency)
 * - Safe Cross-Origin Storage & Web Audio Policy Compliance
 */

(function (window) {
    'use strict';

    // ========================================================
    // 1. Safe Storage Layer (Bulletproof for Cross-Origin iFrames)
    // ========================================================
    const memStorage = {};
    const safeStorage = {
        getItem: function (key) {
            try {
                if (window.localStorage) {
                    return window.localStorage.getItem(key);
                }
            } catch (e) {
                // Access denied due to 3rd-party cookie or sandbox restriction
            }
            try {
                if (window.sessionStorage) {
                    return window.sessionStorage.getItem(key);
                }
            } catch (e) {}
            return Object.prototype.hasOwnProperty.call(memStorage, key) ? memStorage[key] : null;
        },
        setItem: function (key, val) {
            try {
                if (window.localStorage) {
                    window.localStorage.setItem(key, val);
                    return;
                }
            } catch (e) {}
            try {
                if (window.sessionStorage) {
                    window.sessionStorage.setItem(key, val);
                    return;
                }
            } catch (e) {}
            memStorage[key] = String(val);
        },
        removeItem: function (key) {
            try {
                if (window.localStorage) {
                    window.localStorage.removeItem(key);
                }
            } catch (e) {}
            try {
                if (window.sessionStorage) {
                    window.sessionStorage.removeItem(key);
                }
            } catch (e) {}
            delete memStorage[key];
        }
    };
    window.safeStorage = safeStorage;

    // ========================================================
    // 2. Safe Audio Playback Helper
    // ========================================================
    let userHasInteracted = false;
    const unlockUserInteraction = function () {
        userHasInteracted = true;
    };
    window.addEventListener('click', unlockUserInteraction, { capture: true, once: true });
    window.addEventListener('touchend', unlockUserInteraction, { capture: true, once: true });
    window.addEventListener('keydown', unlockUserInteraction, { capture: true, once: true });

    window.safePlayAudio = function (audio) {
        if (!audio) return;
        try {
            const promise = audio.play();
            if (promise && typeof promise.catch === 'function') {
                promise.catch(function (err) {
                    // Harmlessly ignore un-interacted autoplay restriction
                    console.log('[LMS Audio] Playback deferred by browser policy:', err.name || err.message);
                });
            }
        } catch (e) {
            console.log('[LMS Audio] Play exception:', e);
        }
    };

    // ========================================================
    // 3. Multi-Tier SCORM 1.2 & SCORM 2004 Discovery Engine
    // ========================================================
    let scormAPI = null;
    let scormVersion = null; // '1.2' or '2004'
    let isScormInitialized = false;
    let isInternalNavigation = false;
    let learnerInfo = { id: '', name: '' };
    const sessionStartTime = new Date();

    function searchWindowForSCORM(win) {
        let attempts = 0;
        const maxAttempts = 15;
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
                // Cross-origin boundary reached
                break;
            }

            try {
                if (current.parent && current.parent !== current) {
                    current = current.parent;
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

    function findScormAPI() {
        // 1. Check current window and parent hierarchy
        let result = searchWindowForSCORM(window);
        if (result) return result;

        // 2. Check top window
        try {
            if (window.top && window.top !== window) {
                if (window.top.API) return { api: window.top.API, version: '1.2' };
                if (window.top.API_1484_11) return { api: window.top.API_1484_11, version: '2004' };
            }
        } catch (e) {}

        // 3. Check opener window (if launched as popup)
        try {
            if (window.opener) {
                result = searchWindowForSCORM(window.opener);
                if (result) return result;
                if (window.opener.top) {
                    if (window.opener.top.API) return { api: window.opener.top.API, version: '1.2' };
                    if (window.opener.top.API_1484_11) return { api: window.opener.top.API_1484_11, version: '2004' };
                }
            }
        } catch (e) {}

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

    // ========================================================
    // 4. xAPI (Tin Can) Query Parameter & Statement Support
    // ========================================================
    const urlParams = new URLSearchParams(window.location.search);
    const xApiEndpoint = urlParams.get('endpoint');
    const xApiAuth = urlParams.get('auth');
    let xApiActor = null;
    try {
        const actorStr = urlParams.get('actor');
        if (actorStr) xApiActor = JSON.parse(actorStr);
    } catch (e) {}

    function sendXApiStatement(statement) {
        // 1. Dispatch over postMessage for parent LMS/LRS container
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({
                    source: 'HSK2_MILLIONAIRE',
                    type: 'xAPI',
                    statement: statement,
                    timestamp: new Date().toISOString()
                }, '*');
            }
        } catch (e) {}

        // 2. Direct LRS HTTP POST if endpoint is provided
        if (xApiEndpoint && xApiAuth) {
            try {
                const url = xApiEndpoint.endsWith('/') ? xApiEndpoint + 'statements' : xApiEndpoint + '/statements';
                fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': xApiAuth,
                        'X-Experience-API-Version': '1.0.3'
                    },
                    body: JSON.stringify(statement)
                }).catch(function (err) {
                    console.log('[LMS xAPI] LRS POST non-blocking warning:', err.message);
                });
            } catch (e) {}
        }
    }

    // ========================================================
    // 5. Unified LMS Bridge Controller
    // ========================================================
    const LMSBridge = {
        isEmbedded: false,
        isGamePage: false,

        init: function () {
            this.isGamePage = window.location.pathname.indexOf('game.html') !== -1;

            // Check if embedded in iframe
            try {
                this.isEmbedded = (window.self !== window.top);
            } catch (e) {
                this.isEmbedded = true;
            }

            if (this.isEmbedded && document.body) {
                document.body.classList.add('embedded-lms');
            }

            // Discover and initialize SCORM
            const found = findScormAPI();
            if (found) {
                scormAPI = found.api;
                scormVersion = found.version;

                try {
                    if (scormVersion === '1.2') {
                        let initResult = scormAPI.LMSInitialize('');
                        let err = scormAPI.LMSGetLastError ? String(scormAPI.LMSGetLastError()) : '0';
                        // 101 means already initialized (e.g. from index.html navigation)
                        if (initResult === 'true' || initResult === true || err === '101') {
                            isScormInitialized = true;
                            scormAPI.LMSSetValue('cmi.core.lesson_status', 'incomplete');
                            scormAPI.LMSCommit('');
                            learnerInfo.name = scormAPI.LMSGetValue('cmi.core.student_name') || '';
                            learnerInfo.id = scormAPI.LMSGetValue('cmi.core.student_id') || '';
                        }
                    } else if (scormVersion === '2004') {
                        let initResult = scormAPI.Initialize('');
                        let err = scormAPI.GetLastError ? String(scormAPI.GetLastError()) : '0';
                        // 103 means already initialized
                        if (initResult === 'true' || initResult === true || err === '103') {
                            isScormInitialized = true;
                            scormAPI.SetValue('cmi.completion_status', 'incomplete');
                            scormAPI.SetValue('cmi.success_status', 'unknown');
                            scormAPI.Commit('');
                            learnerInfo.name = scormAPI.GetValue('cmi.learner_name') || '';
                            learnerInfo.id = scormAPI.GetValue('cmi.learner_id') || '';
                        }
                    }
                } catch (e) {
                    console.warn('[LMS SCORM] Initialization notice:', e);
                }
            }

            // Setup Auto-Resize Protocols
            this.setupAutoResize();

            // Setup postMessage Command Listener
            this.setupPostMessageListener();

            // Setup Keyboard Accessibility (WCAG 2.1)
            this.setupAccessibilityShortcuts();

            // Setup Non-inline Event Fallback (Strict CSP Support)
            this.bindEventsForStrictCSP();

            // Track internal page navigation to avoid premature SCORM termination
            this.trackInternalNavigation();

            // Emit Loaded Event
            this.postToParent('HSK2_LMS_LOADED', {
                isEmbedded: this.isEmbedded,
                hasScorm: isScormInitialized,
                scormVersion: scormVersion,
                learner: learnerInfo,
                page: this.isGamePage ? 'game' : 'index'
            });

            // Send initial xAPI initialized statement
            sendXApiStatement({
                actor: xApiActor || { mbox: 'mailto:student@hsk2.edu', name: learnerInfo.name || 'Học viên HSK 2' },
                verb: {
                    id: 'http://adlnet.gov/expapi/verbs/initialized',
                    display: { 'en-US': 'initialized', 'vi-VN': 'đã bắt đầu' }
                },
                object: {
                    id: 'urn:hsk2:millionaire:' + (this.isGamePage ? 'game' : 'menu'),
                    definition: {
                        name: { 'vi-VN': 'Ai Là Triệu Phú - HSK 2' },
                        description: { 'vi-VN': 'Trò chơi ôn tập và chinh phục từ vựng HSK 2' }
                    }
                }
            });
        },

        reportProgress: function (questionIdx, isCorrect, currentScore) {
            const percent = Math.round(((questionIdx + 1) / 15) * 100);

            // HTML5 postMessage
            this.postToParent('HSK2_LMS_PROGRESS', {
                questionIndex: questionIdx + 1,
                isCorrect: isCorrect,
                score: currentScore,
                progressPercent: percent
            });

            // xAPI Progress Statement
            sendXApiStatement({
                actor: xApiActor || { mbox: 'mailto:student@hsk2.edu', name: learnerInfo.name || 'Học viên HSK 2' },
                verb: {
                    id: 'http://adlnet.gov/expapi/verbs/answered',
                    display: { 'en-US': 'answered', 'vi-VN': 'đã trả lời' }
                },
                object: {
                    id: 'urn:hsk2:question:' + (questionIdx + 1),
                    definition: { name: { 'vi-VN': `Câu hỏi số ${questionIdx + 1}/15` } }
                },
                result: {
                    success: !!isCorrect,
                    score: { raw: parseInt(String(currentScore).replace(/\./g, '')) || 0 }
                }
            });
        },

        reportComplete: function (isWin, currentIdx, finalScore, stoppedManually) {
            const scorePercent = Math.round((currentIdx / 15) * 100);
            const passed = isWin || currentIdx >= 5; // Passed milestone 5
            const sessionTime = formatScormTime(sessionStartTime);

            // 1. SCORM Reporting (Record in Gradebook)
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
                        scormAPI.SetValue('cmi.session_time', 'PT' + Math.floor((new Date() - sessionStartTime) / 1000) + 'S');
                        scormAPI.SetValue('cmi.completion_status', 'completed');
                        scormAPI.SetValue('cmi.success_status', passed ? 'passed' : 'failed');
                        scormAPI.Commit('');
                    }
                } catch (e) {
                    console.warn('[LMS SCORM] Grade reporting error:', e);
                }
            }

            // 2. HTML5 postMessage
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

            // 3. xAPI Completed Statement
            sendXApiStatement({
                actor: xApiActor || { mbox: 'mailto:student@hsk2.edu', name: learnerInfo.name || 'Học viên HSK 2' },
                verb: {
                    id: 'http://adlnet.gov/expapi/verbs/completed',
                    display: { 'en-US': 'completed', 'vi-VN': 'đã hoàn thành' }
                },
                object: {
                    id: 'urn:hsk2:millionaire:game',
                    definition: { name: { 'vi-VN': 'Ai Là Triệu Phú - HSK 2' } }
                },
                result: {
                    completion: true,
                    success: passed,
                    score: {
                        raw: scorePercent,
                        min: 0,
                        max: 100,
                        scaled: scorePercent / 100
                    },
                    duration: 'PT' + Math.floor((new Date() - sessionStartTime) / 1000) + 'S'
                }
            });
        },

        finishSession: function () {
            if (isScormInitialized && scormAPI) {
                try {
                    if (scormVersion === '1.2') {
                        scormAPI.LMSCommit('');
                        scormAPI.LMSFinish('');
                    } else if (scormVersion === '2004') {
                        scormAPI.Commit('');
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

        // Universal Iframe Auto-Resize Supporting IMS LTI & Moodle iframe-resizer
        setupAutoResize: function () {
            const sendHeight = () => {
                try {
                    if (window.parent && window.parent !== window) {
                        const h = Math.max(
                            document.documentElement.scrollHeight || 0,
                            document.body.scrollHeight || 0,
                            document.documentElement.offsetHeight || 0
                        );

                        // 1. IMS Global LTI Specification (Canvas, Blackboard)
                        window.parent.postMessage({
                            subject: 'lti.frameResize',
                            height: h
                        }, '*');

                        // 2. David Bradshaw iframe-resizer Specification (Moodle)
                        window.parent.postMessage('[iFrameSizer]h:hsk2:' + h + ':true', '*');

                        // 3. Generic LMS postMessage schemas
                        window.parent.postMessage({
                            source: 'HSK2_MILLIONAIRE',
                            type: 'HSK2_RESIZE',
                            height: h
                        }, '*');
                        window.parent.postMessage({
                            type: 'setHeight',
                            height: h
                        }, '*');
                    }
                } catch (e) {}
            };

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
                    if (typeof window.setMuted === 'function') window.setMuted(true);
                } else if (action === 'UNMUTE' || action === 'HSK2_UNMUTE') {
                    if (typeof window.setMuted === 'function') window.setMuted(false);
                } else if (action === 'GET_SCORE') {
                    LMSBridge.postToParent('HSK2_SCORE_RESPONSE', {
                        score: window.currentScore || "0",
                        currentIdx: window.currentIdx || 0
                    });
                }
            });
        },

        // WCAG 2.1 Accessibility: Keyboard Controls
        setupAccessibilityShortcuts: function () {
            window.addEventListener('keydown', function (e) {
                if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

                const key = e.key.toUpperCase();

                // Space bar to start on countdown overlay
                if (e.key === ' ' || e.key === 'Spacebar') {
                    const readyBtn = document.querySelector('#instructionContent button');
                    if (readyBtn && readyBtn.offsetParent !== null) {
                        e.preventDefault();
                        readyBtn.click();
                        return;
                    }
                }

                // Escape key to dismiss any open modal
                if (e.key === 'Escape') {
                    ['stopModal', 'audienceModal', 'expertModal'].forEach(mId => {
                        const m = document.getElementById(mId);
                        if (m && m.style.display === 'flex') {
                            if (typeof window.closeHelpModal === 'function') {
                                window.closeHelpModal(mId);
                            } else {
                                m.style.display = 'none';
                            }
                        }
                    });
                    return;
                }

                // Number keys 1, 2, 3, 4 or Letters A, B, C, D to answer questions
                const keyMap = { '1': 0, 'A': 0, '2': 1, 'B': 1, '3': 2, 'C': 2, '4': 3, 'D': 3 };
                if (Object.prototype.hasOwnProperty.call(keyMap, key)) {
                    const optBtns = document.querySelectorAll('.options-grid .option-btn');
                    const idx = keyMap[key];
                    if (optBtns[idx] && !optBtns[idx].disabled && optBtns[idx].offsetParent !== null) {
                        e.preventDefault();
                        optBtns[idx].click();
                    }
                }
            });
        },

        // Strict CSP: Attach listeners programmatically so inline onclick is never mandatory
        bindEventsForStrictCSP: function () {
            const onReady = () => {
                const attach = (id, fn) => {
                    const el = document.getElementById(id);
                    if (el) {
                        el.addEventListener('click', (e) => fn(e));
                        el.addEventListener('touchend', (e) => fn(e));
                    }
                };

                attach('musicToggle', (e) => {
                    if (typeof window.toggleMusic === 'function') window.toggleMusic();
                });
                attach('help5050', () => {
                    if (typeof window.use5050 === 'function') window.use5050();
                });
                attach('helpAudience', () => {
                    if (typeof window.useAudience === 'function') window.useAudience();
                });
                attach('helpExpert', () => {
                    if (typeof window.useExpert === 'function') window.useExpert();
                });
                attach('restartBtn', (e) => {
                    if (typeof window.restartGame === 'function') window.restartGame(e);
                });
                attach('ladderDrawerBtn', () => {
                    if (typeof window.toggleLadderDrawer === 'function') window.toggleLadderDrawer();
                });
                attach('ladderBackdrop', () => {
                    if (typeof window.toggleLadderDrawer === 'function') window.toggleLadderDrawer();
                });
            };

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', onReady);
            } else {
                onReady();
            }
        },

        // Prevent premature SCORM termination during navigation between index.html and game.html
        trackInternalNavigation: function () {
            window.markInternalNavigation = function () {
                isInternalNavigation = true;
            };

            window.addEventListener('beforeunload', function () {
                if (!isInternalNavigation) {
                    LMSBridge.finishSession();
                }
            });
        }
    };

    window.LMSBridge = LMSBridge;

    // Run initialization
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            LMSBridge.init();
        });
    } else {
        LMSBridge.init();
    }
})(window);
