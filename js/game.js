document.addEventListener('DOMContentLoaded', () => {
    const storage = window.safeStorage || {
        getItem(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
        setItem(k, v) { try { localStorage.setItem(k, v); } catch (e) { } },
        removeItem(k) { try { localStorage.removeItem(k); } catch (e) { } }
    };

    const params = new URLSearchParams(window.location.search);
    const isPopout = params.get('popout') === '1' || (window.opener && window.opener !== window && window.name === 'HSK2_Standalone_Game');
    window.isChildWindow = isPopout;

    if (isPopout) {
        document.body.classList.add('is-child-window');
    }

    let syncChannel = null;
    try {
        if ('BroadcastChannel' in window) {
            syncChannel = new BroadcastChannel('hsk2_millionaire_sync');
        }
    } catch (e) { }

    let latestSyncedState = null;
    let childWin = null;
    let popoutPollInterval = null;
    window.isWaitingForChild = false;

    // Detect whether this page load is a browser reload (F5 / Refresh button)
    const isPageReload = (() => {
        try {
            const navEntries = performance.getEntriesByType('navigation');
            if (navEntries && navEntries.length > 0) {
                return navEntries[0].type === 'reload';
            }
            return performance.navigation && performance.navigation.type === 1;
        } catch (e) {
            return false;
        }
    })();

    // On browser reload, ALWAYS clean up synced state and reset to fresh game (Question 1)
    if (isPageReload) {
        try {
            storage.removeItem('hsk2_synced_state');
            storage.removeItem('hsk2_active_session');
            storage.removeItem('hsk2_popout_closed');
            const cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.delete('session');
            cleanUrl.searchParams.delete('timeLeft');
            cleanUrl.searchParams.delete('qIdx');
            cleanUrl.searchParams.delete('resume_sync');
            window.history.replaceState({}, '', cleanUrl.toString());
        } catch (e) { }
    }

    // Check for existing state snapshot to resume ONLY on initial open handover (not reload)
    let initialSyncedState = null;
    if (!isPageReload && (isPopout || params.get('resume_sync') === '1')) {
        const sessionParam = params.get('session');
        const sessionConsumedKey = sessionParam ? ('hsk2_session_consumed_' + sessionParam) : null;
        let isSessionAlreadyConsumed = false;
        try {
            if (sessionConsumedKey) {
                isSessionAlreadyConsumed = (sessionStorage.getItem(sessionConsumedKey) === 'true');
            }
        } catch (e) { }

        if (!isSessionAlreadyConsumed) {
            try {
                const raw = storage.getItem('hsk2_synced_state');
                if (raw) {
                    const parsed = JSON.parse(raw);
                    // Snapshot must be fresh (within 45 seconds of popup opening, not hours!)
                    if (parsed && parsed.questions && parsed.questions.length === 15 && (Date.now() - parsed.timestamp < 45000)) {
                        if (!sessionParam || parsed.syncSessionId === sessionParam) {
                            initialSyncedState = parsed;
                        }
                    }
                }
            } catch (err) { }
            try {
                if (!initialSyncedState && window.opener && window.opener.__HSK2_LATEST_STATE__) {
                    const opState = window.opener.__HSK2_LATEST_STATE__;
                    if (opState && (Date.now() - (opState.timestamp || 0) < 45000)) {
                        if (!sessionParam || opState.syncSessionId === sessionParam) {
                            initialSyncedState = opState;
                        }
                    }
                }
            } catch (e) { }

            // If found, mark session consumed so any subsequent reload starts fresh!
            if (initialSyncedState && sessionConsumedKey) {
                try {
                    sessionStorage.setItem(sessionConsumedKey, 'true');
                    storage.removeItem('hsk2_synced_state');
                } catch (e) { }
            }
        }
    }

    // If timeLeft was passed in URL, enforce it onto initialSyncedState
    if (params.has('timeLeft')) {
        const urlTime = parseFloat(params.get('timeLeft'));
        if (isFinite(urlTime) && urlTime >= 0 && urlTime <= 15) {
            if (initialSyncedState) {
                initialSyncedState.timeLeft = urlTime;
            }
        }
    }

    // Signal parent that child window is ready to receive latest state
    if (isPopout && window.opener && !window.opener.closed) {
        try {
            window.opener.postMessage({ type: 'HSK2_CHILD_READY' }, '*');
        } catch (e) { }
    }

    const topicParam = (initialSyncedState && initialSyncedState.topicName) ? initialSyncedState.topicName : params.get('topic');
    const allTopicKeys = Object.keys(hsk2Vocab);
    const filteredTopics = allTopicKeys.filter(t => hsk2Vocab[t].length >= 9);

    // Group topics by base name to handle parts (must match index.html logic)
    const groups = [];
    const groupMap = new Map();
    filteredTopics.forEach(topic => {
        const match = topic.match(/^(.*?)\s*\(Phần\s*(\d+)\)$/);
        const baseName = match ? match[1] : topic;
        const partNum = match ? parseInt(match[2]) : null;
        if (!groupMap.has(baseName)) {
            const group = { baseName, items: [] };
            groupMap.set(baseName, group);
            groups.push(group);
        }
        groupMap.get(baseName).items.push({ name: topic, part: partNum });
    });

    let topicName = topicParam;

    if (topicParam && topicParam.startsWith('chude')) {
        const parts = topicParam.replace('chude', '').split('_phan');
        const gIdx = parseInt(parts[0]) - 1;
        const pNum = parts.length > 1 ? parseInt(parts[1]) : null;

        if (groups[gIdx]) {
            if (pNum !== null) {
                // Find by part number or fallback to index
                const item = groups[gIdx].items.find(it => it.part === pNum) || groups[gIdx].items[pNum - 1];
                topicName = item ? item.name : groups[gIdx].items[0].name;
            } else {
                topicName = groups[gIdx].items[0].name;
            }
        }
    }

    let vocabPool = hsk2Vocab[topicName];
    if (!vocabPool || vocabPool.length < 9) {
        // Fallback gracefully for LMS/SCORM launching game.html directly without topic param
        if (filteredTopics.length > 0) {
            topicName = filteredTopics[0];
            vocabPool = hsk2Vocab[topicName];
        } else {
            console.error('Không tìm thấy dữ liệu từ vựng HSK 2!');
            return;
        }
    }

    // Improve randomization and fix ambiguity
    function shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    const zhToMeanings = new Map();
    const meaningToZhs = new Map();
    const allMeaningsSet = new Set();
    const allZhSet = new Set();

    Object.keys(hsk2Vocab).forEach(topic => {
        hsk2Vocab[topic].forEach(v => {
            v.meaning = v.meaning.toLowerCase();
            if (!zhToMeanings.has(v.zh)) zhToMeanings.set(v.zh, new Set());
            zhToMeanings.get(v.zh).add(v.meaning);

            if (!meaningToZhs.has(v.meaning)) meaningToZhs.set(v.meaning, new Set());
            meaningToZhs.get(v.meaning).add(v.zh);

            allMeaningsSet.add(v.meaning);
            allZhSet.add(v.zh);
        });
    });

    const uniqueMeanings = Array.from(allMeaningsSet);
    const uniqueZhs = Array.from(allZhSet);

    let questions = [];

    function generateNewQuestions() {
        // Create a pool of all possible questions for the chosen topic
        let possibleQuestions = [];
        vocabPool.forEach(v => {
            possibleQuestions.push({ wordObj: v, isZhToVi: true });
            possibleQuestions.push({ wordObj: v, isZhToVi: false });
        });

        // Shuffle and pick 15 unique question templates
        shuffle(possibleQuestions);
        const selectedQuestions = possibleQuestions.slice(0, 15);

        questions = [];
        for (let i = 0; i < 15; i++) {
            const qTemplate = selectedQuestions[i];
            const wordObj = qTemplate.wordObj;
            const isZhToVi = qTemplate.isZhToVi;
            let qText, correctAns, options;

            if (isZhToVi) {
                // Zh -> Vi: What does "Zh" mean?
                qText = `Từ "${wordObj.zh}" có nghĩa là gì?`;
                correctAns = wordObj.meaning;
                const targetZhMeanings = zhToMeanings.get(wordObj.zh);

                const distractors = [];
                while (distractors.length < 3) {
                    const rand = uniqueMeanings[Math.floor(Math.random() * uniqueMeanings.length)];
                    if (!targetZhMeanings.has(rand) && !distractors.includes(rand)) {
                        distractors.push(rand);
                    }
                }
                options = shuffle([correctAns, ...distractors]);
            } else {
                // Vi -> Zh: Which word means "Vi"?
                qText = `Từ nào sau đây có nghĩa là "${wordObj.meaning}"?`;
                correctAns = wordObj.zh;
                const targetMeaningWords = meaningToZhs.get(wordObj.meaning);

                const distractors = [];
                while (distractors.length < 3) {
                    const rand = uniqueZhs[Math.floor(Math.random() * uniqueZhs.length)];
                    if (!targetMeaningWords.has(rand) && !distractors.includes(rand)) {
                        distractors.push(rand);
                    }
                }
                options = shuffle([correctAns, ...distractors]);
            }

            const pinyinDisplay = wordObj.pinyin ? ` (${wordObj.pinyin})` : '';
            questions.push({
                q: qText,
                a: options,
                correct: options.indexOf(correctAns),
                vocab: `${wordObj.zh}${pinyinDisplay} - ${wordObj.meaning}`
            });
        }
    }

    if (initialSyncedState && initialSyncedState.questions && initialSyncedState.questions.length === 15) {
        questions = initialSyncedState.questions;
    } else {
        generateNewQuestions();
    }

    // Audio Elements
    const correctSound = new Audio('traloidung.mp3');
    const wrongSound = new Audio('traloisai.mp3');
    const bgMusic = new Audio('choigame.mp3');
    const helpSound = new Audio('chonquyentrogiup.mp3');
    const clapSound = new Audio('votay.mp3');
    bgMusic.loop = true;
    bgMusic.isBackgroundMusic = true;
    window.bgMusic = bgMusic;

    // Music State Management (LMS-Safe Storage based on HSK 4)
    let isMuted = false;
    if (params.has('muted')) {
        isMuted = (params.get('muted') === '1');
    } else if (initialSyncedState && typeof initialSyncedState.isMuted === 'boolean') {
        isMuted = initialSyncedState.isMuted;
    } else {
        isMuted = (storage.getItem('musicMuted') === 'true');
    }

    const initAudioTime = parseFloat(params.get('audioTime')) || (initialSyncedState && isFinite(initialSyncedState.audioCurrentTime) ? initialSyncedState.audioCurrentTime : 0);

    function updateAudioMuteState() {
        const btn = document.getElementById('musicToggle');
        if (btn) {
            const icon = btn.querySelector('.icon') || btn;
            icon.textContent = isMuted ? '🔇' : '🔊';
        }
        // Chỉ tắt/bật nhạc nền, âm thanh nút bấm & hiệu ứng vẫn giữ nguyên
        bgMusic.muted = isMuted;
        correctSound.muted = false;
        wrongSound.muted = false;
        helpSound.muted = false;
        clapSound.muted = false;

        if (isMuted) {
            bgMusic.pause();
        } else {
            if (bgMusic.paused && (!childWin || childWin.closed)) {
                window.safePlayAudio ? window.safePlayAudio(bgMusic) : bgMusic.play().catch(e => { });
            }
        }
    }

    // Dedicated Sound Effects player (Always audible, independent of background music mute state)
    function playSfx(audio, fallbackType = null) {
        if (!audio) {
            if (fallbackType && window.LMSAdapter) {
                window.LMSAdapter.playSynthesizedSound(fallbackType);
            }
            return;
        }
        try {
            audio.muted = false;
            audio.currentTime = 0;
        } catch (e) { }

        // Resume AudioContext if suspended
        if (window.LMSAdapter && window.LMSAdapter.getAudioContext) {
            const ctx = window.LMSAdapter.getAudioContext();
            if (ctx && ctx.state === 'suspended') {
                ctx.resume().catch(() => { });
            }
        }

        if (window.safePlayAudio) {
            window.safePlayAudio(audio, fallbackType);
        } else {
            const p = audio.play();
            if (p && typeof p.catch === 'function') {
                p.catch(() => {
                    if (window.LMSAdapter && fallbackType) {
                        window.LMSAdapter.playSynthesizedSound(fallbackType);
                    }
                });
            }
        }
    }

    function broadcastAudioSync(customTime = null) {
        const curTime = isFinite(customTime) && customTime !== null ? customTime : (bgMusic ? Number(bgMusic.currentTime.toFixed(2)) : 0);
        const msg = {
            type: 'HSK2_AUDIO_SYNC',
            isMuted: isMuted,
            audioCurrentTime: curTime,
            audioPlaying: !isMuted && !isGameOver && bgMusic && !bgMusic.paused
        };
        if (syncChannel) {
            try { syncChannel.postMessage(msg); } catch (e) { }
        }
        if (isPopout && window.opener && !window.opener.closed) {
            try { window.opener.postMessage(msg, '*'); } catch (e) { }
        } else if (childWin && !childWin.closed) {
            try { childWin.postMessage(msg, '*'); } catch (e) { }
        }
    }

    let lastToggleTime = 0;
    window.toggleMusic = function (e) {
        if (e && e.preventDefault) e.preventDefault();
        const now = Date.now();
        if (now - lastToggleTime < 250) return; // Prevent double trigger from touch+click
        lastToggleTime = now;

        if (window.LMSAdapter) window.LMSAdapter.playSynthesizedSound('tap');

        isMuted = !isMuted;
        storage.setItem('musicMuted', isMuted ? 'true' : 'false');
        updateAudioMuteState();
        if (window.LMSAdapter && window.LMSAdapter.showToast) {
            window.LMSAdapter.showToast(isMuted ? '🔇 Đã tắt nhạc nền' : '🔊 Đã bật nhạc nền');
        }
        broadcastAudioSync();
    };

    window.setMuted = function (muted) {
        isMuted = !!muted;
        storage.setItem('musicMuted', isMuted ? 'true' : 'false');
        updateAudioMuteState();
        broadcastAudioSync();
    };

    // Seek initial audio position if provided
    if (initAudioTime > 0) {
        const setSeek = () => {
            try {
                if (bgMusic.duration && initAudioTime >= bgMusic.duration) {
                    bgMusic.currentTime = initAudioTime % bgMusic.duration;
                } else {
                    bgMusic.currentTime = initAudioTime;
                }
            } catch (e) { }
        };
        if (bgMusic.readyState >= 1) {
            setSeek();
        } else {
            bgMusic.addEventListener('loadedmetadata', setSeek, { once: true });
        }
    }

    // Initialize audio mute state
    updateAudioMuteState();

    // Autoplay policy fallback: unlock AudioContext and ensure audio position is maintained
    const unlockAudio = () => {
        if (window.LMSAdapter && window.LMSAdapter.getAudioContext) {
            const ctx = window.LMSAdapter.getAudioContext();
            if (ctx && ctx.state === 'suspended') {
                ctx.resume().catch(() => { });
            }
        }
        if (!isMuted && !isGameOver && bgMusic.paused && (!childWin || childWin.closed)) {
            window.safePlayAudio ? window.safePlayAudio(bgMusic) : bgMusic.play().catch(e => { });
        }
    };
    ['click', 'touchstart', 'keydown'].forEach(evt => {
        document.addEventListener(evt, unlockAudio);
    });

    // Money Ladder Values
    const ladderValues = [
        "1.000.000", "2.000.000", "3.000.000", "4.000.000", "5.000.000",
        "6.000.000", "8.000.000", "10.000.000", "14.000.000", "22.000.000",
        "30.000.000", "60.000.000", "120.000.000", "250.000.000", "500.000.000"
    ];

    // Game State
    let currentIdx = 0;
    let isGameOver = false;
    let isProcessing = false;
    let used5050 = false;
    let currentScore = "0";
    let safeScore = "0";
    let timeLeft = 15;
    let timerInterval = null;

    // DOM Elements
    const questionText = document.getElementById('questionText');
    const optionsGrid = document.getElementById('optionsGrid');
    const questionNumNum = document.getElementById('questionNum');
    const moneyLadder = document.getElementById('moneyLadder');
    const help5050Btn = document.getElementById('help5050');
    const resultModal = document.getElementById('resultModal');
    const resultTitle = document.getElementById('resultTitle');
    const resultMessage = document.getElementById('resultMessage');
    const reviewList = document.getElementById('reviewList');
    const lessonNumDisp = document.getElementById('lessonNum');
    const statusMsg = document.getElementById('statusMsg');
    const timerBar = document.getElementById('timerBar');
    const countdownOverlay = document.getElementById('countdownOverlay');
    const countdownNumber = document.getElementById('countdownNumber');

    lessonNumDisp.textContent = topicName;

    // Initialize Money Ladder
    function initLadder() {
        moneyLadder.innerHTML = '<button class="ladder-close-drawer" onclick="toggleLadderDrawer()" title="Đóng">✕</button>';
        ladderValues.forEach((val, idx) => {
            const item = document.createElement('div');
            item.className = 'ladder-item' + (idx === 4 || idx === 9 ? ' safe' : '');
            item.id = `ladder-${idx}`;
            item.innerHTML = `<span>${idx + 1}</span> <span>${val} VNĐ</span>`;
            moneyLadder.appendChild(item);
        });
    }

    function updateLadder() {
        document.querySelectorAll('.ladder-item').forEach(el => el.classList.remove('active'));
        if (currentIdx < 15) {
            const item = document.getElementById(`ladder-${currentIdx}`);
            if (item) item.classList.add('active');
        }
    }

    function buildReviewTableHtml(qs) {
        const qList = (qs && qs.length > 0) ? qs : (questions && questions.length > 0 ? questions : null);
        let rows = '';
        if (qList && qList.length > 0) {
            qList.forEach(v => {
                if (!v) return;
                let zh = '', pinyin = '', meaning = '';
                if (v.vocab) {
                    const match = v.vocab.match(/^(.*?)\s*\((.*?)\)\s*-\s*(.*)$/);
                    if (match) {
                        zh = match[1];
                        pinyin = match[2];
                        meaning = match[3];
                    } else {
                        const parts = v.vocab.split(' - ');
                        zh = parts[0];
                        meaning = parts[1] || '';
                    }
                } else if (v.q) {
                    zh = v.q;
                    meaning = (v.a && v.correct !== undefined) ? v.a[v.correct] : '';
                }
                rows += `<tr><td>${zh}</td><td>${pinyin}</td><td>${meaning}</td></tr>`;
            });
        } else if (vocabPool && vocabPool.length > 0) {
            vocabPool.forEach(w => {
                if (!w) return;
                rows += `<tr><td>${w.zh || ''}</td><td>${w.pinyin || ''}</td><td>${w.meaning || ''}</td></tr>`;
            });
        }
        if (!rows) return '';
        return `
            <table class="review-table">
                <thead><tr><th>Từ vựng</th><th>Phiên âm</th><th>Nghĩa</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }

    function isLmsOverlayActive() {
        if (isPopout) return false;
        const overlay = document.getElementById('sync-active-modal');
        return !!(window.isWaitingForChild && overlay && overlay.style.display !== 'none' && overlay.classList.contains('show'));
    }

    function updateTimerUI(sec) {
        if (!timerBar) return;
        const percentage = Math.max(0, Math.min(100, (sec / 15) * 100));
        timerBar.style.width = `${percentage}%`;
        if (sec > 7) {
            timerBar.style.background = 'linear-gradient(to right, #10b981, #22c55e)';
            timerBar.style.boxShadow = '0 0 10px rgba(34, 197, 94, 0.4)';
        } else if (sec > 3) {
            timerBar.style.background = 'linear-gradient(to right, #f59e0b, #eab308)';
            timerBar.style.boxShadow = '0 0 10px rgba(234, 179, 8, 0.4)';
        } else {
            timerBar.style.background = 'linear-gradient(to right, #ef4444, #dc2626)';
            timerBar.style.boxShadow = '0 0 12px rgba(239, 68, 68, 0.7)';
        }
    }

    function startTimer(isResume = false) {
        if (isGameOver || isProcessing || isLmsOverlayActive()) return;
        clearInterval(timerInterval);
        if (!isResume) {
            timeLeft = 15;
        }
        updateTimerUI(timeLeft);

        timerInterval = setInterval(() => {
            if (isGameOver || isProcessing || isLmsOverlayActive()) {
                clearInterval(timerInterval);
                return;
            }

            timeLeft = Math.max(0, Number((timeLeft - 0.1).toFixed(2)));
            updateTimerUI(timeLeft);

            // Periodic sync every 1 second when in popout
            if (isPopout && Math.abs(Math.round(timeLeft) - timeLeft) < 0.05) {
                saveAndBroadcastState();
            }

            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                isProcessing = true;
                isGameOver = true;
                statusMsg.textContent = 'Hết giờ rồi! Bạn đã mất trắng.';

                const q = questions[currentIdx];
                const buttons = optionsGrid.querySelectorAll('.option-btn');
                buttons.forEach(b => b.disabled = true);
                if (buttons[q.correct]) {
                    buttons[q.correct].classList.add('correct');
                }

                playSfx(wrongSound, 'wrong');

                currentScore = "0";
                safeScore = "0";

                // Pre-populate resultModal immediately so snapshot carries complete result
                if (resultTitle) {
                    resultTitle.textContent = 'KẾT THÚC TRẬN ĐẤU';
                    resultTitle.style.color = 'var(--error)';
                }
                if (resultMessage) {
                    resultMessage.textContent = 'Hết thời gian! Bạn đã trắng tay. Số tiền thưởng: 0 VNĐ.';
                }
                if (reviewList) {
                    reviewList.innerHTML = buildReviewTableHtml(questions);
                }

                saveAndBroadcastState();

                setTimeout(() => endGame(false, false, true), 2000);
            }
        }, 100);
    }

    window.pauseTimer = function () {
        clearInterval(timerInterval);
    };

    window.resumeTimer = function () {
        if (isLmsOverlayActive()) return;
        if (!isGameOver && !isProcessing) {
            startTimer(true);
        }
    };

    window.closeHelpModal = function (modalId) {
        if (window.LMSAdapter) window.LMSAdapter.playSynthesizedSound('tap');
        document.getElementById(modalId).style.display = 'none';
        window.resumeTimer();
    };

    window.toggleLadderDrawer = function () {
        if (window.LMSAdapter) window.LMSAdapter.playSynthesizedSound('tap');
        const ladder = document.getElementById('moneyLadder');
        const backdrop = document.getElementById('ladderBackdrop');
        if (ladder) ladder.classList.toggle('drawer-open');
        if (backdrop) backdrop.classList.toggle('drawer-open');
    };

    function startCountdown() {
        countdownOverlay.style.display = 'flex';
        document.getElementById('instructionContent').style.display = 'block';
        document.getElementById('countdownRunning').style.display = 'none';
    }

    window.beginActualCountdown = function () {
        // Unlock audio system
        if (window.LMSAdapter && window.LMSAdapter.getAudioContext) {
            window.LMSAdapter.getAudioContext();
        }
        if (window.LMSAdapter) {
            window.LMSAdapter.playSynthesizedSound('click');
        }

        // Ensure music plays on interaction if not muted
        if (!isMuted && bgMusic.paused) {
            window.safePlayAudio ? window.safePlayAudio(bgMusic) : bgMusic.play().catch(e => console.log("Autoplay blocked:", e));
        }

        document.getElementById('instructionContent').style.display = 'none';
        const countdownRunning = document.getElementById('countdownRunning');
        countdownRunning.style.display = 'flex';

        let count = 3;
        countdownNumber.textContent = count;

        const interval = setInterval(() => {
            count--;
            if (count > 0) {
                countdownNumber.textContent = count;
                if (window.LMSAdapter) window.LMSAdapter.playTone(440, 'sine', 0.1, 0.2);
            } else {
                clearInterval(interval);
                countdownOverlay.style.display = 'none';
                if (window.LMSAdapter) window.LMSAdapter.playTone(880, 'triangle', 0.18, 0.25);
                loadQuestion();
            }
        }, 1000);
    };

    function loadQuestion() {
        if (currentIdx >= 15) {
            endGame(true);
            return;
        }

        updateLadder();
        const q = questions[currentIdx];
        questionNumNum.textContent = `Câu ${currentIdx + 1}/15`;
        questionText.textContent = q.q;
        optionsGrid.innerHTML = '';
        statusMsg.textContent = 'Suy nghĩ và chọn đáp án...';

        const prefixes = ['A', 'B', 'C', 'D'];
        q.a.forEach((opt, idx) => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            btn.setAttribute('data-prefix', `${prefixes[idx]}. `);
            btn.textContent = opt;
            btn.onclick = () => handleChoice(idx);
            optionsGrid.appendChild(btn);
        });

        startTimer();
        saveAndBroadcastState();
    }

    let help5050Timer = null;

    function handleChoice(idx) {
        if (isGameOver || isProcessing) return;
        isProcessing = true;
        window.pauseTimer(); // Stop timer immediately on choice
        clearInterval(timerInterval);

        // Cancel any pending 50/50 timers
        if (help5050Timer) {
            clearTimeout(help5050Timer);
            help5050Timer = null;
        }

        // Play immediate tactile button selection sound
        if (window.LMSAdapter) {
            window.LMSAdapter.playSynthesizedSound('select');
        }

        // Prime audio elements during user gesture
        try {
            correctSound.load();
            wrongSound.load();
        } catch (e) { }

        const q = questions[currentIdx];
        const buttons = optionsGrid.querySelectorAll('.option-btn');

        // Highlight selection
        buttons[idx].classList.add('selected');
        statusMsg.textContent = 'Đang kiểm tra kết quả...';

        // Suspend clicks
        buttons.forEach(b => b.disabled = true);
        saveAndBroadcastState();

        // Delay for suspense (3 seconds)
        setTimeout(() => {
            if (idx === q.correct) {
                // Correct
                buttons[idx].classList.remove('selected');
                buttons[idx].classList.add('correct');
                currentScore = ladderValues[currentIdx];

                // Set safe haven
                if (currentIdx === 4) safeScore = ladderValues[4];
                if (currentIdx === 9) safeScore = ladderValues[9];

                if (window.LMSBridge) {
                    window.LMSBridge.reportProgress(currentIdx, true, currentScore);
                }

                statusMsg.textContent = 'Chính xác! Đang chuẩn bị câu hỏi tiếp theo...';
                saveAndBroadcastState();

                let hasAdvanced = false;
                const proceed = () => {
                    if (hasAdvanced) return;
                    hasAdvanced = true;
                    currentIdx++;
                    isProcessing = false;
                    if (currentIdx < 15) {
                        loadQuestion();
                    } else {
                        endGame(true);
                    }
                    saveAndBroadcastState();
                };

                correctSound.onended = proceed;
                // Safety timeout fallback if onended fails or audio restricted
                setTimeout(proceed, 1800);

                playSfx(correctSound, 'correct');
            } else {
                // Wrong answer
                isGameOver = true;
                window.pauseTimer();
                clearInterval(timerInterval);
                playSfx(wrongSound, 'wrong');

                const finalPrize = (currentIdx >= 10) ? safeScore : (currentIdx >= 5 ? ladderValues[4] : "0");
                currentScore = finalPrize;

                if (window.LMSBridge) {
                    window.LMSBridge.reportProgress(currentIdx, false, finalPrize);
                }
                buttons[idx].classList.remove('selected');
                buttons[idx].classList.add('wrong');
                buttons[q.correct].classList.add('correct');
                statusMsg.textContent = `Tiếc quá! Bạn đã trả lời sai. Điểm thưởng: ${finalPrize} VNĐ.`;

                // Pre-populate resultModal immediately so snapshot carries complete result
                if (resultTitle) {
                    resultTitle.textContent = 'KẾT THÚC TRẬN ĐẤU';
                    resultTitle.style.color = 'var(--error)';
                }
                if (resultMessage) {
                    resultMessage.textContent = `Bạn đã trả lời sai tại câu số ${currentIdx + 1}. Số tiền thưởng: ${finalPrize} VNĐ.`;
                }
                if (reviewList) {
                    reviewList.innerHTML = buildReviewTableHtml(questions);
                }

                saveAndBroadcastState();
                setTimeout(() => endGame(false), 2000);
            }
        }, 3000);
    }

    window.use5050 = function () {
        if (isGameOver || isProcessing) return;
        window.pauseTimer();
        playSfx(helpSound, 'ding');

        const q = questions[currentIdx];
        const buttons = optionsGrid.querySelectorAll('.option-btn');
        const helpBtn = document.getElementById('help5050');
        if (helpBtn) {
            helpBtn.disabled = true;
            helpBtn.style.opacity = '0.3';
            helpBtn.style.cursor = 'not-allowed';
        }

        // Lock answer clicks briefly while 50/50 is calculated
        isProcessing = true;
        statusMsg.textContent = 'Hệ thống đang loại bỏ 2 phương án sai...';

        if (help5050Timer) clearTimeout(help5050Timer);
        help5050Timer = setTimeout(() => {
            if (isGameOver) return;
            let removed = 0;
            const indices = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
            for (let i = 0; i < indices.length && removed < 2; i++) {
                if (indices[i] !== q.correct) {
                    buttons[indices[i]].style.visibility = 'hidden';
                    buttons[indices[i]].disabled = true;
                    removed++;
                }
            }
            used5050 = true;
            isProcessing = false; // Re-enable choice processing
            statusMsg.textContent = 'Đã loại bỏ 2 phương án sai. Hãy chọn đáp án!';
            saveAndBroadcastState();
            window.resumeTimer();
        }, 1200);
    };

    window.useAudience = function () {
        if (isGameOver || isProcessing) return;
        window.pauseTimer();
        playSfx(helpSound, 'ding');
        const q = questions[currentIdx];
        const helpBtn = document.getElementById('helpAudience');
        helpBtn.disabled = true;
        helpBtn.style.opacity = '0.3';

        const modal = document.getElementById('audienceModal');
        modal.style.display = 'flex';
        const chart = document.getElementById('audienceChart');
        const closeBtn = document.getElementById('closeAudienceBtn');
        closeBtn.style.display = 'none';

        let status = document.getElementById('audienceStatus');
        if (status) status.remove();
        status = document.createElement('p');
        status.id = 'audienceStatus';
        status.style.marginBottom = '1rem';
        status.textContent = 'Khán giả đang bình chọn (5s)...';
        modal.querySelector('.modal-content').insertBefore(status, chart);

        const labels = ['A', 'B', 'C', 'D'];
        let duration = 5000; // 5 seconds
        const interval = setInterval(() => {
            duration -= 100;
            status.textContent = `Khán giả đang bình chọn (${Math.ceil(duration / 1000)}s)...`;

            // Random fluctuating bars
            chart.innerHTML = '';
            labels.forEach(() => {
                const p = Math.floor(Math.random() * 80) + 10;
                const container = document.createElement('div');
                container.className = 'bar-container';
                container.innerHTML = `
                    <div class="bar-percent">?%</div>
                    <div class="audience-bar" style="height: ${p * 1.5}px; transition: none;"></div>
                    <div class="bar-label">?</div>
                `;
                chart.appendChild(container);
            });

            if (duration <= 0) {
                clearInterval(interval);
                status.textContent = 'KẾT QUẢ BÌNH CHỌN CHÍNH THỨC:';
                closeBtn.style.display = 'inline-block';
                saveAndBroadcastState();

                // Final percentages
                let percs = [0, 0, 0, 0];
                let remaining = 100;
                const correctPerc = Math.floor(Math.random() * 30) + 55; // 55-85%
                percs[q.correct] = correctPerc;
                remaining -= correctPerc;

                const others = [0, 1, 2, 3].filter(i => i !== q.correct);
                others.forEach((idx, i) => {
                    if (i === others.length - 1) {
                        percs[idx] = remaining;
                    } else {
                        const p = Math.floor(Math.random() * (remaining - (others.length - i - 1)));
                        percs[idx] = p;
                        remaining -= p;
                    }
                });

                chart.innerHTML = '';
                percs.forEach((p, i) => {
                    const container = document.createElement('div');
                    container.className = 'bar-container';
                    container.innerHTML = `
                        <div class="bar-percent">${p}%</div>
                        <div class="audience-bar" style="height: ${p * 1.5}px"></div>
                        <div class="bar-label">${labels[i]}</div>
                    `;
                    chart.appendChild(container);
                });
            }
        }, 100);
    };

    window.useExpert = function () {
        if (isGameOver || isProcessing) return;
        window.pauseTimer();
        playSfx(helpSound, 'ding');
        const q = questions[currentIdx];
        const helpBtn = document.getElementById('helpExpert');
        helpBtn.disabled = true;
        helpBtn.style.opacity = '0.3';

        const modal = document.getElementById('expertModal');
        const thinking = document.getElementById('expertThinking');
        const answer = document.getElementById('expertAnswer');
        const timerBarExpert = document.getElementById('expertTimerBar');
        const closeBtn = document.getElementById('closeExpertBtn');

        modal.style.display = 'flex';
        thinking.style.display = 'block';
        answer.style.display = 'none';
        closeBtn.style.display = 'none';

        let timeLeftExpert = 5000; // 5 seconds
        const totalTimeExpert = 5000;
        const stepExpert = 100;
        const interval = setInterval(() => {
            timeLeftExpert -= stepExpert;
            timerBarExpert.style.width = (timeLeftExpert / totalTimeExpert * 100) + '%';
            thinking.querySelector('p').textContent = `Chuyên gia đang suy nghĩ (${Math.ceil(timeLeftExpert / 1000)}s)...`;

            if (timeLeftExpert <= 0) {
                clearInterval(interval);
                thinking.style.display = 'none';
                answer.style.display = 'block';
                closeBtn.style.display = 'inline-block';
                saveAndBroadcastState();
                const prefixes = ['A', 'B', 'C', 'D'];
                answer.innerHTML = `<strong>Chuyên gia tư vấn:</strong><br><br>Sau khi cân nhắc kỹ, tôi khá chắc chắn đáp án đúng là <strong>${prefixes[q.correct]}</strong>: "${q.a[q.correct]}".`;
            }
        }, stepExpert);
    };

    window.stopGamePrompt = function () {
        if (isGameOver) return;
        window.pauseTimer();
        if (window.LMSAdapter) window.LMSAdapter.playSynthesizedSound('tap');
        document.getElementById('stopModal').style.display = 'flex';
    };

    window.confirmStop = function () {
        if (window.LMSAdapter) window.LMSAdapter.playSynthesizedSound('tap');
        document.getElementById('stopModal').style.display = 'none';
        endGame(false, true);
        saveAndBroadcastState();
    };

    function endGame(isWin, stoppedManually = false, isTimeout = false) {
        isGameOver = true;
        isProcessing = false;
        clearInterval(timerInterval);
        bgMusic.pause(); // Pause music on game over

        const finalPrize = isWin ? "500.000.000" : (stoppedManually ? currentScore : ((currentIdx >= 10) ? safeScore : (currentIdx >= 5 ? ladderValues[4] : "0")));
        currentScore = finalPrize;

        // Generate vocab review table
        if (reviewList) {
            reviewList.innerHTML = buildReviewTableHtml(questions);
        }

        if (isWin) {
            resultTitle.textContent = 'CHÚC MỪNG CHIẾN THẮNG!';
            resultTitle.style.color = 'var(--secondary)';
            resultMessage.textContent = `Bạn đã trở thành Triệu Phú HSK 2 với 500.000.000 VNĐ!`;
            playSfx(clapSound, 'victory');
        } else if (stoppedManually) {
            resultTitle.textContent = 'BẢO TOÀN THÀNH CÔNG';
            resultTitle.style.color = 'var(--secondary)';
            resultMessage.textContent = `Bạn đã dừng cuộc chơi. Số tiền bạn mang về là: ${currentScore} VNĐ.`;
            if (currentScore === "0") {
                playSfx(wrongSound, 'wrong');
            } else {
                playSfx(clapSound, 'victory');
            }
        } else {
            resultTitle.textContent = 'KẾT THÚC TRẬN ĐẤU';
            resultTitle.style.color = 'var(--error)';
            if (isTimeout) {
                resultMessage.textContent = `Hết thời gian! Bạn đã trắng tay. Số tiền thưởng: 0 VNĐ.`;
                playSfx(wrongSound, 'wrong');
            } else {
                resultMessage.textContent = `Bạn đã trả lời sai tại câu số ${currentIdx + 1}. Số tiền thưởng: ${finalPrize} VNĐ.`;
            }
        }

        if (resultModal && !isLmsOverlayActive()) {
            resultModal.style.display = 'flex';
        }

        // Report Game Results to LMS (SCORM and postMessage)
        if (window.LMSBridge) {
            window.LMSBridge.reportComplete(isWin, currentIdx, finalPrize, stoppedManually);
        }
        saveAndBroadcastState();
    }

    // Comprehensive Game Restart Function
    let isRestarting = false;
    window.restartGame = function (e) {
        if (e && e.preventDefault) e.preventDefault();
        if (window.LMSAdapter) window.LMSAdapter.playSynthesizedSound('click');
        if (isRestarting) return;
        isRestarting = true;
        setTimeout(() => { isRestarting = false; }, 600);

        try {
            clearInterval(timerInterval);

            // 1. Hide result modal and backdrop
            if (resultModal) {
                resultModal.style.display = 'none';
            }
            const backdrop = document.getElementById('ladderBackdrop');
            if (backdrop) {
                backdrop.classList.remove('drawer-open');
            }
            if (moneyLadder) {
                moneyLadder.classList.remove('drawer-open');
            }

            // Clear previous game storage
            try {
                storage.removeItem('hsk2_synced_state');
                storage.removeItem('hsk2_active_session');
                window.__HSK2_LATEST_STATE__ = null;
                latestSyncedState = null;
                window.isWaitingForChild = false;
            } catch (e) {}

            // 2. Reset game state variables
            currentIdx = 0;
            isGameOver = false;
            isProcessing = false;
            used5050 = false;
            currentScore = "0";
            safeScore = "0";
            timeLeft = 15;
            updateTimerUI(15);

            // 3. Reset all lifelines
            if (help5050Btn) {
                help5050Btn.disabled = false;
                help5050Btn.style.opacity = '1';
                help5050Btn.style.cursor = 'pointer';
            }
            const helpAudienceBtn = document.getElementById('helpAudience');
            if (helpAudienceBtn) {
                helpAudienceBtn.disabled = false;
                helpAudienceBtn.style.opacity = '1';
                helpAudienceBtn.style.cursor = 'pointer';
            }
            const helpExpertBtn = document.getElementById('helpExpert');
            if (helpExpertBtn) {
                helpExpertBtn.disabled = false;
                helpExpertBtn.style.opacity = '1';
                helpExpertBtn.style.cursor = 'pointer';
            }

            // 4. Close any open dialogs
            ['stopModal', 'audienceModal', 'expertModal'].forEach(m => {
                const el = document.getElementById(m);
                if (el) el.style.display = 'none';
            });

            // 5. Generate fresh 15 questions
            generateNewQuestions();

            // 6. Rebuild ladder and launch countdown
            initLadder();
            startCountdown();
            saveAndBroadcastState();
            return;
        } catch (err) {
            console.error("In-memory restart error, falling back to reload:", err);
        }

        // Fallback for extreme cases (forcing cache bust)
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('_t', Date.now().toString());
            window.location.replace(url.toString());
        } catch (e) {
            window.location.href = window.location.href;
        }
    };

    // Explicitly bind click and touch events to restart button
    const restartBtn = document.getElementById('restartBtn');
    if (restartBtn) {
        restartBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.restartGame();
        });
        restartBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            window.restartGame();
        });
    }

    // ========================================================
    // BIDIRECTIONAL LMS <-> POPOUT STATE SYNCHRONIZATION
    // ========================================================

    function getGameStateSnapshot() {
        const hiddenOptions = [];
        const optionStates = {};
        let selectedOptionIdx = null;
        let areOptionsDisabled = false;

        if (optionsGrid) {
            const btns = optionsGrid.querySelectorAll('.option-btn');
            btns.forEach((b, idx) => {
                if (b.style.visibility === 'hidden') hiddenOptions.push(idx);
                if (b.classList.contains('selected')) {
                    optionStates[idx] = 'selected';
                    selectedOptionIdx = idx;
                } else if (b.classList.contains('wrong')) {
                    optionStates[idx] = 'wrong';
                    selectedOptionIdx = idx;
                } else if (b.classList.contains('correct')) {
                    optionStates[idx] = 'correct';
                }
                if (b.disabled) areOptionsDisabled = true;
            });
        }

        const curAudioTime = bgMusic ? Number(bgMusic.currentTime.toFixed(2)) : 0;
        const isAudioPlaying = !isMuted && !isGameOver && bgMusic && !bgMusic.paused;

        let rTitle = resultTitle ? resultTitle.textContent : '';
        let rColor = resultTitle ? resultTitle.style.color : '';
        let rMsg = resultMessage ? resultMessage.textContent : '';
        let rHtml = reviewList ? reviewList.innerHTML : '';

        // If game is over, synthesize complete result data so snapshot is never incomplete
        if (isGameOver) {
            if (!rTitle || rTitle === 'KẾT QUẢ') {
                rTitle = 'KẾT THÚC TRẬN ĐẤU';
            }
            if (!rColor) {
                rColor = 'var(--error)';
            }
            if (!rMsg) {
                rMsg = `Bạn đã dừng cuộc chơi tại câu ${currentIdx + 1}. Số tiền thưởng: ${currentScore || "0"} VNĐ.`;
            }
            if (!rHtml || rHtml.trim().length < 20) {
                rHtml = buildReviewTableHtml(questions);
            }
        }

        return {
            version: '2.0',
            timestamp: Date.now(),
            topicName: topicName,
            questions: (questions && questions.length > 0) ? questions : [],
            currentIdx: currentIdx,
            currentScore: currentScore,
            safeScore: safeScore,
            timeLeft: Math.max(0.1, Number(timeLeft.toFixed(1))),
            isGameOver: isGameOver,
            isProcessing: isProcessing,
            used5050: used5050,
            usedAudience: !!document.getElementById('helpAudience')?.disabled,
            usedExpert: !!document.getElementById('helpExpert')?.disabled,
            hiddenOptions: hiddenOptions,
            optionStates: optionStates,
            selectedOptionIdx: selectedOptionIdx,
            optionsDisabled: areOptionsDisabled,
            countdownPassed: (countdownOverlay && countdownOverlay.style.display === 'none'),
            statusMsg: statusMsg ? statusMsg.textContent : '',
            reviewListHTML: rHtml,
            resultModalOpen: (resultModal && resultModal.style.display === 'flex'),
            resultTitleText: rTitle,
            resultMessageText: rMsg,
            resultTitleColor: rColor,
            // Synchronized Audio State
            isMuted: isMuted,
            audioCurrentTime: curAudioTime,
            audioPlaying: isAudioPlaying
        };
    }

    function applyGameStateSnapshot(snapshot) {
        if (!snapshot) return false;

        if (snapshot.questions && Array.isArray(snapshot.questions) && snapshot.questions.length > 0) {
            questions = snapshot.questions;
        }
        if (snapshot.topicName) {
            topicName = snapshot.topicName;
            if (lessonNumDisp) lessonNumDisp.textContent = topicName;
        }

        currentIdx = typeof snapshot.currentIdx === 'number' ? snapshot.currentIdx : 0;
        currentScore = snapshot.currentScore || "0";
        safeScore = snapshot.safeScore || "0";
        isGameOver = !!snapshot.isGameOver;
        isProcessing = !!snapshot.isProcessing;

        try {
            initLadder();
            updateLadder();
        } catch (e) {
            console.warn("Ladder update warning:", e);
        }

        // 1. Audio Mute State
        if (typeof snapshot.isMuted === 'boolean') {
            isMuted = snapshot.isMuted;
            try { storage.setItem('musicMuted', isMuted ? 'true' : 'false'); } catch (e) { }
            updateAudioMuteState();
        }

        // 2. Lifelines state
        used5050 = !!snapshot.used5050;
        if (help5050Btn) {
            help5050Btn.disabled = used5050;
            help5050Btn.style.opacity = used5050 ? '0.3' : '1';
            help5050Btn.style.cursor = used5050 ? 'not-allowed' : 'pointer';
        }
        const helpAudienceBtn = document.getElementById('helpAudience');
        if (helpAudienceBtn) {
            helpAudienceBtn.disabled = !!snapshot.usedAudience;
            helpAudienceBtn.style.opacity = snapshot.usedAudience ? '0.3' : '1';
            helpAudienceBtn.style.cursor = snapshot.usedAudience ? 'not-allowed' : 'pointer';
        }
        const helpExpertBtn = document.getElementById('helpExpert');
        if (helpExpertBtn) {
            helpExpertBtn.disabled = !!snapshot.usedExpert;
            helpExpertBtn.style.opacity = snapshot.usedExpert ? '0.3' : '1';
            helpExpertBtn.style.cursor = snapshot.usedExpert ? 'not-allowed' : 'pointer';
        }

        // 3. Countdown overlay
        if (snapshot.countdownPassed) {
            if (countdownOverlay) countdownOverlay.style.display = 'none';
        } else {
            startCountdown();
        }

        // 4. Audio Time Continuity & Playback
        if (isFinite(snapshot.audioCurrentTime) && bgMusic) {
            try {
                if (bgMusic.duration && snapshot.audioCurrentTime >= bgMusic.duration) {
                    bgMusic.currentTime = snapshot.audioCurrentTime % bgMusic.duration;
                } else {
                    bgMusic.currentTime = snapshot.audioCurrentTime;
                }
            } catch (e) { }
        }

        // 5. Always Render Question & Option Buttons with Selected / Correct / Wrong states
        const q = questions[currentIdx];
        if (q && optionsGrid) {
            if (questionNumNum) questionNumNum.textContent = `Câu ${currentIdx + 1}/15`;
            if (questionText) questionText.textContent = q.q;
            optionsGrid.innerHTML = '';
            if (statusMsg) {
                statusMsg.textContent = snapshot.statusMsg || (isGameOver ? 'Trận đấu đã kết thúc' : 'Suy nghĩ và chọn đáp án...');
            }

            const prefixes = ['A', 'B', 'C', 'D'];
            q.a.forEach((opt, idx) => {
                const btn = document.createElement('button');
                btn.className = 'option-btn';
                btn.setAttribute('data-prefix', `${prefixes[idx]}. `);
                btn.textContent = opt;
                btn.onclick = () => handleChoice(idx);

                // Restore 50/50 lifeline hidden state
                if (snapshot.hiddenOptions && snapshot.hiddenOptions.includes(idx)) {
                    btn.style.visibility = 'hidden';
                    btn.disabled = true;
                }

                // Restore selected, correct, or wrong classes
                if (snapshot.optionStates && snapshot.optionStates[idx]) {
                    btn.classList.add(snapshot.optionStates[idx]);
                }

                // Disable if options were answered, evaluating, or game over
                if (snapshot.optionsDisabled || snapshot.isProcessing || isGameOver) {
                    btn.disabled = true;
                }

                optionsGrid.appendChild(btn);
            });
        }

        // 6. Game status
        if (isGameOver) {
            clearInterval(timerInterval);
            if (bgMusic) bgMusic.pause();
            if (resultModal) {
                if (resultTitle) {
                    const titleText = (snapshot.resultTitleText && snapshot.resultTitleText !== 'KẾT QUẢ')
                        ? snapshot.resultTitleText
                        : 'KẾT THÚC TRẬN ĐẤU';
                    resultTitle.textContent = titleText;
                    resultTitle.style.color = snapshot.resultTitleColor || 'var(--error)';
                }
                if (resultMessage) {
                    resultMessage.textContent = snapshot.resultMessageText ||
                        `Bạn đã kết thúc lượt chơi tại câu ${currentIdx + 1}. Số tiền thưởng: ${currentScore || 0} VNĐ.`;
                }
                if (reviewList) {
                    if (snapshot.reviewListHTML && snapshot.reviewListHTML.trim().length > 20) {
                        reviewList.innerHTML = snapshot.reviewListHTML;
                    } else {
                        reviewList.innerHTML = buildReviewTableHtml(questions);
                    }
                }

                // Smooth result modal presentation:
                // If resultModal was ALREADY open in the snapshot, show it (unless in waiting LMS overlay).
                // If it was still in the answer reveal phase (red/green buttons visible),
                // keep modal closed so the user sees the answer result first, then display modal after 2s.
                if (snapshot.resultModalOpen && !isLmsOverlayActive()) {
                    resultModal.style.display = 'flex';
                } else {
                    resultModal.style.display = 'none';
                    if (!isLmsOverlayActive()) {
                        setTimeout(() => {
                            if (isGameOver && !isLmsOverlayActive() && resultModal) {
                                resultModal.style.display = 'flex';
                            }
                        }, 2000);
                    }
                }
            }
        } else {
            if (resultModal) resultModal.style.display = 'none';

            const hasCorrectOption = snapshot.optionStates && Object.values(snapshot.optionStates).includes('correct');
            const hasSelectedOption = snapshot.optionStates && Object.values(snapshot.optionStates).includes('selected');

            if (hasCorrectOption) {
                // Show green button and smoothly advance to next question
                setTimeout(() => {
                    if (!isGameOver && currentIdx < 14) {
                        currentIdx++;
                        isProcessing = false;
                        loadQuestion();
                        saveAndBroadcastState();
                    } else if (!isGameOver && currentIdx >= 14) {
                        endGame(true);
                    }
                }, 1800);
            } else if (hasSelectedOption) {
                // Suspense checking animation in new window
                setTimeout(() => {
                    if (isGameOver) return;
                    const curQ = questions[currentIdx];
                    if (!curQ) return;
                    const chosenIdx = snapshot.selectedOptionIdx;
                    if (chosenIdx === null || chosenIdx === undefined) return;

                    const btns = optionsGrid.querySelectorAll('.option-btn');
                    if (chosenIdx === curQ.correct) {
                        if (btns[chosenIdx]) {
                            btns[chosenIdx].classList.remove('selected');
                            btns[chosenIdx].classList.add('correct');
                        }
                        currentScore = ladderValues[currentIdx];
                        if (currentIdx === 4) safeScore = ladderValues[4];
                        if (currentIdx === 9) safeScore = ladderValues[9];
                        statusMsg.textContent = 'Chính xác! Đang chuẩn bị câu hỏi tiếp theo...';
                        playSfx(correctSound, 'correct');
                        saveAndBroadcastState();
                        setTimeout(() => {
                            if (!isGameOver && currentIdx < 14) {
                                currentIdx++;
                                isProcessing = false;
                                loadQuestion();
                                saveAndBroadcastState();
                            } else if (!isGameOver) {
                                endGame(true);
                            }
                        }, 1800);
                    } else {
                        isGameOver = true;
                        window.pauseTimer();
                        clearInterval(timerInterval);
                        playSfx(wrongSound, 'wrong');
                        const finalPrize = (currentIdx >= 10) ? safeScore : (currentIdx >= 5 ? ladderValues[4] : "0");
                        currentScore = finalPrize;
                        if (btns[chosenIdx]) {
                            btns[chosenIdx].classList.remove('selected');
                            btns[chosenIdx].classList.add('wrong');
                        }
                        if (btns[curQ.correct]) {
                            btns[curQ.correct].classList.add('correct');
                        }
                        statusMsg.textContent = `Tiếc quá! Bạn đã trả lời sai. Điểm thưởng: ${finalPrize} VNĐ.`;
                        if (resultTitle) {
                            resultTitle.textContent = 'KẾT THÚC TRẬN ĐẤU';
                            resultTitle.style.color = 'var(--error)';
                        }
                        if (resultMessage) {
                            resultMessage.textContent = `Bạn đã trả lời sai tại câu số ${currentIdx + 1}. Số tiền thưởng: ${finalPrize} VNĐ.`;
                        }
                        if (reviewList) {
                            reviewList.innerHTML = buildReviewTableHtml(questions);
                        }
                        saveAndBroadcastState();
                        setTimeout(() => endGame(false), 2000);
                    }
                }, 2000);
            } else if (!snapshot.optionsDisabled && !snapshot.isProcessing && !isLmsOverlayActive()) {
                const targetTime = (typeof snapshot.timeLeft === 'number') ? snapshot.timeLeft : (params.has('timeLeft') ? parseFloat(params.get('timeLeft')) : 15);
                timeLeft = Math.max(0.1, Number(targetTime.toFixed(1)));
                updateTimerUI(timeLeft);
                startTimer(true);
            }

            // Resume audio continuation seamlessly if not muted and not in paused parent
            if (!isMuted && (!childWin || childWin.closed) && !isLmsOverlayActive()) {
                if (bgMusic && bgMusic.paused) {
                    window.safePlayAudio ? window.safePlayAudio(bgMusic) : bgMusic.play().catch(() => { });
                }
            }
        }
        return true;
    }

    function updateSyncOverlayInfo(state) {
        if (!state) return;
        const topicEl = document.getElementById('sync-overlay-topic');
        const questionEl = document.getElementById('sync-overlay-question');
        const scoreEl = document.getElementById('sync-overlay-score');
        const modal = document.getElementById('sync-active-modal');
        const titleEl = modal ? modal.querySelector('.sync-title') : null;
        const descEl = modal ? modal.querySelector('.sync-description') : null;
        const badgeEl = modal ? modal.querySelector('.sync-badge') : null;
        const resumeBtn = modal ? modal.querySelector('.sync-resume-btn') : null;

        if (topicEl) topicEl.textContent = state.topicName || topicName || "Chưa chọn";
        if (questionEl) {
            const cur = (typeof state.currentIdx === 'number' ? state.currentIdx + 1 : 1);
            questionEl.textContent = state.isGameOver ? `Câu ${cur} / 15 (Kết thúc)` : `Câu ${cur} / 15`;
        }
        if (scoreEl) {
            scoreEl.textContent = state.currentScore ? `${state.currentScore} đ` : '0 đ';
        }

        if (state.isGameOver) {
            if (badgeEl) {
                badgeEl.innerHTML = `<span class="sync-dot" style="background:#ef4444;box-shadow:0 0 8px #ef4444;"></span><span>TRẬN ĐẤU ĐÃ KẾT THÚC</span>`;
            }
            if (titleEl) {
                titleEl.textContent = state.resultTitleText || "Trận Đấu Đã Kết Thúc";
                titleEl.style.color = state.resultTitleColor || "var(--secondary)";
            }
            if (descEl) {
                descEl.textContent = state.resultMessageText || `Kết quả trận đấu: ${state.currentScore || "0"} đ. Bạn có thể xem kết quả chi tiết và ôn tập từ vựng tại đây.`;
            }
            if (resumeBtn) {
                resumeBtn.textContent = "📊 Xem Kết Quả & Ôn Tập Tại Màn Hình Này";
            }
        }
    }

    function saveAndBroadcastState(customSnapshot = null, isClosing = false) {
        const snapshot = customSnapshot || getGameStateSnapshot();
        if (isClosing) snapshot.isPopoutClosing = true;
        latestSyncedState = snapshot;
        window.__HSK2_LATEST_STATE__ = snapshot;

        try {
            storage.setItem('hsk2_synced_state', JSON.stringify(snapshot));
            if (isClosing) {
                localStorage.setItem('hsk2_popout_closed', Date.now().toString());
            }
        } catch (e) { }

        const msgType = isClosing ? 'HSK2_POPOUT_CLOSED' : 'HSK2_STATE_UPDATE';

        if (syncChannel) {
            try {
                syncChannel.postMessage({ type: msgType, state: snapshot });
            } catch (e) { }
        }

        if (isPopout && window.opener && !window.opener.closed) {
            try {
                window.opener.postMessage({ type: msgType, state: snapshot }, '*');
            } catch (e) { }
        } else if (childWin && !childWin.closed) {
            try {
                childWin.postMessage({ type: msgType, state: snapshot }, '*');
            } catch (e) { }
        }

        updateSyncOverlayInfo(snapshot);
    }

    let lastChildMessageTime = 0;

    function handleIncomingSync(data) {
        if (!data) return;
        lastChildMessageTime = Date.now();
        const type = data.type || data.action;
        const state = data.state;

        if (type === 'HSK2_HEARTBEAT') {
            return;
        }

        // 1. Audio Synchronization
        if (type === 'HSK2_AUDIO_SYNC') {
            if (typeof data.isMuted === 'boolean') {
                isMuted = data.isMuted;
                storage.setItem('musicMuted', isMuted ? 'true' : 'false');
                updateAudioMuteState();
                if (bgMusic) {
                    bgMusic.muted = isMuted;
                    if (isMuted) {
                        bgMusic.pause();
                    } else if (!isPopout && childWin && !childWin.closed) {
                        // Keep parent paused while child is active
                        bgMusic.pause();
                    } else if (!isGameOver) {
                        if (isFinite(data.audioCurrentTime)) {
                            try { bgMusic.currentTime = data.audioCurrentTime; } catch (e) { }
                        }
                        window.safePlayAudio ? window.safePlayAudio(bgMusic) : bgMusic.play().catch(() => { });
                    }
                }
            }
            return;
        }

        // 2. Handshake: Child window is ready, reply immediately with current full state
        if (type === 'HSK2_CHILD_READY' && !isPopout) {
            const currentSnap = getGameStateSnapshot();
            if (childWin && !childWin.closed) {
                try { childWin.postMessage({ type: 'HSK2_STATE_SYNC', state: currentSnap }, '*'); } catch (e) { }
            }
            if (syncChannel) {
                try { syncChannel.postMessage({ type: 'HSK2_STATE_SYNC', state: currentSnap }); } catch (e) { }
            }
            return;
        }

        // 3. Parent LMS window handling updates from Child
        if (!isPopout) {
            // Strictly guard: only process child state if this parent window actually opened a child
            if (!window.isWaitingForChild && !childWin) {
                return;
            }
            lastChildMessageTime = Date.now();

            if (state) {
                latestSyncedState = state;
                window.__HSK2_LATEST_STATE__ = state;
                updateSyncOverlayInfo(state);

                // Report progress/completion to LMS SCORM in parent window
                if (window.LMSBridge) {
                    if (state.isGameOver) {
                        window.LMSBridge.reportComplete(
                            state.isWin,
                            state.currentIdx,
                            state.currentScore,
                            state.stoppedManually
                        );
                    } else if (state.currentIdx > 0) {
                        window.LMSBridge.reportProgress(state.currentIdx, true, state.currentScore);
                    }
                }
            }

            if (type === 'HSK2_POPOUT_CLOSED' || (state && state.isPopoutClosing)) {
                if (window.isWaitingForChild || childWin) {
                    resumeInLmsWindow(false);
                }
            }
        } else {
            // 4. Child window handling updates from Parent
            if ((type === 'HSK2_STATE_SYNC' || type === 'HSK2_STATE_UPDATE') && state) {
                applyGameStateSnapshot(state);
            } else if (type === 'HSK2_PARENT_RESUMED') {
                if (window.LMSAdapter && typeof window.LMSAdapter.showToast === 'function') {
                    window.LMSAdapter.showToast("👉 Đang tiếp tục chơi trên màn hình LMS.");
                }
            }
        }
    }

    if (syncChannel) {
        syncChannel.onmessage = (e) => {
            handleIncomingSync(e.data);
        };
    }

    window.addEventListener('message', (e) => {
        handleIncomingSync(e.data);
    });

    window.addEventListener('storage', (e) => {
        if (e.key === 'hsk2_synced_state' && e.newValue) {
            if (isPopout || window.isWaitingForChild || childWin) {
                try {
                    const parsed = JSON.parse(e.newValue);
                    if (parsed) {
                        handleIncomingSync({
                            type: parsed.isPopoutClosing ? 'HSK2_POPOUT_CLOSED' : 'HSK2_STATE_UPDATE',
                            state: parsed
                        });
                    }
                } catch (err) { }
            }
        }
    });

    /**
     * Multi-tier Open Standalone Window Strategy (Matches HSK 4 Architecture)
     */
    function openGameInNewWindow(e) {
        if (e && e.preventDefault) e.preventDefault();
        if (window.LMSAdapter) window.LMSAdapter.playSynthesizedSound('tap');

        if (isPopout) {
            closePopoutAndReturnToLMS();
            return;
        }

        window.isWaitingForChild = true;

        // 1. Pause timer in LMS parent
        window.pauseTimer();

        // 2. Capture audio timestamp before pausing
        const currentAudioTime = bgMusic ? Number(bgMusic.currentTime.toFixed(2)) : 0;
        if (bgMusic && !bgMusic.paused) {
            try { bgMusic.pause(); } catch (err) { }
        }

        // 3. Snapshot current state with audio details
        const snapshot = getGameStateSnapshot();
        const currentExactTimeLeft = Math.max(0.1, Number(timeLeft.toFixed(1)));
        snapshot.isLmsWaiting = true;
        snapshot.syncSessionId = 'sync_' + Date.now();
        snapshot.audioCurrentTime = currentAudioTime;
        snapshot.isMuted = isMuted;
        snapshot.timeLeft = currentExactTimeLeft;

        try {
            storage.setItem('hsk2_synced_state', JSON.stringify(snapshot));
            storage.setItem('hsk2_active_session', snapshot.syncSessionId);
        } catch (err) { }
        window.__HSK2_LATEST_STATE__ = snapshot;

        if (syncChannel) {
            try {
                syncChannel.postMessage({ type: 'HSK2_SYNC_INIT', state: snapshot });
            } catch (e) { }
        }

        // 4. Show Parent LMS Sync Overlay Modal
        const overlay = document.getElementById('sync-active-modal') || document.getElementById('popoutActiveOverlay');
        if (overlay) {
            overlay.classList.add('show');
            overlay.style.display = 'flex';
            updateSyncOverlayInfo(snapshot);
        }

        // 5. Build clean URL passing session, topic, audioTime, muted state, exact timer & question
        const targetUrl = new URL(window.location.href);
        targetUrl.searchParams.delete('state');
        targetUrl.hash = '';
        targetUrl.searchParams.set('topic', topicName);
        targetUrl.searchParams.set('popout', '1');
        targetUrl.searchParams.set('session', snapshot.syncSessionId);
        targetUrl.searchParams.set('audioTime', currentAudioTime);
        targetUrl.searchParams.set('muted', isMuted ? '1' : '0');
        targetUrl.searchParams.set('timeLeft', currentExactTimeLeft.toString());
        targetUrl.searchParams.set('qIdx', currentIdx.toString());

        const scrWidth = (window.screen && window.screen.availWidth) || window.innerWidth || 1280;
        const scrHeight = (window.screen && window.screen.availHeight) || window.innerHeight || 800;
        const width = Math.min(1240, scrWidth - 40);
        const height = Math.min(760, scrHeight - 60);
        const left = Math.max(0, Math.floor((scrWidth - width) / 2));
        const top = Math.max(0, Math.floor((scrHeight - height) / 2));
        const windowFeatures = `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;

        let child = null;

        // Strategy 1: Standalone Popup Window with features
        try {
            child = window.open(targetUrl.toString(), 'HSK2_Standalone_Game', windowFeatures);
        } catch (err) {
            console.warn("[Popout] Strategy 1 failed:", err);
        }

        // Strategy 2: Named Window without features
        if (!child || child.closed || typeof child.closed === 'undefined') {
            try {
                child = window.open(targetUrl.toString(), 'HSK2_Standalone_Game');
            } catch (err) {
                console.warn("[Popout] Strategy 2 failed:", err);
            }
        }

        // Strategy 3: Standard New Tab (_blank)
        if (!child || child.closed || typeof child.closed === 'undefined') {
            try {
                child = window.open(targetUrl.toString(), '_blank');
            } catch (err) {
                console.warn("[Popout] Strategy 3 failed:", err);
            }
        }

        // Strategy 4: Anchor Click Fallback (Bypasses strict iframe sandboxes)
        if (!child || child.closed || typeof child.closed === 'undefined') {
            try {
                const a = document.createElement('a');
                a.href = targetUrl.toString();
                a.target = '_blank';
                a.rel = 'noopener';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                child = true;
            } catch (err) {
                console.warn("[Popout] Strategy 4 failed:", err);
            }
        }

        if (child) {
            if (child !== true) {
                childWin = child;
                try {
                    child.__HSK2_LATEST_STATE__ = snapshot;
                } catch (err) { }
                try { child.focus(); } catch (err) { }
            }

            if (window.LMSAdapter && window.LMSAdapter.showToast) {
                window.LMSAdapter.showToast("🚀 Đang chơi tại cửa sổ mới! Màn hình LMS tạm dừng và chờ đồng bộ.");
            }

            // Safe poller to detect child window closure
            if (popoutPollInterval) {
                clearInterval(popoutPollInterval);
                popoutPollInterval = null;
            }

            lastChildMessageTime = Date.now();

            setTimeout(() => {
                if (!childWin || childWin === true) return;
                popoutPollInterval = setInterval(() => {
                    let isClosed = false;
                    try {
                        isClosed = !childWin || childWin.closed;
                    } catch (err) {
                        isClosed = false;
                    }
                    if (isClosed) {
                        // Crucial fix: In LMS iframes, Chromium/Edge marks childWin.closed = true prematurely.
                        // If child sent a heartbeat/message within the last 5 seconds, it is still alive!
                        if (Date.now() - lastChildMessageTime < 5000) {
                            return; // Do NOT resume while child is actively playing
                        }
                        clearInterval(popoutPollInterval);
                        popoutPollInterval = null;
                        childWin = null;
                        resumeInLmsWindow(false);
                    }
                }, 1000);
            }, 3000);
        } else {
            if (overlay) {
                overlay.classList.remove('show');
                overlay.style.display = 'none';
            }
            window.resumeTimer();
            if (!isMuted && !isGameOver && bgMusic && bgMusic.paused) {
                window.safePlayAudio ? window.safePlayAudio(bgMusic) : bgMusic.play().catch(() => { });
            }
            if (window.LMSAdapter && window.LMSAdapter.showToast) {
                window.LMSAdapter.showToast("⚠️ Vui lòng cho phép popup trên trình duyệt của bạn!");
            }
        }
    }

    function focusChildWindow() {
        if (window.LMSAdapter) window.LMSAdapter.playSynthesizedSound('tap');
        let isAlive = false;
        if (childWin) {
            try { isAlive = !childWin.closed; } catch (e) { isAlive = false; }
        }
        if (isAlive) {
            try { childWin.focus(); return; } catch (e) { }
        }
        openGameInNewWindow();
    }

    /**
     * Resume playing directly in the Parent LMS window
     */
    function resumeInLmsWindow(forceCloseChild = false) {
        if (window.LMSAdapter) window.LMSAdapter.playSynthesizedSound('tap');
        window.isWaitingForChild = false;
        if (popoutPollInterval) {
            clearInterval(popoutPollInterval);
            popoutPollInterval = null;
        }

        if (childWin) {
            try {
                if (!childWin.closed) childWin.close();
            } catch (e) { }
            childWin = null;
        }

        const overlay = document.getElementById('sync-active-modal') || document.getElementById('popoutActiveOverlay');
        if (overlay) {
            overlay.classList.remove('show');
            overlay.style.setProperty('display', 'none', 'important');
        }

        let stateToApply = latestSyncedState;
        try {
            const raw = storage.getItem('hsk2_synced_state');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed) {
                    if (!stateToApply || (parsed.timestamp && parsed.timestamp > (stateToApply.timestamp || 0)) || parsed.isGameOver) {
                        stateToApply = parsed;
                    }
                }
            }
        } catch (e) { }

        // Clean up one-time synced state so future fresh visits start clean
        try {
            storage.removeItem('hsk2_synced_state');
            storage.removeItem('hsk2_active_session');
            storage.removeItem('hsk2_popout_closed');
        } catch (e) { }

        if (stateToApply) {
            applyGameStateSnapshot(stateToApply);
            if (stateToApply.isGameOver && resultModal) {
                resultModal.style.display = 'flex';
                if (resultTitle && (!resultTitle.textContent || resultTitle.textContent === 'KẾT QUẢ')) {
                    resultTitle.textContent = (stateToApply.resultTitleText && stateToApply.resultTitleText !== 'KẾT QUẢ') ? stateToApply.resultTitleText : 'KẾT THÚC TRẬN ĐẤU';
                    resultTitle.style.color = stateToApply.resultTitleColor || 'var(--error)';
                }
                if (resultMessage && !resultMessage.textContent) {
                    resultMessage.textContent = stateToApply.resultMessageText || `Bạn đã kết thúc lượt chơi tại câu ${(stateToApply.currentIdx || 0) + 1}. Số tiền thưởng: ${stateToApply.currentScore || "0"} VNĐ.`;
                }
                if (reviewList && (!reviewList.innerHTML || reviewList.innerHTML.trim().length < 20)) {
                    reviewList.innerHTML = (stateToApply.reviewListHTML && stateToApply.reviewListHTML.trim().length > 20) ? stateToApply.reviewListHTML : buildReviewTableHtml(questions);
                }
            }
            if (window.LMSAdapter && window.LMSAdapter.showToast) {
                if (stateToApply.isGameOver) {
                    window.LMSAdapter.showToast("🏆 Đã đồng bộ kết quả từ cửa sổ mới!");
                } else {
                    window.LMSAdapter.showToast(`🎮 Đã đồng bộ tiến trình! Tiếp tục câu ${stateToApply.currentIdx + 1}/15`);
                }
            }
        } else {
            if (isGameOver) {
                if (resultModal) {
                    resultModal.style.display = 'flex';
                    if (resultTitle && (!resultTitle.textContent || resultTitle.textContent === 'KẾT QUẢ')) {
                        resultTitle.textContent = 'KẾT THÚC TRẬN ĐẤU';
                        resultTitle.style.color = 'var(--error)';
                    }
                    if (resultMessage && !resultMessage.textContent) {
                        resultMessage.textContent = `Bạn đã kết thúc lượt chơi. Số tiền thưởng: ${currentScore || "0"} VNĐ.`;
                    }
                    if (reviewList && (!reviewList.innerHTML || reviewList.innerHTML.trim().length < 20)) {
                        reviewList.innerHTML = buildReviewTableHtml(questions);
                    }
                }
            } else {
                window.resumeTimer();
                if (!isMuted && !isGameOver && bgMusic && bgMusic.paused) {
                    window.safePlayAudio ? window.safePlayAudio(bgMusic) : bgMusic.play().catch(() => { });
                }
            }
        }

        // Notify child that parent resumed
        if (childWin && !childWin.closed) {
            try { childWin.postMessage({ type: 'HSK2_PARENT_RESUMED' }, '*'); } catch (e) { }
        }
        if (syncChannel) {
            try { syncChannel.postMessage({ type: 'HSK2_PARENT_RESUMED' }); } catch (e) { }
        }
    }

    /**
     * Handle Child Window Closure & Synchronize Back to LMS Parent
     */
    function closePopoutAndReturnToLMS() {
        const finalSnapshot = getGameStateSnapshot();
        finalSnapshot.isPopoutClosing = true;
        saveAndBroadcastState(finalSnapshot, true);

        if (window.opener && !window.opener.closed) {
            try {
                window.opener.focus();
            } catch (e) { }
        }
        window.close();
    }

    // UI Setup for Child Window
    if (isPopout) {
        // Send continuous heartbeat to parent LMS window to prevent premature resume
        setInterval(() => {
            const hbMsg = { type: 'HSK2_HEARTBEAT', timestamp: Date.now() };
            if (syncChannel) {
                try { syncChannel.postMessage(hbMsg); } catch (e) { }
            }
            if (window.opener && !window.opener.closed) {
                try { window.opener.postMessage(hbMsg, '*'); } catch (e) { }
            }
        }, 1500);

        const popBtn = document.getElementById('popout-btn');
        if (popBtn) {
            popBtn.title = "Quay về màn hình LMS (Đóng cửa sổ này)";
            popBtn.setAttribute('aria-label', "Quay về màn hình LMS");
            popBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;">
                    <polyline points="9 14 4 9 9 4"></polyline>
                    <path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>
                </svg>
            `;
            popBtn.onclick = function (e) {
                if (e && e.preventDefault) e.preventDefault();
                closePopoutAndReturnToLMS();
            };
        }

        const handleUnload = () => {
            const finalSnapshot = getGameStateSnapshot();
            finalSnapshot.isPopoutClosing = true;
            saveAndBroadcastState(finalSnapshot, true);
        };
        window.addEventListener('beforeunload', handleUnload);
        window.addEventListener('pagehide', handleUnload);
    } else {
        const popBtn = document.getElementById('popout-btn');
        if (popBtn) {
            popBtn.title = "Mở ở cửa sổ mới (Đồng bộ tiến trình)";
            popBtn.setAttribute('aria-label', "Mở ở cửa sổ mới");
            popBtn.onclick = function (e) {
                if (e && e.preventDefault) e.preventDefault();
                openGameInNewWindow(e);
            };
        }
    }

    // Export functions to window
    window.openGameInNewWindow = openGameInNewWindow;
    window._fullOpenGameInNewWindow = openGameInNewWindow;
    window.openStandaloneWindow = openGameInNewWindow;
    window.focusChildWindow = focusChildWindow;
    window.resumeInLmsWindow = resumeInLmsWindow;
    window.closePopoutAndReturnToLMS = closePopoutAndReturnToLMS;
    window.getGameStateSnapshot = getGameStateSnapshot;
    window.applyGameStateSnapshot = applyGameStateSnapshot;
    window.saveAndBroadcastState = saveAndBroadcastState;

    initLadder();
    if (initialSyncedState) {
        applyGameStateSnapshot(initialSyncedState);
        if (params.get('resume_sync') === '1') {
            try {
                storage.removeItem('hsk2_synced_state');
                storage.removeItem('hsk2_active_session');
            } catch (e) { }
        }
    } else {
        startCountdown();
    }
});
