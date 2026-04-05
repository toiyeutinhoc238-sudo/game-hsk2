document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const lessonId = parseInt(params.get('lesson')) || 1;
    const questions = hsk2Questions[lessonId];

    if (!questions) {
        alert('Lesson not found!');
        window.location.href = 'index.html';
        return;
    }

    // Audio Elements
    const correctSound = new Audio('traloidung.mp3');
    const wrongSound = new Audio('traloisai.mp3');

    // Money Ladder Values
    const ladderValues = [
        "100.000", "200.000", "500.000", "1.000.000", "2.000.000",
        "5.000.000", "10.000.000", "25.000.000", "50.000.000", "100.000.000"
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

    lessonNumDisp.textContent = lessonId;

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
        if (currentIdx < 10) {
            document.getElementById(`ladder-${currentIdx}`).classList.add('active');
        }
    }

    function startTimer() {
        clearInterval(timerInterval);
        timeLeft = 15;
        timerBar.style.width = '100%';
        
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
        if (currentIdx >= 10) {
            endGame(true);
            return;
        }

        updateLadder();
        const q = questions[currentIdx];
        questionNumNum.textContent = `Câu ${currentIdx + 1}/10`;
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
                correctSound.play();
                buttons[idx].classList.remove('selected');
                buttons[idx].classList.add('correct');
                currentScore = ladderValues[currentIdx];
                
                // Set safe haven
                if (currentIdx === 4) safeScore = ladderValues[4];
                if (currentIdx === 9) safeScore = ladderValues[9];

                statusMsg.textContent = 'Chính xác! Cố lên nào.';
                setTimeout(() => {
                    currentIdx++;
                    if (currentIdx < 10) {
                        loadQuestion();
                    } else {
                        endGame(true);
                    }
                }, 1500);
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

    window.use5050 = function() {
        if (used5050 || isGameOver) return;
        used5050 = true;
        help5050Btn.disabled = true;
        help5050Btn.style.opacity = '0.3';
        
        const q = questions[currentIdx];
        const buttons = optionsGrid.querySelectorAll('.option-btn');
        let removed = 0;
        let indices = [0, 1, 2, 3].filter(i => i !== q.correct);
        
        // Shuffle and remove 2
        indices.sort(() => Math.random() - 0.5);
        for(let i=0; i<2; i++) {
            buttons[indices[i]].style.visibility = 'hidden';
            buttons[indices[i]].disabled = true;
        }
        statusMsg.textContent = 'Hệ thống đã loại bỏ 2 phương án sai.';
    };

    window.stopGamePrompt = function() {
        if (isGameOver) return;
        document.getElementById('stopModal').style.display = 'flex';
    };

    window.confirmStop = function() {
        document.getElementById('stopModal').style.display = 'none';
        endGame(false, true);
    };

    function endGame(isWin, stoppedManually = false) {
        isGameOver = true;
        clearInterval(timerInterval);
        resultModal.style.display = 'flex';
        
        // Generate vocab review
        reviewList.innerHTML = '';
        questions.forEach(v => {
            const item = document.createElement('div');
            item.className = 'review-item';
            item.textContent = v.vocab;
            reviewList.appendChild(item);
        });

        if (isWin) {
            resultTitle.textContent = 'CHÚC MỪNG CHIẾN THẮNG!';
            resultTitle.style.color = 'var(--secondary)';
            resultMessage.textContent = `Bạn đã trở thành Triệu Phú HSK 2 với 100.000.000 VNĐ!`;
        } else if (stoppedManually) {
            resultTitle.textContent = 'BẢO TOÀN THÀNH CÔNG';
            resultTitle.style.color = 'var(--secondary)';
            resultMessage.textContent = `Bạn đã dừng cuộc chơi. Số tiền bạn mang về là: ${currentScore} VNĐ.`;
        } else {
            resultTitle.textContent = 'KẾT THÚC TRẬN ĐẤU';
            resultTitle.style.color = 'var(--error)';
            const finalPrize = (currentIdx >= 5) ? safeScore : "0";
            resultMessage.textContent = `Bạn đã dừng lại tại câu số ${currentIdx + 1}. Số tiền thưởng: ${finalPrize} VNĐ.`;
        }
    }

    initLadder();
    startCountdown();
});
