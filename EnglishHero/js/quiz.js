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

let currentFillWord = null;
let currentMatchWord = null;
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
  startMatchGame();
});

subTabChEn.addEventListener("click", () => {
  subTabChEn.classList.add("active");
  subTabEnCh.classList.remove("active");
  startMatchGame();
});

function initCurrentMode() {
  if (mainTabFill.classList.contains("active")) {
    startFillGame();
  } else {
    startMatchGame();
  }
}

// --- 模式一：填空邏輯 ---
function startFillGame() {
  const currentList = getFilteredWords();
  if (currentList.length === 0) {
    fillQuestion.textContent = "此資料夾中沒有單字！";
    fillAnswer.value = "";
    return;
  }
  fillAnswer.value = "";
  fillFeedback.textContent = "";
  const randomIndex = Math.floor(Math.random() * currentList.length);
  currentFillWord = currentList[randomIndex];
  fillQuestion.textContent = currentFillWord.ch;
  fillAnswer.focus();
}

btnCheckFill.addEventListener("click", checkFillAnswer);
fillAnswer.addEventListener("keypress", (e) => {
  if (e.key === "Enter") checkFillAnswer();
});

function checkFillAnswer() {
  if (!currentFillWord) return;
  const userInput = fillAnswer.value.trim().toLowerCase();
  if (!userInput) return;

  if (userInput === currentFillWord.en.toLowerCase()) {
    fillFeedback.textContent = "✅ 答對了！";
    fillFeedback.style.color = "#16a34a";
    setTimeout(startFillGame, 1000);
  } else {
    fillFeedback.textContent = "❌ 答錯囉！提示字首: " + currentFillWord.en.charAt(0);
    fillFeedback.style.color = "#dc2626";
    fillAnswer.focus();
  }
}

// --- 模式二：配對選擇邏輯 (一英三中 / 一中三英) ---
function startMatchGame() {
  const currentList = getFilteredWords();
  isAnswerLocked = false;
  matchFeedback.textContent = "";
  optionsContainer.innerHTML = "";

  if (currentList.length === 0) {
    matchQuestion.textContent = "此資料夾中沒有單字！";
    return;
  }

  if (currentList.length < 3) {
    matchQuestion.textContent = "⚠️ 該資料夾單字少於 3 個，請至少新增 3 個單字才能進行選擇測驗！";
    return;
  }

  const isEnToCh = subTabEnCh.classList.contains("active");
  const randomIndex = Math.floor(Math.random() * currentList.length);
  currentMatchWord = currentList[randomIndex];

  if (isEnToCh) {
    matchQuestion.textContent = `英文：${currentMatchWord.en}`;
  } else {
    matchQuestion.textContent = `中文：${currentMatchWord.ch}`;
  }

  let wrongOptions = currentList.filter(item => item.en !== currentMatchWord.en);
  wrongOptions.sort(() => Math.random() - 0.5);
  const selectedWrong = wrongOptions.slice(0, 2);

  let choices = [
    { text: isEnToCh ? currentMatchWord.ch : currentMatchWord.en, isCorrect: true },
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
  const targetText = isEnToCh ? currentMatchWord.ch : currentMatchWord.en;

  if (isCorrect) {
    clickedBtn.classList.add("correct");
    matchFeedback.textContent = "✅ 答對了！";
    matchFeedback.style.color = "#16a34a";
    setTimeout(startMatchGame, 1000);
  } else {
    clickedBtn.classList.add("wrong");
    matchFeedback.textContent = "❌ 答錯囉！";
    matchFeedback.style.color = "#dc2626";

    allButtons.forEach(btn => {
      if (btn.textContent === targetText) {
        btn.classList.add("correct");
      }
    });

    setTimeout(startMatchGame, 1800);
  }
}
