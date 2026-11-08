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

const PLACEHOLDER = "___placeholder___";

// HTML 跳脫（避免單字內容破壞版面 / XSS）
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));

// Fisher–Yates 洗牌
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let allWordsList = [];

// DOM 元素
const mainTabFill = document.getElementById("main-tab-fill");
const mainTabMatch = document.getElementById("main-tab-match");
const subModeBox = document.getElementById("sub-mode-box");
const subTabEnCh = document.getElementById("sub-tab-en-ch");
const subTabChEn = document.getElementById("sub-tab-ch-en");
const quizFolderSelect = document.getElementById("quiz-folder-select");

const subFolderContainer = document.getElementById("sub-folder-select-container");
const subFolderSelect = document.getElementById("quiz-sub-folder-select");

const modeFill = document.getElementById("mode-fill");
const modeMatch = document.getElementById("mode-match");

const matchQuestion = document.getElementById("match-question");
const optionsContainer = document.getElementById("options-container");
const matchFeedback = document.getElementById("match-feedback");

// 結算畫面使用獨立容器，避免蓋掉選擇配對的 DOM 元素
const resultBox = document.createElement("div");
resultBox.id = "quiz-result";
resultBox.classList.add("hidden");
document.querySelector(".study-container").appendChild(resultBox);

// 測驗狀態控制
let quizPool = [];
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
        if (!data.en || data.en === PLACEHOLDER) return; // 略過佔位單字
        allWordsList.push({
          en: data.en,
          pos: data.pos || "",
          ch: data.ch || "",
          folder: data.folder || "未分類"
        });
        // 階層只由 "/" 決定（與背單字頁一致）
        parentFoldersSet.add((data.folder || "未分類").split("/")[0]);
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
      modeFill.innerHTML = `<p style="text-align:center; padding:20px; color:red;">資料載入失敗：${esc(err.message)}</p>`;
    });
}

function inFolder(folder, name) {
  return folder === name || folder.startsWith(name + "/");
}

function updateSubFolderDropdown() {
  const selectedMain = quizFolderSelect.value;
  subFolderSelect.innerHTML = `<option value="ALL_SUB">-- 選擇子資料夾 (全部) --</option>`;

  if (selectedMain === "ALL") {
    subFolderContainer.classList.add("hidden");
    return;
  }

  const subFolders = Array.from(new Set(allWordsList.map(w => w.folder)))
    .filter(f => f && f.startsWith(selectedMain + "/"));

  if (subFolders.length > 0) {
    subFolders.sort();
    subFolders.forEach(subFull => {
      const opt = document.createElement("option");
      opt.value = subFull;
      opt.textContent = subFull.slice(selectedMain.length + 1);
      subFolderSelect.appendChild(opt);
    });
    subFolderContainer.classList.remove("hidden");
  } else {
    subFolderContainer.classList.add("hidden");
  }
}

