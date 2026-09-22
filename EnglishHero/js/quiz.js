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

// 🌟 強制第二層子資料夾選單在主選單下方獨立一行、寬度 100% 佔滿
let subFolderSelectContainer = document.getElementById("sub-folder-select-container");
if (!subFolderSelectContainer) {
  subFolderSelectContainer = document.createElement("div");
  subFolderSelectContainer.id = "sub-folder-select-container";
  subFolderSelectContainer.style.width = "100%";
  subFolderSelectContainer.style.marginTop = "12px";
  
  const parentCard = quizFolderSelect.closest("div") || quizFolderSelect.parentNode;
  parentCard.appendChild(subFolderSelectContainer);
}

const modeFill = document.getElementById("mode-fill");
const modeMatch = document.getElementById("mode-match");

const matchQuestion = document.getElementById("match-question");
const optionsContainer = document.getElementById("options-container");
const matchFeedback = document.getElementById("match-feedback");

// 測驗狀態控制
let quizQueue = [];     
let wrongList = [];     
let currentIndex = 0;   
let currentWord = null; 
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
      const parentFoldersSet = new Set();

      snapshot.forEach(doc => {
        const data = doc.data();
        allWordsList.push(data);
        if (data.folder) {
          let mainName = data.folder;
          if (data.folder.includes("/")) {
            mainName = data.folder.split("/")[0];
          } else if (data.folder.includes("_")) {
            mainName = data.folder.split("_")[0];
          } else if (data.folder.includes(" ")) {
            mainName = data.folder.split(" ")[0];
          }
          parentFoldersSet.add(mainName);
        }
      });

      quizFolderSelect.innerHTML = `<option value="ALL">全部資料夾 (綜合測驗)</option>`;
      Array.from(parentFoldersSet).sort().forEach(folderName => {
        const opt = document.createElement("option");
        opt.value = folderName;
        opt.textContent = folderName;
        quizFolderSelect.appendChild(opt);
      });

      if (allWordsList.length === 0) {
        modeFill.innerHTML = `<p style="text-align:center; padding:20px; color:#666;">單字庫為空，請先至「新增單字」建立！</p>`;
        matchQuestion.textContent = "單字庫為空，請先至「新增單字」建立！";
        return;
      }

      updateSubFolderDropdown();
      initCurrentMode();
    })
    .catch((err) => {
      modeFill.innerHTML = `<p style="text-align:center; padding:20px; color:red;">資料載入失敗：${err.message}</p>`;
    });
}

// 🌟 更新第二層子資料夾選單，確保選單寬度百分百貼齊主選單
function updateSubFolderDropdown() {
  const selectedMain = quizFolderSelect.value;
  subFolderSelectContainer.innerHTML = "";

  if (selectedMain === "ALL") return;

  const subFolders = Array.from(new Set(allWordsList.map(w => w.folder)))
    .filter(f => f !== selectedMain && f.startsWith(selectedMain));

  if (subFolders.length > 0) {
    subFolders.sort();
    let selectHtml = `
      <select id="quiz-sub-folder-select" style="padding: 10px 12px; font-size: 14px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; width: 100%; box-sizing: border-box;">
        <option value="ALL_SUB">-- 選擇子資料夾 (全部) --</option>
    `;
    subFolders.forEach(subFull => {
      selectHtml += `<option value="${subFull}">${subFull}</option>`;
    });
    selectHtml += `</select>`;
    
    subFolderSelectContainer.innerHTML = selectHtml;

    const subSelectEl = document.getElementById("quiz-sub-folder-select");
    subSelectEl.addEventListener("change", () => {
      initCurrentMode();
    });
  }
}

function getFilteredWords() {
  const selectedMain = quizFolderSelect.value;
  if (selectedMain === "ALL") return allWordsList;

  const subSelectEl = document.getElementById("quiz-sub-folder-select");
  const selectedSub = subSelectEl ? subSelectEl.value : "ALL_SUB";

  if (!selectedSub || selectedSub === "ALL_SUB") {
    return allWordsList.filter(item => item.folder === selectedMain || item.folder.startsWith(selectedMain));
  } else {
    return allWordsList.filter(item => item.folder === selectedSub);
  }
}

