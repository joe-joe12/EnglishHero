const firebaseConfig = {
  apiKey: "AIzaSyA4bbUoXHi29YAjCgYrnuYRhZJ8_JEtalc",
  authDomain: "englishhero-d58c6.firebaseapp.com",
  projectId: "englishhero-d58c6",
  storageBucket: "englishhero-d58c6.firebasestorage.app",
  messagingSenderId: "437927020009",
  appId: "1:437927020009:web:30e18c99cfeec8ef4ef778",
  measurementId: "G-TZTCS02SK6"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

let allWordsList = [];

// DOM 元素
const mainTabFill = document.getElementById("main-tab-fill");
const mainTabMatch = document.getElementById("main-tab-match");
const subModeBox = document.getElementById("sub-mode-box");
const subTabEnCh = document.getElementById("sub-tab-en-ch");
const subTabChEn = document.getElementById("sub-tab-ch-en");
const quizFolderSelect = document.getElementById("quiz-folder-select");

const modeFill = document.getElementById("mode-fill");
const modeMatch = document.getElementById("mode-match");

// 填空元素
const fillQuestion = document.getElementById("fill-question");
const fillAnswer = document.getElementById("fill-answer");
const btnCheckFill = document.getElementById("btn-check-fill");
const fillFeedback = document.getElementById("fill-feedback");

// 配對元素
const matchQuestion = document.getElementById("match-question");
const optionsContainer = document.getElementById("options-container");
const matchFeedback = document.getElementById("match-feedback");

// 測驗狀態控制
let quizQueue = [];     // 當前一輪要考的單字清單（已洗牌）
let wrongList = [];     // 錯題記錄
let currentIndex = 0;   // 目前考到第幾題
let currentWord = null; // 當前題目
let isAnswerLocked = false;

auth.onAuthStateChanged((user) => {
  if (user) {
    fetchAllUserData(user.uid);
  } else {
    window.location.replace("login.html?v=2026");
  }
});

function fetchAllUserData(uid) {
  db.collection("users").doc(uid).collection("words").get()
    .then((snapshot) => {
      allWordsList = [];
      const foldersSet = new Set();

      snapshot.forEach(doc => {
        const data = doc.data();
        allWordsList.push(data);
        if (data.folder) foldersSet.add(data.folder);
      });

      quizFolderSelect.innerHTML = `<option value="ALL">全部資料夾 (綜合測驗)</option>`;
      foldersSet.forEach(folderName => {
        const opt = document.createElement("option");
        opt.value = folderName;
        opt.textContent = folderName;
        quizFolderSelect.appendChild(opt);
      });

      if (allWordsList.length === 0) {
        fillQuestion.textContent = "單字庫為空，請先至「新增單字」建立！";
        matchQuestion.textContent = "單字庫為空，請先至「新增單字」建立！";
        return;
      }

      initCurrentMode();
    })
    .catch((err) => {
      fillQuestion.textContent = "資料載入失敗：" + err.message;
    });
}

function getFilteredWords() {
  const selectedFolder = quizFolderSelect.value;
  if (selectedFolder === "ALL") return allWordsList;
  return allWordsList.filter(item => item.folder === selectedFolder);
}

quizFolderSelect.addEventListener("change", () => {
  initCurrentMode();
});

// 大模式切換
mainTabFill.addEventListener("click", () => {
  mainTabFill.classList.add("active");
  mainTabMatch.classList.remove("active");
  subModeBox.classList.add("hidden");
  modeFill.classList.remove("hidden");
  modeMatch.classList.add("hidden");
  initCurrentMode();
});

mainTabMatch.addEventListener("click", () => {
  mainTabMatch.classList.add("active");
  mainTabFill.classList.remove("active");
  subModeBox.classList.remove("hidden");
  modeMatch.classList.remove("hidden");
  modeFill.classList.add("hidden");
  initCurrentMode();
});

// 配對子模式切換
subTabEnCh.addEventListener("click", () => {
  subTabEnCh.classList.add("active");
  subTabChEn.classList.remove("active");
  initCurrentMode();
});

subTabChEn.addEventListener("click", () => {
  subTabChEn.classList.add("active");
  subTabEnCh.classList.remove("active");
  initCurrentMode();
});

function initCurrentMode() {
  const currentList = getFilteredWords();
  // 複製一份並隨機洗牌，確保每個單字都考到且順序打散
  quizQueue = [...currentList].sort(() => Math.random() - 0.5);
  wrongList = [];
  currentIndex = 0;

  if (mainTabFill.classList.contains("active")) {
    startFillGame();
  } else {
    startMatchGame();
  }
}

// ==================== 模式一：填空測驗邏輯 ====================
function startFillGame() {
  if (currentIndex >= quizQueue.length) {
    showQuizResult("填空測驗");
    return;
  }

  fillAnswer.value = "";
  fillFeedback.textContent = `進度: ${currentIndex + 1} / ${quizQueue.length}`;
  fillFeedback.style.color = "#475569";

  currentWord = quizQueue[currentIndex];
  fillQuestion.textContent = currentWord.ch;
  fillAnswer.disabled = false;
  btnCheckFill.disabled = false;
  fillAnswer.focus();
}

btnCheckFill.addEventListener("click", checkFillAnswer);
fillAnswer.addEventListener("keypress", (e) => {
  if (e.key === "Enter") checkFillAnswer();
});

function checkFillAnswer() {
  if (!currentWord || fillAnswer.disabled) return;
  const userInput = fillAnswer.value.trim().toLowerCase();
  if (!userInput) return;

  fillAnswer.disabled = true;
  btnCheckFill.disabled = true;

  if (userInput === currentWord.en.toLowerCase()) {
    fillFeedback.textContent = "✅ 答對了！";
    fillFeedback.style.color = "#16a34a";
    currentIndex++;
    setTimeout(startFillGame, 800);
  } else {
    // 答錯：記錄錯題，並直接給出正確答案
    wrongList.push({
      en: currentWord.en,
      ch: currentWord.ch,
      userAnswer: userInput,
      mode: "填空"
    });

    fillFeedback.innerHTML = `❌ 答錯囉！正確答案是：<strong style="color: #2563eb;">${currentWord.en}</strong>`;
    fillFeedback.style.color = "#dc2626";
    
    currentIndex++;
    setTimeout(startFillGame, 2200); // 停留稍久一點讓使用者看答案
  }
}

// ==================== 模式二：選擇配對測驗邏輯 ====================
function startMatchGame() {
  const currentList = getFilteredWords();

  if (currentIndex >= quizQueue.length) {
    showQuizResult("選擇測驗");
    return;
  }

  isAnswerLocked = false;
  matchFeedback.textContent = `進度: ${currentIndex + 1} / ${quizQueue.length}`;
  matchFeedback.style.color = "#475569";
  optionsContainer.innerHTML = "";

  if (currentList.length < 3) {
    matchQuestion.textContent = "⚠️ 該資料夾單字少於 3 個，請至少新增 3 個單字才能進行選擇測驗！";
    return;
  }

  const isEnToCh = subTabEnCh.classList.contains("active");
  currentWord = quizQueue[currentIndex];

  if (isEnToCh) {
    matchQuestion.textContent = `英文：${currentWord.en}`;
  } else {
    matchQuestion.textContent = `中文：${currentWord.ch}`;
  }

  let wrongOptions = currentList.filter(item => item.en !== currentWord.en);
  wrongOptions.sort(() => Math.random() - 0.5);
  const selectedWrong = wrongOptions.slice(0, 2);

  let choices = [
    { text: isEnToCh ? currentWord.ch : currentWord.en, isCorrect: true },
    { text: isEnToCh ? selectedWrong[0].ch : selectedWrong[0].en, isCorrect: false },
    { text: isEnToCh ? selectedWrong[1].ch : selectedWrong[1].en, isCorrect: false }
  ];

  choices.sort(() => Math.random() - 0.5);

  choices.forEach(choice => {
    const btn = document.createElement("button");
    btn.classList.add("option-btn");
    btn.textContent = choice.text;
    btn.addEventListener("click", () => handleMatchClick(btn, choice.isCorrect));
    optionsContainer.appendChild(btn);
  });
}

function handleMatchClick(clickedBtn, isCorrect) {
  if (isAnswerLocked) return;
  isAnswerLocked = true;

  const allButtons = optionsContainer.querySelectorAll(".option-btn");
  const isEnToCh = subTabEnCh.classList.contains("active");
  const targetText = isEnToCh ? currentWord.ch : currentWord.en;

  if (isCorrect) {
    clickedBtn.classList.add("correct");
    matchFeedback.textContent = "✅ 答對了！";
    matchFeedback.style.color = "#16a34a";
    currentIndex++;
    setTimeout(startMatchGame, 800);
  } else {
    clickedBtn.classList.add("wrong");
    
    wrongList.push({
      en: currentWord.en,
      ch: currentWord.ch,
      userAnswer: "選擇錯誤選項",
      mode: "選擇"
    });

    matchFeedback.textContent = "❌ 答錯囉！";
    matchFeedback.style.color = "#dc2626";

    allButtons.forEach(btn => {
      if (btn.textContent === targetText) {
        btn.classList.add("correct");
      }
    });

    currentIndex++;
    setTimeout(startMatchGame, 1500);
  }
}

// ==================== 結算畫面 ====================
function showQuizResult(modeName) {
  const total = quizQueue.length;
  const correctCount = total - wrongList.length;
  const score = Math.round((correctCount / total) * 100);

  let resultHtml = `
    <div style="text-align: center; padding: 20px;">
      <h2 style="color: #1e293b; margin-bottom: 10px;">🎉 ${modeName} 測驗結束！</h2>
      <p style="font-size: 18px; color: #475569; margin-bottom: 20px;">
        總題數：<b>${total}</b> | 答對：<span style="color: #16a34a; font-weight: bold;">${correctCount}</span> | 答錯：<span style="color: #dc2626; font-weight: bold;">${wrongList.length}</span> (得分: ${score}分)
      </p>
  `;

  if (wrongList.length > 0) {
    resultHtml += `
      <div style="text-align: left; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 20px; max-height: 250px; overflow-y: auto;">
        <h4 style="color: #b91c1c; margin-top: 0; margin-bottom: 10px;">📋 錯題訂正清單：</h4>
    `;
    wrongList.forEach((item, idx) => {
      resultHtml += `
        <div style="margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px dashed #fca5a5; font-size: 14px; color: #334155;">
          <b>${idx + 1}. 中文：</b>${item.ch} <br>
          👉 正確英文：<span style="color: #2563eb; font-weight: bold;">${item.en}</span>
        </div>
      `;
    });
    resultHtml += `</div>`;
  } else {
    resultHtml += `
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin-bottom: 20px; color: #166534; font-weight: bold;">
        🌟 太神啦！全部答對，沒有錯題！
      </div>
    `;
  }

  resultHtml += `
      <button onclick="initCurrentMode()" style="padding: 12px 24px; background: #4f46e5; color: #fff; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 16px;">
        🔄 重新測驗一輪
      </button>
    </div>
  `;

  // 根據當前是大模式填空還是配對，替換對應容器的顯示
  if (mainTabFill.classList.contains("active")) {
    modeFill.innerHTML = resultHtml;
  } else {
    modeMatch.innerHTML = resultHtml;
  }
}
