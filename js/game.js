document.addEventListener('DOMContentLoaded', () => {
    const storage = window.safeStorage || {
        getItem(k) { try { return localStorage.getItem(k); } catch(e) { return null; } },
        setItem(k, v) { try { localStorage.setItem(k, v); } catch(e) {} }
    };

    const params = new URLSearchParams(window.location.search);
    const isPopout = params.get('popout') === '1' || (window.opener && window.opener !== window && window.name === 'HSK2_Standalone_Game');

    let syncChannel = null;
    try {
        if ('BroadcastChannel' in window) {
            syncChannel = new BroadcastChannel('hsk2_millionaire_sync');
        }
    } catch (e) {}

    let latestSyncedState = null;
    let childWin = null;
    let popoutPollInterval = null;

    // Check for existing state snapshot to resume
    let initialSyncedState = null;
    if (isPopout || params.get('resume_sync') === '1') {
        try {
            const raw = storage.getItem('hsk2_synced_state');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.questions && parsed.questions.length === 15 && (Date.now() - parsed.timestamp < 7200000)) {
                    initialSyncedState = parsed;
                }
            }
        } catch (err) {}
        try {
            if (!initialSyncedState && window.opener && window.opener.__HSK2_LATEST_STATE__) {
                initialSyncedState = window.opener.__HSK2_LATEST_STATE__;
            }
        } catch (e) {}
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

    // Music State Management (LMS-Safe Storage based on HSK 4)
    let isMuted = safeStorage.getItem('musicMuted') === 'true';

    function updateAudioMuteState() {
        const btn = document.getElementById('musicToggle');
        if (btn) {
            const icon = btn.querySelector('.icon') || btn;
            icon.textContent = isMuted ? '🔇' : '🔊';
        }
        bgMusic.muted = isMuted;
        correctSound.muted = isMuted;
        wrongSound.muted = isMuted;
        helpSound.muted = isMuted;
        clapSound.muted = isMuted;

        if (isMuted) {
            bgMusic.pause();
        } else {
            if (bgMusic.paused) {
                window.safePlayAudio ? window.safePlayAudio(bgMusic) : bgMusic.play().catch(e => {});
            }
        }
    }

    let lastToggleTime = 0;
    window.toggleMusic = function (e) {
        if (e && e.preventDefault) e.preventDefault();
        const now = Date.now();
        if (now - lastToggleTime < 250) return; // Prevent double trigger from touch+click
        lastToggleTime = now;

        isMuted = !isMuted;
        safeStorage.setItem('musicMuted', isMuted ? 'true' : 'false');
        updateAudioMuteState();
        if (window.LMSAdapter && window.LMSAdapter.showToast) {
            window.LMSAdapter.showToast(isMuted ? '🔇 Đã tắt âm thanh' : '🔊 Đã bật âm thanh');
        }
    };

    window.setMuted = function (muted) {
        isMuted = !!muted;
        safeStorage.setItem('musicMuted', isMuted ? 'true' : 'false');
        updateAudioMuteState();
    };

    // Initialize audio mute state
    updateAudioMuteState();

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
            document.getElementById(`ladder-${currentIdx}`).classList.add('active');
        }
    }

    function startTimer(isResume = false) {
        clearInterval(timerInterval);
        if (!isResume) {
            timeLeft = 15;
            timerBar.style.width = '100%';
        } else {
            const percentage = Math.max(0, Math.min(100, (timeLeft / 15) * 100));
            timerBar.style.width = `${percentage}%`;
        }

        timerInterval = setInterval(() => {
            timeLeft -= 0.1;
            const percentage = Math.max(0, (timeLeft / 15) * 100);
            timerBar.style.width = `${percentage}%`;

            // Periodic sync every 1 second when in popout
            if (isPopout && Math.abs(Math.round(timeLeft) - timeLeft) < 0.05) {
                saveAndBroadcastState();
            }

            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                isProcessing = true;
                statusMsg.textContent = 'Hết giờ rồi! Bạn đã mất trắng.';
                
                const q = questions[currentIdx];
                const buttons = optionsGrid.querySelectorAll('.option-btn');
                buttons.forEach(b => b.disabled = true);
                if (buttons[q.correct]) {
                    buttons[q.correct].classList.add('correct');
                }
                
                if (window.safePlayAudio) {
                    window.safePlayAudio(wrongSound);
                } else {
                    wrongSound.play().catch(e => {});
                }
                
                currentScore = "0";
                safeScore = "0";
                saveAndBroadcastState();
                
                setTimeout(() => endGame(false, false, true), 3000);
            }
        }, 100);
    }

    window.pauseTimer = function () {
        clearInterval(timerInterval);
    };

    window.resumeTimer = function () {
        if (!isGameOver) {
            startTimer(true);
        }
    };

    window.closeHelpModal = function (modalId) {
        document.getElementById(modalId).style.display = 'none';
        window.resumeTimer();
    };

    window.toggleLadderDrawer = function () {
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

    window.beginActualCountdown = function() {
        // Ensure music plays on interaction
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
            } else {
                clearInterval(interval);
                countdownOverlay.style.display = 'none';
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

    function handleChoice(idx) {
        if (isGameOver || isProcessing) return;
        isProcessing = true;
        clearInterval(timerInterval); // Stop timer on choice

        const q = questions[currentIdx];
        const buttons = optionsGrid.querySelectorAll('.option-btn');

        // Highlight selection
        buttons[idx].classList.add('selected');
        statusMsg.textContent = 'Đang kiểm tra...';

        // Suspend clicks
        buttons.forEach(b => b.disabled = true);
        saveAndBroadcastState();

        // Delay for suspense (3 seconds now)
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
                correctSound.onended = () => {
                    currentIdx++;
                    isProcessing = false;
                    if (currentIdx < 15) {
                        loadQuestion();
                    } else {
                        endGame(true);
                    }
                    saveAndBroadcastState();
                };
                window.safePlayAudio ? window.safePlayAudio(correctSound) : correctSound.play().catch(e => {});
            } else {
                // Wrong
                window.safePlayAudio ? window.safePlayAudio(wrongSound) : wrongSound.play().catch(e => {});
                if (window.LMSBridge) {
                    window.LMSBridge.reportProgress(currentIdx, false, "0");
                }
                buttons[idx].classList.remove('selected');
                buttons[idx].classList.add('wrong');
                buttons[q.correct].classList.add('correct');
                statusMsg.textContent = 'Tiếc quá! Bạn đã trả lời sai.';
                saveAndBroadcastState();
                setTimeout(() => endGame(false), 2000);
            }
        }, 3000);
    }

    window.use5050 = function () {
        if (isGameOver || isProcessing) return;
        window.pauseTimer();
        window.safePlayAudio ? window.safePlayAudio(helpSound) : helpSound.play().catch(e => {});

        const q = questions[currentIdx];
        const buttons = optionsGrid.querySelectorAll('.option-btn');
        const helpBtn = document.getElementById('help5050');
        helpBtn.disabled = true;
        helpBtn.style.opacity = '0.3';
        helpBtn.style.cursor = 'not-allowed';

        let count = 5;
        const originalStatus = statusMsg.textContent;
        statusMsg.textContent = `Hệ thống đang tính toán (${count}s)...`;

        const interval = setInterval(() => {
            count--;
            if (count > 0) {
                statusMsg.textContent = `Hệ thống đang tính toán (${count}s)...`;
            } else {
                clearInterval(interval);
                let removed = 0;
                const indices = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
                for (let i = 0; i < indices.length && removed < 2; i++) {
                    if (indices[i] !== q.correct) {
                        buttons[indices[i]].style.visibility = 'hidden';
                        buttons[indices[i]].disabled = true;
                        removed++;
                    }
                }
                statusMsg.textContent = 'Hệ thống đã loại bỏ 2 phương án sai.';
                used5050 = true;
                saveAndBroadcastState();
                setTimeout(() => {
                    statusMsg.textContent = 'Tiếp tục suy nghĩ...';
                    window.resumeTimer();
                }, 1000);
            }
        }, 1000);
    };

    window.useAudience = function () {
        if (isGameOver || isProcessing) return;
        window.pauseTimer();
        window.safePlayAudio ? window.safePlayAudio(helpSound) : helpSound.play().catch(e => {});
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
        window.safePlayAudio ? window.safePlayAudio(helpSound) : helpSound.play().catch(e => {});
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
        document.getElementById('stopModal').style.display = 'flex';
    };

    window.confirmStop = function () {
        document.getElementById('stopModal').style.display = 'none';
        endGame(false, true);
        saveAndBroadcastState();
    };

    function endGame(isWin, stoppedManually = false, isTimeout = false) {
        isGameOver = true;
        clearInterval(timerInterval);
        bgMusic.pause(); // Pause music on game over
        resultModal.style.display = 'flex';

        // Generate vocab review table
        reviewList.innerHTML = `
            <table class="review-table">
                <thead>
                    <tr>
                        <th>Từ vựng</th>
                        <th>Phiên âm</th>
                        <th>Nghĩa</th>
                    </tr>
                </thead>
                <tbody id="reviewTableBody"></tbody>
            </table>
        `;
        const tableBody = document.getElementById('reviewTableBody');
        questions.forEach(v => {
            const match = v.vocab.match(/^(.*?)\s*\((.*?)\)\s*-\s*(.*)$/);
            let zh = v.vocab, pinyin = '', meaning = '';
            if (match) {
                zh = match[1];
                pinyin = match[2];
                meaning = match[3];
            } else {
                // Fallback for cases without pinyin parentheses
                const parts = v.vocab.split(' - ');
                zh = parts[0];
                meaning = parts[1] || '';
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${zh}</td>
                <td>${pinyin}</td>
                <td>${meaning}</td>
            `;
            tableBody.appendChild(tr);
        });

        if (isWin) {
            resultTitle.textContent = 'CHÚC MỪNG CHIẾN THẮNG!';
            resultTitle.style.color = 'var(--secondary)';
            resultMessage.textContent = `Bạn đã trở thành Triệu Phú HSK 2 với 500.000.000 VNĐ!`;
            window.safePlayAudio ? window.safePlayAudio(clapSound) : clapSound.play().catch(e => {});
        } else if (stoppedManually) {
            resultTitle.textContent = 'BẢO TOÀN THÀNH CÔNG';
            resultTitle.style.color = 'var(--secondary)';
            resultMessage.textContent = `Bạn đã dừng cuộc chơi. Số tiền bạn mang về là: ${currentScore} VNĐ.`;
            if (currentScore === "0") {
                window.safePlayAudio ? window.safePlayAudio(wrongSound) : wrongSound.play().catch(e => {});
            } else {
                window.safePlayAudio ? window.safePlayAudio(clapSound) : clapSound.play().catch(e => {});
            }
        } else {
            resultTitle.textContent = 'KẾT THÚC TRẬN ĐẤU';
            resultTitle.style.color = 'var(--error)';
            if (isTimeout) {
                resultMessage.textContent = `Hết thời gian! Bạn đã trắng tay. Số tiền thưởng: 0 VNĐ.`;
            } else {
                const finalPrize = (currentIdx >= 10) ? safeScore : (currentIdx >= 5 ? ladderValues[4] : "0");
                resultMessage.textContent = `Bạn đã trả lời sai tại câu số ${currentIdx + 1}. Số tiền thưởng: ${finalPrize} VNĐ.`;
            }
        }

        // Report Game Results to LMS (SCORM and postMessage)
        if (window.LMSBridge) {
            const finalPrize = isWin ? "500.000.000" : (stoppedManually ? currentScore : ((currentIdx >= 10) ? safeScore : (currentIdx >= 5 ? ladderValues[4] : "0")));
            window.LMSBridge.reportComplete(isWin, currentIdx, finalPrize, stoppedManually);
        }
        saveAndBroadcastState();
    }

    // Comprehensive Game Restart Function
    let isRestarting = false;
    window.restartGame = function (e) {
        if (e && e.preventDefault) e.preventDefault();
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

            // 2. Reset game state variables
            currentIdx = 0;
            isGameOver = false;
            isProcessing = false;
            used5050 = false;
            currentScore = "0";
            safeScore = "0";

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
        if (optionsGrid) {
            const btns = optionsGrid.querySelectorAll('.option-btn');
            btns.forEach((b, idx) => {
                if (b.style.visibility === 'hidden') hiddenOptions.push(idx);
            });
        }

        return {
            version: '2.0',
            timestamp: Date.now(),
            topicName: topicName,
            questions: questions,
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
            countdownPassed: (countdownOverlay && countdownOverlay.style.display === 'none'),
            statusMsg: statusMsg ? statusMsg.textContent : '',
            reviewListHTML: reviewList ? reviewList.innerHTML : '',
            resultModalOpen: (resultModal && resultModal.style.display === 'flex'),
            resultTitleText: resultTitle ? resultTitle.textContent : '',
            resultMessageText: resultMessage ? resultMessage.textContent : '',
            resultTitleColor: resultTitle ? resultTitle.style.color : ''
        };
    }

    function applyGameStateSnapshot(snapshot) {
        if (!snapshot || !snapshot.questions || snapshot.questions.length === 0) return false;

        questions = snapshot.questions;
        if (snapshot.topicName) {
            topicName = snapshot.topicName;
            if (lessonNumDisp) lessonNumDisp.textContent = topicName;
        }

        currentIdx = snapshot.currentIdx || 0;
        currentScore = snapshot.currentScore || "0";
        safeScore = snapshot.safeScore || "0";
        isGameOver = !!snapshot.isGameOver;
        isProcessing = false;

        initLadder();
        updateLadder();

        // Lifelines state
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

        // Countdown overlay
        if (snapshot.countdownPassed) {
            if (countdownOverlay) countdownOverlay.style.display = 'none';
        } else {
            startCountdown();
        }

        // Game status
        if (isGameOver) {
            clearInterval(timerInterval);
            if (bgMusic) bgMusic.pause();
            if (resultModal) {
                resultModal.style.display = 'flex';
                if (resultTitle) {
                    resultTitle.textContent = snapshot.resultTitleText || 'KẾT THÚC';
                    if (snapshot.resultTitleColor) resultTitle.style.color = snapshot.resultTitleColor;
                }
                if (resultMessage) resultMessage.textContent = snapshot.resultMessageText || '';
                if (reviewList) {
                    if (snapshot.reviewListHTML) {
                        reviewList.innerHTML = snapshot.reviewListHTML;
                    } else if (questions && questions.length > 0) {
                        reviewList.innerHTML = `
                            <table class="review-table">
                                <thead><tr><th>Từ vựng</th><th>Phiên âm</th><th>Nghĩa</th></tr></thead>
                                <tbody id="reviewTableBody"></tbody>
                            </table>
                        `;
                        const tableBody = document.getElementById('reviewTableBody');
                        questions.forEach(v => {
                            const match = v.vocab.match(/^(.*?)\s*\((.*?)\)\s*-\s*(.*)$/);
                            let zh = v.vocab, pinyin = '', meaning = '';
                            if (match) { zh = match[1]; pinyin = match[2]; meaning = match[3]; }
                            else { const parts = v.vocab.split(' - '); zh = parts[0]; meaning = parts[1] || ''; }
                            const tr = document.createElement('tr');
                            tr.innerHTML = `<td>${zh}</td><td>${pinyin}</td><td>${meaning}</td>`;
                            tableBody.appendChild(tr);
                        });
                    }
                }
            }
        } else {
            if (resultModal) resultModal.style.display = 'none';

            const q = questions[currentIdx];
            if (q) {
                questionNumNum.textContent = `Câu ${currentIdx + 1}/15`;
                questionText.textContent = q.q;
                optionsGrid.innerHTML = '';
                statusMsg.textContent = snapshot.statusMsg || 'Suy nghĩ và chọn đáp án...';

                const prefixes = ['A', 'B', 'C', 'D'];
                q.a.forEach((opt, idx) => {
                    const btn = document.createElement('button');
                    btn.className = 'option-btn';
                    btn.setAttribute('data-prefix', `${prefixes[idx]}. `);
                    btn.textContent = opt;
                    btn.onclick = () => handleChoice(idx);
                    if (snapshot.hiddenOptions && snapshot.hiddenOptions.includes(idx)) {
                        btn.style.visibility = 'hidden';
                        btn.disabled = true;
                    }
                    optionsGrid.appendChild(btn);
                });

                timeLeft = typeof snapshot.timeLeft === 'number' ? snapshot.timeLeft : 15;
                startTimer(true);
            }
        }
        return true;
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
        } catch (e) {}

        const msgType = isClosing ? 'HSK2_POPOUT_CLOSED' : 'HSK2_STATE_UPDATE';

        if (syncChannel) {
            try {
                syncChannel.postMessage({ type: msgType, state: snapshot });
            } catch (e) {}
        }

        if (isPopout && window.opener && !window.opener.closed) {
            try {
                window.opener.postMessage({ type: msgType, state: snapshot }, '*');
            } catch (e) {}
        } else if (childWin && !childWin.closed) {
            try {
                childWin.postMessage({ type: msgType, state: snapshot }, '*');
            } catch (e) {}
        }
    }

    function handleIncomingSync(data) {
        if (!data || !data.state) return;
        const { type, state } = data;

        if (!isPopout) {
            latestSyncedState = state;
            window.__HSK2_LATEST_STATE__ = state;

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

            if (type === 'HSK2_POPOUT_CLOSED' || state.isPopoutClosing) {
                window.resumeInLmsWindow();
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
            try {
                const parsed = JSON.parse(e.newValue);
                if (parsed) {
                    handleIncomingSync({ type: parsed.isPopoutClosing ? 'HSK2_POPOUT_CLOSED' : 'HSK2_STATE_UPDATE', state: parsed });
                }
            } catch (err) {}
        }
    });

    window.openGameInNewWindow = function (e) {
        if (e && e.preventDefault) e.preventDefault();

        if (isPopout) {
            window.closePopoutAndReturnToLMS();
            return;
        }

        window.pauseTimer();
        if (bgMusic && !bgMusic.paused) {
            bgMusic.pause();
        }

        const snapshot = getGameStateSnapshot();
        snapshot.isLmsWaiting = true;
        snapshot.syncSessionId = 'sync_' + Date.now();

        try {
            storage.setItem('hsk2_synced_state', JSON.stringify(snapshot));
            storage.setItem('hsk2_active_session', snapshot.syncSessionId);
        } catch (err) {}
        window.__HSK2_LATEST_STATE__ = snapshot;

        if (syncChannel) {
            try {
                syncChannel.postMessage({ type: 'HSK2_SYNC_INIT', state: snapshot });
            } catch (e) {}
        }

        const overlay = document.getElementById('popoutActiveOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
        }

        const targetUrl = new URL(window.location.href);
        targetUrl.searchParams.set('topic', topicName);
        targetUrl.searchParams.set('popout', '1');
        targetUrl.searchParams.set('session', snapshot.syncSessionId);

        const width = Math.min(1240, window.screen.availWidth - 40);
        const height = Math.min(760, window.screen.availHeight - 60);
        const left = Math.max(0, Math.floor((window.screen.availWidth - width) / 2));
        const top = Math.max(0, Math.floor((window.screen.availHeight - height) / 2));
        const windowFeatures = `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no,status=no,toolbar=no,menubar=no,location=no`;

        try {
            childWin = window.open(targetUrl.toString(), 'HSK2_Standalone_Game', windowFeatures);
        } catch (err) {
            console.warn("window.open failed:", err);
        }

        if (!childWin || childWin.closed || typeof childWin.closed === 'undefined') {
            if (overlay) overlay.style.display = 'none';
            window.resumeTimer();
            if (window.LMSAdapter && window.LMSAdapter.showToast) {
                window.LMSAdapter.showToast("⚠️ Vui lòng cho phép popup trên trình duyệt của bạn!");
            }
            return;
        }

        if (window.LMSAdapter && window.LMSAdapter.showToast) {
            window.LMSAdapter.showToast("🚀 Đang chơi tại cửa sổ mới! Màn hình LMS tạm dừng và chờ đồng bộ.");
        }

        clearInterval(popoutPollInterval);
        popoutPollInterval = setInterval(() => {
            if (!childWin || childWin.closed) {
                clearInterval(popoutPollInterval);
                popoutPollInterval = null;
                window.resumeInLmsWindow();
            }
        }, 350);
    };

    window.resumeInLmsWindow = function () {
        clearInterval(popoutPollInterval);
        popoutPollInterval = null;

        if (childWin && !childWin.closed) {
            try { childWin.close(); } catch (e) {}
        }
        childWin = null;

        const overlay = document.getElementById('popoutActiveOverlay');
        if (overlay) {
            overlay.style.display = 'none';
        }

        let stateToApply = latestSyncedState;
        if (!stateToApply) {
            try {
                const raw = storage.getItem('hsk2_synced_state');
                if (raw) stateToApply = JSON.parse(raw);
            } catch (e) {}
        }

        if (stateToApply) {
            applyGameStateSnapshot(stateToApply);
            if (window.LMSAdapter && window.LMSAdapter.showToast) {
                if (stateToApply.isGameOver) {
                    window.LMSAdapter.showToast("🏆 Đã đồng bộ kết quả từ cửa sổ mới!");
                } else {
                    window.LMSAdapter.showToast(`🎮 Đã đồng bộ tiến trình! Tiếp tục câu ${stateToApply.currentIdx + 1}/15`);
                }
            }
        } else {
            window.resumeTimer();
        }

        if (!isMuted && !isGameOver) {
            window.safePlayAudio ? window.safePlayAudio(bgMusic) : bgMusic.play().catch(e => {});
        }
    };

    window.closePopoutAndReturnToLMS = function () {
        saveAndBroadcastState(null, true);
        if (window.opener && !window.opener.closed) {
            try {
                window.opener.focus();
            } catch (e) {}
        }
        window.close();
    };

    if (isPopout) {
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
                window.closePopoutAndReturnToLMS();
            };
        }

        const handleUnload = () => {
            saveAndBroadcastState(null, true);
        };
        window.addEventListener('beforeunload', handleUnload);
        window.addEventListener('pagehide', handleUnload);
    }

    initLadder();
    if (initialSyncedState) {
        applyGameStateSnapshot(initialSyncedState);
    } else {
        startCountdown();
    }
});