// 取得本次測驗範圍：過濾佔位單字、依「英文+中文」去重
function getFilteredWords() {
  const main = quizFolderSelect.value;
  const sub = subFolderSelect ? subFolderSelect.value : "ALL_SUB";

  let list = allWordsList.filter(w => w.en !== PLACEHOLDER);

  if (main !== "ALL") {
    if (!sub || sub === "ALL_SUB") {
      list = list.filter(w => inFolder(w.folder, main));
    } else {
      list = list.filter(w => w.folder === sub);
    }
  }

  const seen = new Set();
  return list.filter(w => {
    const key = w.en.toLowerCase() + "|" + w.ch;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

quizFolderSelect.addEventListener("change", () => {
  updateSubFolderDropdown();
  initCurrentMode();
});

subFolderSelect.addEventListener("change", () => {
  initCurrentMode();
});

// 大模式切換
mainTabFill.addEventListener("click", () => {
  mainTabFill.classList.add("active");
  mainTabMatch.classList.remove("active");
  subModeBox.classList.add("hidden");
  initCurrentMode();
});

mainTabMatch.addEventListener("click", () => {
  mainTabMatch.classList.add("active");
  mainTabFill.classList.remove("active");
  subModeBox.classList.remove("hidden");
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

window.initCurrentMode = function () {
  resultBox.classList.add("hidden");
  const isFill = mainTabFill.classList.contains("active");
  modeFill.classList.toggle("hidden", !isFill);
  modeMatch.classList.toggle("hidden", isFill);

  quizPool = getFilteredWords();

  if (quizPool.length === 0) {
    if (isFill) {
      modeFill.innerHTML = `<p style="text-align:center; padding:20px; color:#666;">此資料夾中沒有單字！</p>`;
    } else {
      matchQuestion.textContent = "此資料夾中沒有單字！";
      optionsContainer.innerHTML = "";
      matchFeedback.textContent = "";
    }
    return;
  }

  quizQueue = shuffle(quizPool);
  wrongList = [];
  currentIndex = 0;

  if (isFill) {
    startFillGame();
  } else {
    startMatchGame();
  }
};

// 輔助函式：產生詞性標籤 HTML
function getPosTagHtml(pos) {
  if (!pos) return "";
  return `<span style="font-size: 14px; color: #0284c7; background: #e0f2fe; padding: 2px 7px; border-radius: 4px; margin-right: 8px; font-weight: bold; vertical-align: middle;">${esc(pos)}</span>`;
}

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
        ${getPosTagHtml(currentWord.pos)}${esc(currentWord.ch)}
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

  if (!fillAnswerInput || fillAnswerInput.disabled) return;

  const userInput = fillAnswerInput.value.trim().toLowerCase();
  if (!userInput) return;

  fillAnswerInput.disabled = true;
  btnCheck.disabled = true;

  const isCorrect = (userInput === currentWord.en.trim().toLowerCase());

  if (!isCorrect) {
    wrongList.push({
      en: currentWord.en,
      pos: currentWord.pos || "",
      ch: currentWord.ch,
      userAnswer: userInput,
      mode: "填空"
    });
  }

  // 送出後結果顯示畫面 (包含詞性)
  modeFill.innerHTML = `
    <div style="text-align: center; padding: 10px;">
      <div style="font-size: 14px; font-weight: bold; color: #475569; margin-bottom: 12px;">
        進度: ${currentIndex + 1} / ${quizQueue.length}
      </div>
      <div style="font-size: 24px; font-weight: bold; color: #1e293b; margin-bottom: 10px;">
        ${getPosTagHtml(currentWord.pos)}${esc(currentWord.ch)}
      </div>
      <div style="background: ${isCorrect ? '#f0fdf4' : '#fef2f2'}; border: 1px solid ${isCorrect ? '#bbf7d0' : '#fecaca'}; border-radius: 8px; padding: 15px; margin-bottom: 20px; display: inline-block; width: 100%; max-width: 400px; box-sizing: border-box; text-align: left;">
        <div style="color: ${isCorrect ? '#16a34a' : '#dc2626'}; font-weight: bold; margin-bottom: 6px; font-size: 16px;">
          ${isCorrect ? '✅ 答對了！' : '❌ 答錯囉！'}
        </div>
        <div style="font-size: 14px; color: #334155; margin-bottom: 4px;">你的回答：<span style="color: ${isCorrect ? '#16a34a' : '#ef4444'}; font-weight: bold; ${isCorrect ? '' : 'text-decoration: line-through;'}">${esc(userInput)}</span></div>
        <div style="font-size: 15px; color: #1e293b;">正確答案：<strong style="color: #2563eb; font-size: 18px;">${esc(currentWord.en)}</strong></div>
      </div>
      <div>
        <button id="btn-next-fill" style="padding: 12px 30px; background: #4f46e5; color: #fff; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 16px; box-shadow: 0 4px 10px rgba(79,70,229,0.25);">
          確認，下一題 ➡️
        </button>
      </div>
    </div>
  `;

  currentIndex++;

  // 按鈕取得焦點後，按 Enter 本來就會觸發 click，不需要另外掛 document 監聽
  const btnNext = document.getElementById("btn-next-fill");
  if (btnNext) {
    btnNext.focus();
    btnNext.addEventListener("click", startFillGame);
  }
}

// ==================== 模式二：選擇配對測驗邏輯 ====================
function startMatchGame() {
  if (currentIndex >= quizQueue.length) {
    showQuizResult("選擇測驗");
    return;
  }

  isAnswerLocked = false;
  matchFeedback.textContent = `進度: ${currentIndex + 1} / ${quizQueue.length}`;
  matchFeedback.style.color = "#475569";
  optionsContainer.innerHTML = "";

  if (quizPool.length < 3) {
    matchQuestion.textContent = "⚠️ 該資料夾單字少於 3 個，請至少新增 3 個單字才能進行選擇測驗！";
    return;
  }

  const isEnToCh = subTabEnCh.classList.contains("active");
  currentWord = quizQueue[currentIndex];

  if (isEnToCh) {
    matchQuestion.textContent = `英文：${currentWord.en}`;
  } else {
    matchQuestion.innerHTML = `中文：${getPosTagHtml(currentWord.pos)}${esc(currentWord.ch)}`;
  }

  // 優先挑「英文與中文都不同」的干擾選項，避免同義詞造成兩個答案
  let wrongOptions = shuffle(quizPool.filter(item =>
    item.en.toLowerCase() !== currentWord.en.toLowerCase() && item.ch !== currentWord.ch));
  if (wrongOptions.length < 2) {
    wrongOptions = shuffle(quizPool.filter(item => item.en.toLowerCase() !== currentWord.en.toLowerCase()));
  }
  if (wrongOptions.length < 2) {
    matchQuestion.textContent = "⚠️ 可用的干擾選項不足，請再新增一些單字！";
    return;
  }

  const makeChoice = (w, isCorrect) => ({
    html: isEnToCh ? `${getPosTagHtml(w.pos)}${esc(w.ch)}` : esc(w.en),
    isCorrect
  });

  const choices = shuffle([
    makeChoice(currentWord, true),
    makeChoice(wrongOptions[0], false),
    makeChoice(wrongOptions[1], false)
  ]);

  choices.forEach(choice => {
    const btn = document.createElement("button");
    btn.classList.add("option-btn");
    btn.innerHTML = choice.html;
    btn.dataset.correct = choice.isCorrect ? "1" : "0";
    btn.addEventListener("click", () => handleMatchClick(btn, choice.isCorrect));
    optionsContainer.appendChild(btn);
  });
}

function handleMatchClick(clickedBtn, isCorrect) {
  if (isAnswerLocked) return;
  isAnswerLocked = true;

  const allButtons = optionsContainer.querySelectorAll(".option-btn");

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
      pos: currentWord.pos || "",
      ch: currentWord.ch,
      userAnswer: "選擇錯誤選項",
      mode: "選擇"
    });

    matchFeedback.textContent = "❌ 答錯囉！";
    matchFeedback.style.color = "#dc2626";

    allButtons.forEach(btn => {
      if (btn.dataset.correct === "1") {
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
      <div style="text-align: left; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 20px; max-height: 300px; overflow-y: auto;">
        <h4 style="color: #b91c1c; margin-top: 0; margin-bottom: 12px;">📋 錯題訂正清單：</h4>
    `;
    wrongList.forEach((item, idx) => {
      resultHtml += `
        <div style="margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px dashed #fca5a5; font-size: 14px; color: #334155;">
          <b>${idx + 1}. 中文意思：</b>${getPosTagHtml(item.pos)}<span style="color: #1e293b; font-weight: bold;">${esc(item.ch)}</span> <br>
          ❌ 你的回答：<span style="color: #ef4444; text-decoration: line-through;">${esc(item.userAnswer)}</span> <br>
          ✅ 正確英文：<span style="color: #2563eb; font-weight: bold; font-size: 15px;">${esc(item.en)}</span>
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

  // 結果放進獨立容器，隱藏兩個測驗畫面（不破壞它們的 DOM）
  modeFill.classList.add("hidden");
  modeMatch.classList.add("hidden");
  resultBox.innerHTML = resultHtml;
  resultBox.classList.remove("hidden");

  const restartBtn = document.getElementById("btn-restart-quiz");
  if (restartBtn) {
    restartBtn.addEventListener("click", () => {
      initCurrentMode();
    });
  }
}
