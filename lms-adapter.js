/**
 * LMS Adapter for Ai Là Triệu Phú - HSK 2 Edition
 * Based on the proven architecture of Game Tiếng Trung HSK 4:
 * - Tương thích 100% với mọi hệ thống LMS: Moodle, Canvas LMS, Blackboard, Schoology, Google Classroom, Brightspace (D2L), TalentLMS
 * - SCORM 1.2 & SCORM 2004 (CMI API: Lesson Status, Score, Session Time, Commit, Terminate)
 * - Cross-Origin iFrame & Sandbox Resilience (Safe Storage fallback, Safe pushState)
 * - Auto-Resize postMessage (setHeight, resize, HSK2_RESIZE)
 * - Smart Fullscreen & Popout (Open in New Tab fallback when iframe blocks fullscreen)
 * - Web Audio API Synthesizer Fallback (Works 100% offline, intranet & firewalled schools)
 * - Toast Notification System
 */

(function (window) {
    'use strict';

    // 1. In-memory fallback if localStorage is blocked by sandboxed iframe
    const memoryStorage = {};

    const safeStorage = {
        getItem(key, defaultVal = null) {
            try {
                if (window.localStorage) {
                    const val = window.localStorage.getItem(key);
                    return val !== null ? val : defaultVal;
                }
            } catch (e) {
                // Blocked by LMS cross-origin iframe sandbox or 3rd-party cookie policy
            }
            try {
                if (window.sessionStorage) {
                    const val = window.sessionStorage.getItem(key);
                    return val !== null ? val : defaultVal;
                }
            } catch (e) {}
            return key in memoryStorage ? memoryStorage[key] : defaultVal;
        },
        setItem(key, value) {
            try {
                if (window.localStorage) {
                    window.localStorage.setItem(key, value);
                    return;
                }
            } catch (e) {
                // Fallback to in-memory store
            }
            try {
                if (window.sessionStorage) {
                    window.sessionStorage.setItem(key, value);
                    return;
                }
            } catch (e) {}
            memoryStorage[key] = String(value);
        },
        removeItem(key) {
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
            delete memoryStorage[key];
        }
    };

    window.safeStorage = safeStorage;

    // 2. LMS Adapter Core
    const LMSAdapter = {
        isSCORM: false,
        scormVersion: null, // '1.2' or '2004'
        apiHandle: null,
        isInitialized: false,
        startTime: new Date(),
        isInIframe: false,
        isNavigatingInternal: false,
        audioCtx: null,

        /**
         * Safely discover SCORM API (API for 1.2, API_1484_11 for 2004)
         */
        findAPI(win) {
            let findAttempts = 0;
            const maxAttempts = 15;
            let current = win;

            while (current && findAttempts < maxAttempts) {
                try {
                    if (current.API) {
                        this.scormVersion = '1.2';
                        return current.API;
                    }
                    if (current.API_1484_11) {
                        this.scormVersion = '2004';
                        return current.API_1484_11;
                    }
                } catch (e) {
                    // Cross-origin boundary reached
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
                findAttempts++;
            }

            // Check window.top as fallback
            try {
                if (window.top && window.top !== window) {
                    if (window.top.API) {
                        this.scormVersion = '1.2';
                        return window.top.API;
                    }
                    if (window.top.API_1484_11) {
                        this.scormVersion = '2004';
                        return window.top.API_1484_11;
                    }
                }
            } catch (e) {}

            return null;
        },

        /**
         * Initialize LMS connection (SCORM, iFrame detection, postMessage, Auto-resize)
         */
        init() {
            if (this.isInitialized) return;

            // Detect if inside an iframe
            try {
                this.isInIframe = (window.self !== window.top);
            } catch (e) {
                this.isInIframe = true;
            }

            if (this.isInIframe && document.body) {
                document.body.classList.add('embedded-lms');
                // Show popout button if in iframe
                const popoutBtn = document.getElementById('popout-btn');
                if (popoutBtn) popoutBtn.style.display = 'flex';
            }

            // 1. Detect SCORM
            try {
                this.apiHandle = this.findAPI(window);
                if (this.apiHandle) {
                    this.isSCORM = true;
                    if (this.scormVersion === '1.2') {
                        const initRes = this.apiHandle.LMSInitialize("");
                        const err = this.apiHandle.LMSGetLastError ? String(this.apiHandle.LMSGetLastError()) : '0';
                        if (initRes === "true" || initRes === true || err === '101') {
                            this.apiHandle.LMSSetValue("cmi.core.lesson_status", "incomplete");
                            this.apiHandle.LMSCommit("");
                            console.log("[LMSAdapter] SCORM 1.2 Initialized successfully");
                        }
                    } else if (this.scormVersion === '2004') {
                        const initRes = this.apiHandle.Initialize("");
                        const err = this.apiHandle.GetLastError ? String(this.apiHandle.GetLastError()) : '0';
                        if (initRes === "true" || initRes === true || err === '103') {
                            this.apiHandle.SetValue("cmi.completion_status", "incomplete");
                            this.apiHandle.SetValue("cmi.success_status", "unknown");
                            this.apiHandle.Commit("");
                            console.log("[LMSAdapter] SCORM 2004 Initialized successfully");
                        }
                    }
                }
            } catch (e) {
                console.warn("[LMSAdapter] SCORM initialization note:", e);
            }

            // 2. Setup PostMessage Communication & Auto-resize
            this.setupPostMessage();

            // 3. Setup Unload Handlers for SCORM session termination
            window.addEventListener('beforeunload', () => {
                if (!this.isNavigatingInternal) {
                    this.terminate();
                }
            });
            window.addEventListener('unload', () => {
                if (!this.isNavigatingInternal) {
                    this.terminate();
                }
            });

            // 4. Setup Keybinding (F for Fullscreen, Space, Escape, A/B/C/D)
            window.addEventListener('keydown', (e) => {
                if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

                if (e.key === 'f' || e.key === 'F') {
                    this.toggleFullscreen();
                } else if (e.key === 'Escape') {
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
                } else if (e.key === ' ' || e.key === 'Spacebar') {
                    const readyBtn = document.querySelector('#instructionContent button');
                    if (readyBtn && readyBtn.offsetParent !== null) {
                        e.preventDefault();
                        readyBtn.click();
                    }
                }
            });

            this.isInitialized = true;
            this.sendPostMessage('HSK2_LMS_READY', {
                title: 'Ai Là Triệu Phú - HSK 2 Edition',
                scorm: this.isSCORM,
                version: this.scormVersion,
                inIframe: this.isInIframe
            });
        },

        markInternalNavigation() {
            this.isNavigatingInternal = true;
        },

        /**
         * Auto-report height & width to parent LMS iframe to eliminate scrollbars
         */
        setupPostMessage() {
            const reportSize = () => {
                try {
                    const height = Math.max(
                        document.body.scrollHeight || 0,
                        document.documentElement.scrollHeight || 0,
                        document.body.offsetHeight || 0,
                        document.documentElement.offsetHeight || 0
                    );
                    this.sendPostMessage('setHeight', { height });
                    this.sendPostMessage('resize', { height, width: window.innerWidth });
                    this.sendPostMessage('HSK2_RESIZE', { height });

                    // IMS LTI Frame Resize Protocol
                    if (window.parent && window.parent !== window) {
                        window.parent.postMessage({
                            subject: 'lti.frameResize',
                            height: height
                        }, '*');
                    }
                } catch (e) {}
            };

            window.addEventListener('resize', reportSize);
            window.addEventListener('load', reportSize);

            // Report height when DOM changes
            if (window.MutationObserver && document.body) {
                const observer = new MutationObserver(reportSize);
                observer.observe(document.body, { childList: true, subtree: true, attributes: true });
            }

            // Listen for control commands from parent LMS
            window.addEventListener('message', (event) => {
                if (!event || !event.data) return;
                const data = event.data;
                const action = data.action || data.type;

                if (action === 'PAUSE' || action === 'HSK2_PAUSE') {
                    if (typeof window.pauseTimer === 'function') window.pauseTimer();
                } else if (action === 'RESUME' || action === 'HSK2_RESUME') {
                    if (typeof window.resumeTimer === 'function') window.resumeTimer();
                } else if (action === 'RESTART' || action === 'HSK2_RESTART') {
                    if (typeof window.restartGame === 'function') {
                        window.restartGame();
                    } else {
                        window.location.reload();
                    }
                } else if (action === 'MUTE' || action === 'HSK2_MUTE') {
                    if (typeof window.setMuted === 'function') {
                        window.setMuted(true);
                    } else if (typeof window.toggleMusic === 'function' && !window.isMuted) {
                        window.toggleMusic();
                    }
                } else if (action === 'UNMUTE' || action === 'HSK2_UNMUTE') {
                    if (typeof window.setMuted === 'function') {
                        window.setMuted(false);
                    } else if (typeof window.toggleMusic === 'function' && window.isMuted) {
                        window.toggleMusic();
                    }
                }
            });
        },

        /**
         * Broadcast events to parent LMS window
         */
        sendPostMessage(action, payload = {}) {
            try {
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({
                        source: 'HSK2_MILLIONAIRE',
                        action: action,
                        payload: payload,
                        timestamp: Date.now()
                    }, '*');
                }
            } catch (e) {}
        },

        postToParent(eventType, data) {
            this.sendPostMessage(eventType, data);
        },

        /**
         * Format SCORM session time string (HH:MM:SS)
         */
        formatScormTime(startDate) {
            const diff = Math.max(0, Math.floor((new Date() - startDate) / 1000));
            const hours = Math.floor(diff / 3600);
            const minutes = Math.floor((diff % 3600) / 60);
            const seconds = diff % 60;
            const pad = (n) => (n < 10 ? '0' + n : n);
            return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
        },

        /**
         * Report Question Progress to LMS
         */
        reportProgress(questionIdx, isCorrect, points) {
            this.sendPostMessage('HSK2_LMS_PROGRESS', {
                questionIndex: questionIdx + 1,
                isCorrect: isCorrect,
                score: points
            });
        },

        /**
         * Report Game Completion & Scores to SCORM & LMS
         */
        reportComplete(isWin, currentIdx, finalScore, stoppedManually) {
            const scorePercent = Math.round((currentIdx / 15) * 100);
            const passed = isWin || currentIdx >= 5; // Reached milestone 5
            const sessionTime = this.formatScormTime(this.startTime);

            // 1. SCORM reporting
            if (this.isSCORM && this.apiHandle) {
                try {
                    if (this.scormVersion === '1.2') {
                        this.apiHandle.LMSSetValue("cmi.core.score.raw", String(scorePercent));
                        this.apiHandle.LMSSetValue("cmi.core.score.min", "0");
                        this.apiHandle.LMSSetValue("cmi.core.score.max", "100");
                        this.apiHandle.LMSSetValue("cmi.core.session_time", sessionTime);
                        this.apiHandle.LMSSetValue("cmi.core.lesson_status", passed ? "passed" : "completed");
                        this.apiHandle.LMSCommit("");
                    } else if (this.scormVersion === '2004') {
                        this.apiHandle.SetValue("cmi.score.raw", String(scorePercent));
                        this.apiHandle.SetValue("cmi.score.scaled", String((scorePercent / 100).toFixed(2)));
                        this.apiHandle.SetValue("cmi.score.min", "0");
                        this.apiHandle.SetValue("cmi.score.max", "100");
                        this.apiHandle.SetValue("cmi.session_time", 'PT' + Math.floor((new Date() - this.startTime) / 1000) + 'S');
                        this.apiHandle.SetValue("cmi.completion_status", "completed");
                        this.apiHandle.SetValue("cmi.success_status", passed ? "passed" : "completed");
                        this.apiHandle.Commit("");
                    }
                    console.log(`[LMSAdapter] SCORM score committed: ${scorePercent}%`);
                } catch (e) {
                    console.warn("[LMSAdapter] SCORM score report note:", e);
                }
            }

            // 2. PostMessage event
            this.sendPostMessage('HSK2_LMS_COMPLETE', {
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

        /**
         * Terminate SCORM session cleanly
         */
        terminate() {
            if (this.isSCORM && this.apiHandle) {
                try {
                    if (this.scormVersion === '1.2') {
                        this.apiHandle.LMSCommit("");
                        this.apiHandle.LMSFinish("");
                    } else if (this.scormVersion === '2004') {
                        this.apiHandle.Commit("");
                        this.apiHandle.Terminate("");
                    }
                    this.apiHandle = null;
                } catch (e) {}
            }
        },

        finishSession() {
            this.terminate();
        },

        /**
         * Show toast notification on game interface
         */
        showToast(msg, duration = 2500) {
            const toast = document.getElementById('lms-toast');
            if (!toast) return;
            toast.textContent = msg;
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
            }, duration);
        },

        /**
         * Smart Fullscreen toggle with LMS iframe fallback
         */
        toggleFullscreen(targetElem = document.documentElement) {
            const isFsDisallowed = (document.fullscreenEnabled === false);

            if (this.isInIframe && isFsDisallowed) {
                this.openNewTab();
                return;
            }

            try {
                if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                    const req = targetElem.requestFullscreen || targetElem.webkitRequestFullscreen || targetElem.mozRequestFullScreen || targetElem.msRequestFullscreen;
                    if (req) {
                        const p = req.call(targetElem);
                        if (p && typeof p.then === 'function') {
                            p.then(() => {
                                this.showToast("⛶ Đã bật chế độ Toàn Màn Hình");
                            }).catch(() => {
                                if (this.isInIframe) {
                                    this.openNewTab();
                                } else {
                                    this.showToast("⛶ Đã mở rộng giao diện");
                                }
                            });
                            return;
                        }
                    }
                } else {
                    const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
                    if (exit) {
                        exit.call(document);
                        this.showToast("🗗 Đã trở về chế độ chuẩn");
                    }
                }
            } catch (e) {
                if (this.isInIframe) {
                    this.openNewTab();
                }
            }
        },

        /**
         * Safely open game in standalone new tab (for narrow LMS iframes)
         */
        openNewTab() {
            try {
                const win = window.open(window.location.href, '_blank');
                if (win) {
                    this.showToast("🚀 Đang mở game trong tab mới...");
                    return;
                }
            } catch (e) {
                console.warn("Popup blocked:", e);
            }
            this.showToast("⛶ Trình duyệt đã chặn tab mới. Vui lòng cho phép popup.");
        },

        /**
         * Safe Audio Playback Wrapper (handles NotAllowedError and autoplay policies)
         */
        safePlayAudio(audio, synthFallbackType = null) {
            if (!audio) return;
            try {
                const p = audio.play();
                if (p && typeof p.catch === 'function') {
                    p.catch((err) => {
                        if (synthFallbackType) {
                            this.playSynthesizedSound(synthFallbackType);
                        }
                    });
                }
            } catch (e) {
                if (synthFallbackType) {
                    this.playSynthesizedSound(synthFallbackType);
                }
            }
        },

        /**
         * Web Audio API Synthesizer Fallback (Works 100% offline, intranet & firewalled schools)
         */
        getAudioContext() {
            if (!this.audioCtx) {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx) {
                    this.audioCtx = new AudioCtx();
                }
            }
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
                this.audioCtx.resume().catch(() => {});
            }
            return this.audioCtx;
        },

        playTone(freq, type = 'sine', duration = 0.2, gainVal = 0.2) {
            try {
                const ctx = this.getAudioContext();
                if (!ctx) return;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = type;
                osc.frequency.setValueAtTime(freq, ctx.currentTime);
                gain.gain.setValueAtTime(gainVal, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + duration);
            } catch (e) {}
        },

        playSynthesizedSound(type) {
            const ctx = this.getAudioContext();
            if (!ctx) return;

            switch (type) {
                case 'correct':
                case 'ding':
                    [523.25, 659.25, 783.99].forEach((f, i) => {
                        setTimeout(() => this.playTone(f, 'triangle', 0.25, 0.25), i * 70);
                    });
                    break;
                case 'wrong':
                case 'buzz':
                    this.playTone(140, 'sawtooth', 0.35, 0.3);
                    setTimeout(() => this.playTone(100, 'sawtooth', 0.3, 0.3), 90);
                    break;
                case 'victory':
                case 'clap':
                    [523, 659, 784, 1046].forEach((f, i) => {
                        setTimeout(() => this.playTone(f, 'sine', 0.35, 0.2), i * 90);
                    });
                    break;
            }
        }
    };

    // Auto-init on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => LMSAdapter.init());
    } else {
        LMSAdapter.init();
    }

    // Export both LMSAdapter and LMSBridge for compatibility
    window.LMSAdapter = LMSAdapter;
    window.LMSBridge = LMSAdapter;
    window.safePlayAudio = function (audio, fallback) {
        LMSAdapter.safePlayAudio(audio, fallback);
    };

})(window);