quizFolderSelect.addEventListener("change", () => {
  updateSubFolderDropdown();
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

window.initCurrentMode = function() {
  const currentList = getFilteredWords();
  
  if (currentList.length === 0) {
    if (mainTabFill.classList.contains("active")) {
      modeFill.innerHTML = `<p style="text-align:center; padding:20px; color:#666;">此資料夾中沒有單字！</p>`;
    } else {
      matchQuestion.textContent = "此資料夾中沒有單字！";
    }
    return;
  }

  quizQueue = [...currentList].sort(() => Math.random() - 0.5);
  wrongList = [];
  currentIndex = 0;

  if (mainTabFill.classList.contains("active")) {
    startFillGame();
  } else {
    startMatchGame();
  }
};

// ==================== 模式一：填空測驗邏輯 ====================
function startFillGame() {
  if (currentIndex >= quizQueue.length) {
    showQuizResult("填空測驗");
    return;
  }

  currentWord = quizQueue[currentIndex];

  modeFill.innerHTML = `
    <div style="text-align: center; padding: 10px;">
      <div id="fill-feedback" style="font-size: 14px; font-weight: bold; color: #475569; margin-bottom: 12px;">
        進度: ${currentIndex + 1} / ${quizQueue.length}
      </div>
      <div id="fill-question" style="font-size: 28px; font-weight: bold; color: #1e293b; margin-bottom: 20px;">
        ${currentWord.ch}
      </div>
      <div style="margin-bottom: 16px;">
        <input type="text" id="fill-answer" placeholder="請輸入英文單字..." autocomplete="off" style="width: 80%; max-width: 350px; padding: 12px; font-size: 16px; border: 2px solid #cbd5e1; border-radius: 8px; outline: none; text-align: center;">
      </div>
      <div>
        <button id="btn-check-fill" style="padding: 10px 24px; background: #3b82f6; color: #fff; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 16px; box-shadow: 0 4px 10px rgba(59,130,246,0.25);">
          送出答案
        </button>
      </div>
    </div>
  `;

  const fillAnswerInput = document.getElementById("fill-answer");
  const btnCheck = document.getElementById("btn-check-fill");

  fillAnswerInput.focus();

  btnCheck.addEventListener("click", checkFillAnswer);
  fillAnswerInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") checkFillAnswer();
  });
}

function checkFillAnswer() {
  const fillAnswerInput = document.getElementById("fill-answer");
  const btnCheck = document.getElementById("btn-check-fill");
  const fillFeedback = document.getElementById("fill-feedback");

  if (!fillAnswerInput || fillAnswerInput.disabled) return;
  
  const userInput = fillAnswerInput.value.trim().toLowerCase();
  if (!userInput) return;

  fillAnswerInput.disabled = true;
  btnCheck.disabled = true;

  if (userInput === currentWord.en.toLowerCase()) {
    fillFeedback.textContent = "✅ 答對了！";
    fillFeedback.style.color = "#16a34a";
    currentIndex++;
    setTimeout(startFillGame, 800);
  } else {
    wrongList.push({
      en: currentWord.en,
      ch: currentWord.ch,
      userAnswer: userInput,
      mode: "填空"
    });

    fillFeedback.innerHTML = `❌ 答錯囉！正確答案是：<strong style="color: #2563eb; font-size: 18px;">${currentWord.en}</strong>`;
    fillFeedback.style.color = "#dc2626";
    
    currentIndex++;
    setTimeout(startFillGame, 2500);
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
      <button id="btn-restart-quiz" style="padding: 12px 24px; background: #4f46e5; color: #fff; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 16px; box-shadow: 0 4px 10px rgba(79,70,229,0.25);">
        🔄 重新測驗一輪
      </button>
    </div>
  `;

  if (mainTabFill.classList.contains("active")) {
    modeFill.innerHTML = resultHtml;
  } else {
    modeMatch.innerHTML = resultHtml;
  }

  const restartBtn = document.getElementById("btn-restart-quiz");
  if (restartBtn) {
    restartBtn.addEventListener("click", () => {
      initCurrentMode();
    });
  }
}
