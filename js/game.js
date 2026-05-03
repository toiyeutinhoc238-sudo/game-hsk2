document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const topicParam = params.get('topic');
    const allTopicKeys = Object.keys(hsk2Vocab);
    const topics = allTopicKeys.filter(t => hsk2Vocab[t].length >= 9);
    let topicName = topicParam;

    if (topicParam && topicParam.startsWith('chude')) {
        const idx = parseInt(topicParam.replace('chude', '')) - 1;
        topicName = topics[idx];
    }

    const vocabPool = hsk2Vocab[topicName];
    if (!vocabPool || vocabPool.length < 9) {
        alert('Chủ đề này không đủ số lượng từ vựng để tổ chức trò chơi (tối thiểu 9 từ)!');
        window.location.href = 'index.html';
        return;
    }

    // Generate 15 random questions
    let questions = [];
    const allMeanings = [];
    const allZh = [];
    Object.keys(hsk2Vocab).forEach(topic => {
        const pool = hsk2Vocab[topic];
        if (pool.length >= 9) {
            pool.forEach(v => {
                allMeanings.push(v.meaning);
                allZh.push(v.zh);
            });
        }
    });

    const shuffledVocab = [...vocabPool].sort(() => Math.random() - 0.5);
    for (let i = 0; i < 15; i++) {
        const wordObj = shuffledVocab[i % shuffledVocab.length];
        const isZhToVi = Math.random() > 0.5;
        let qText, correctAns, options;

        if (isZhToVi) {
            qText = `Từ "${wordObj.zh}" có nghĩa là gì?`;
            correctAns = wordObj.meaning;
            const distractors = [];
            while (distractors.length < 3) {
                const rand = allMeanings[Math.floor(Math.random() * allMeanings.length)];
                if (rand !== correctAns && !distractors.includes(rand)) distractors.push(rand);
            }
            options = [correctAns, ...distractors].sort(() => Math.random() - 0.5);
        } else {
            qText = `Từ nào sau đây có nghĩa là "${wordObj.meaning}"?`;
            correctAns = wordObj.zh;
            const distractors = [];
            while (distractors.length < 3) {
                const rand = allZh[Math.floor(Math.random() * allZh.length)];
                if (rand !== correctAns && !distractors.includes(rand)) distractors.push(rand);
            }
            options = [correctAns, ...distractors].sort(() => Math.random() - 0.5);
        }

        const pinyinDisplay = wordObj.pinyin ? ` (${wordObj.pinyin})` : '';
        questions.push({
            q: qText,
            a: options,
            correct: options.indexOf(correctAns),
            vocab: `${wordObj.zh}${pinyinDisplay} - ${wordObj.meaning}`
        });
    }

    // Audio Elements
    const correctSound = new Audio('traloidung.mp3');
    const wrongSound = new Audio('traloisai.mp3');
    const bgMusic = new Audio('choigame.mp3');
    const helpSound = new Audio('chonquyentrogiup.mp3');
    bgMusic.loop = true;

    // Music State Management
    window.toggleMusic = function () {
        const btn = document.getElementById('musicToggle');
        if (bgMusic.paused) {
            bgMusic.play();
            btn.textContent = '🔊';
            localStorage.setItem('musicEnabled', 'true');
        } else {
            bgMusic.pause();
            btn.textContent = '🔇';
            localStorage.setItem('musicEnabled', 'false');
        }
    };

    // Auto-play music if enabled
    if (localStorage.getItem('musicEnabled') !== 'false') {
        bgMusic.play().catch(e => console.log("Autoplay blocked:", e));
    } else {
        const musicBtn = document.getElementById('musicToggle');
        if (musicBtn) musicBtn.textContent = '🔇';
    }

    // Money Ladder Values
    const ladderValues = [
        "1.000.000", "2.000.000", "3.000.000", "4.000.000", "5.000.000",
        "6.000.000", "8.000.000", "10.000.000", "14.000.000", "22.000.000",
        "30.000.000", "60.000.000", "120.000.000", "250.000.000", "500.000.000"
    ];

    // Game State
    let currentIdx = 0;
    let isGameOver = false;
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
        moneyLadder.innerHTML = '';
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
        }

        timerInterval = setInterval(() => {
            timeLeft -= 0.1;
            const percentage = (timeLeft / 15) * 100;
            timerBar.style.width = `${percentage}%`;

            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                statusMsg.textContent = 'Hết giờ rồi!';
                setTimeout(() => endGame(false), 1000);
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

    function startCountdown() {
        let count = 3;
        countdownOverlay.style.display = 'flex';
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
    }

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
    }

    function handleChoice(idx) {
        if (isGameOver) return;
        clearInterval(timerInterval); // Stop timer on choice

        const q = questions[currentIdx];
        const buttons = optionsGrid.querySelectorAll('.option-btn');

        // Highlight selection
        buttons[idx].classList.add('selected');
        statusMsg.textContent = 'Đang kiểm tra...';

        // Suspend clicks
        buttons.forEach(b => b.disabled = true);

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

                statusMsg.textContent = 'Chính xác! Đang chuẩn bị câu hỏi tiếp theo...';
                correctSound.onended = () => {
                    currentIdx++;
                    if (currentIdx < 15) {
                        loadQuestion();
                    } else {
                        endGame(true);
                    }
                };
                correctSound.play();
            } else {
                // Wrong
                wrongSound.play();
                buttons[idx].classList.remove('selected');
                buttons[idx].classList.add('wrong');
                buttons[q.correct].classList.add('correct');
                statusMsg.textContent = 'Tiếc quá! Bạn đã trả lời sai.';
                setTimeout(() => endGame(false), 2000);
            }
        }, 3000);
    }

    window.use5050 = function () {
        if (isGameOver) return;
        window.pauseTimer();
        helpSound.play();

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
                setTimeout(() => {
                    statusMsg.textContent = 'Tiếp tục suy nghĩ...';
                    window.resumeTimer();
                }, 1000);
            }
        }, 1000);
    };

    window.useAudience = function () {
        if (isGameOver) return;
        window.pauseTimer();
        helpSound.play();
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
        if (isGameOver) return;
        window.pauseTimer();
        helpSound.play();
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
                const prefixes = ['A', 'B', 'C', 'D'];
                answer.innerHTML = `<strong>Chuyên gia tư vấn:</strong><br><br>Sau khi cân nhắc kỹ, tôi khá chắc chắn đáp án đúng là <strong>${prefixes[q.correct]}</strong>: "${q.a[q.correct]}".`;
            }
        }, stepExpert);
    };

    window.stopGamePrompt = function () {
        if (isGameOver) return;
        document.getElementById('stopModal').style.display = 'flex';
    };

    window.confirmStop = function () {
        document.getElementById('stopModal').style.display = 'none';
        endGame(false, true);
    };

    function endGame(isWin, stoppedManually = false) {
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
        } else if (stoppedManually) {
            resultTitle.textContent = 'BẢO TOÀN THÀNH CÔNG';
            resultTitle.style.color = 'var(--secondary)';
            resultMessage.textContent = `Bạn đã dừng cuộc chơi. Số tiền bạn mang về là: ${currentScore} VNĐ.`;
        } else {
            resultTitle.textContent = 'KẾT THÚC TRẬN ĐẤU';
            resultTitle.style.color = 'var(--error)';
            const finalPrize = (currentIdx >= 10) ? safeScore : (currentIdx >= 5 ? ladderValues[4] : "0");
            resultMessage.textContent = `Bạn đã dừng lại tại câu số ${currentIdx + 1}. Số tiền thưởng: ${finalPrize} VNĐ.`;
        }
    }

    initLadder();
    startCountdown();
});
