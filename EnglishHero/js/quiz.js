const { esc, jsArg, shuffle, wordKey, PLACEHOLDER, MISTAKES } = EH;
const db = EH.db;
const $ = (id) => document.getElementById(id);

let currentUid = null;
let allWordsList = [];

// DOM
const mainTabFill = $("main-tab-fill");
const mainTabMatch = $("main-tab-match");
const subModeBox = $("sub-mode-box");
const subTabEnCh = $("sub-tab-en-ch");
const subTabChEn = $("sub-tab-ch-en");
const quizFolderSelect = $("quiz-folder-select");
const subFolderContainer = $("sub-folder-select-container");
const subFolderSelect = $("quiz-sub-folder-select");
const countSelect = $("quiz-count");
const modeFill = $("mode-fill");
const modeMatch = $("mode-match");
const matchHud = $("match-hud");
const matchQuestion = $("match-question");
const optionsContainer = $("options-container");
const matchFeedback = $("match-feedback");

// 結算畫面使用獨立容器，不會蓋掉選擇配對的 DOM
const resultBox = document.createElement("div");
resultBox.id = "quiz-result";
resultBox.classList.add("hidden");
document.querySelector(".card").appendChild(resultBox);

// 測驗狀態
let quizPool = [];     // 本次範圍內（已去重）的所有單字，用來產生干擾選項
let quizQueue = [];    // 本輪要考的題目
let wrongList = [];
let currentIndex = 0;
let currentWord = null;
let isAnswerLocked = false;
let correctCount = 0;
let streak = 0;
let hintLevel = 0;

// 還原上次選的題數；從首頁「開始複習」進來（?srs=1）時直接切到間隔複習
const savedCount = EH.store.get("eh_quiz_count");
if (savedCount !== null) countSelect.value = String(savedCount);
if (new URLSearchParams(location.search).get("srs")) countSelect.value = "srs";

// 間隔複習設定（想調整就改這兩個數字）
const NEW_PER_DAY = 10; // 每天最多加入幾個「新單字」
const MAX_SRS = 40;     // 每次複習最多幾題
let srsStats = { dueAll: 0, due: 0, fresh: 0 };
let recordCount = 0;

EH.requireUser((user) => {
  currentUid = user.uid;
  fetchAllUserData(user.uid);
});

function fetchAllUserData(uid) {
  Promise.all([EH.cache.getWords(uid), EH.srs.load(uid)])
    .then(([words]) => {
      allWordsList = [];
      words.forEach((d) => {
        if (!d.en || d.en === PLACEHOLDER) return;
        allWordsList.push({ en: d.en, pos: d.pos || "", ch: d.ch || "", folder: d.folder || "未分類" });
      });
      EH.saveStats(words);

      if (allWordsList.length === 0) {
        modeFill.innerHTML = `<p class="muted" style="text-align:center; padding:24px;">單字庫為空，請先至「新增單字」建立！</p>`;
        matchQuestion.textContent = "單字庫為空，請先至「新增單字」建立！";
        return;
      }

      buildFolderOptions();
      updateSubFolderDropdown();
      initCurrentMode();
    })
    .catch((err) => {
      modeFill.innerHTML = `<p style="text-align:center; padding:24px; color:var(--danger);">資料載入失敗：${esc(err.message)}</p>`;
    });
}

function buildFolderOptions() {
  const keep = quizFolderSelect.value || "ALL";
  const parents = new Set(allWordsList.map((w) => w.folder.split("/")[0]));
  quizFolderSelect.innerHTML = `<option value="ALL">全部資料夾 (綜合測驗)</option>`;
  Array.from(parents).sort((a, b) => a.localeCompare(b)).forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    quizFolderSelect.appendChild(opt);
  });
  quizFolderSelect.value = keep;
}

function inFolder(folder, name) {
  return folder === name || folder.startsWith(name + "/");
}

function updateSubFolderDropdown() {
  const main = quizFolderSelect.value;
  subFolderSelect.innerHTML = `<option value="ALL_SUB">-- 選擇子資料夾 (全部) --</option>`;
  if (main === "ALL") {
    subFolderContainer.classList.add("hidden");
    return;
  }
  const subs = Array.from(new Set(allWordsList.map((w) => w.folder)))
    .filter((f) => f.startsWith(main + "/"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (subs.length > 0) {
    subs.forEach((full) => {
      const opt = document.createElement("option");
      opt.value = full;
      opt.textContent = full.slice(main.length + 1);
      subFolderSelect.appendChild(opt);
    });
    subFolderContainer.classList.remove("hidden");
  } else {
    subFolderContainer.classList.add("hidden");
  }
}

// 本次測驗範圍：依「英文+中文」去重
function getFilteredWords() {
  const main = quizFolderSelect.value;
  const sub = subFolderSelect.value;
  let list = allWordsList;

  if (main !== "ALL") {
    list = (!sub || sub === "ALL_SUB")
      ? list.filter((w) => inFolder(w.folder, main))
      : list.filter((w) => w.folder === sub);
  }
  const seen = new Set();
  return list.filter((w) => {
    const k = wordKey(w);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

quizFolderSelect.addEventListener("change", () => { updateSubFolderDropdown(); initCurrentMode(); });
subFolderSelect.addEventListener("change", () => initCurrentMode());
countSelect.addEventListener("change", () => {
  EH.store.set("eh_quiz_count", countSelect.value);
  initCurrentMode();
});

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

function isFillMode() { return mainTabFill.classList.contains("active"); }

function showActiveMode() {
  resultBox.classList.add("hidden");
  const fill = isFillMode();
  modeFill.classList.toggle("hidden", !fill);
  modeMatch.classList.toggle("hidden", fill);
}

// 記錄作答結果到複習進度，每 10 題順便上傳一次
function srsRecord(word, isCorrect) {
  EH.srs.record(word, isCorrect);
  recordCount++;
  if (recordCount % 10 === 0) EH.srs.flush();
}
window.addEventListener("pagehide", () => { EH.srs.flush(); });

function showEmptyMessage(msg) {
  if (isFillMode()) {
    modeFill.innerHTML = `<p class="muted" style="text-align:center; padding:24px;">${esc(msg)}</p>`;
  } else {
    matchHud.innerHTML = "";
    optionsContainer.innerHTML = "";
    matchFeedback.textContent = "";
    matchQuestion.textContent = msg;
  }
}

// 今天的複習題 = 到期的單字（最逾期的優先）+ 今天還沒用完額度的新單字
function buildSrsQueue() {
  const learnedKeys = new Set(allWordsList.filter((w) => w.folder === EH.LEARNED).map(wordKey));
  const dueAll = quizPool
    .filter((w) => EH.srs.isDue(w))
    .sort((a, b) => EH.srs.get(a).d - EH.srs.get(b).d);
  const due = dueAll.slice(0, MAX_SRS);

  const quota = Math.max(0, Math.min(NEW_PER_DAY - EH.srs.newToday(), MAX_SRS - due.length));
  const fresh = shuffle(quizPool.filter((w) =>
    EH.srs.isNew(w) && !learnedKeys.has(wordKey(w)) && w.folder !== EH.MISTAKES)).slice(0, quota);

  srsStats = { dueAll: dueAll.length, due: due.length, fresh: fresh.length };
  return shuffle([...due, ...fresh]);
}

function updateSrsInfo(show) {
  const box = $("srs-info");
  if (!box) return;
  if (!show) { box.classList.add("hidden"); return; }
  box.classList.remove("hidden");
  box.innerHTML = `🧠 <b>間隔複習</b>：今天到期 <b>${srsStats.dueAll}</b> 個、新單字 <b>${srsStats.fresh}</b> 個` +
    `（每天最多 ${NEW_PER_DAY} 個新單字）。答錯的明天再考，答對的會隔 2、4、8…天再出現。`;
}

// 開始（或重新開始）一輪完整測驗
window.initCurrentMode = function () {
  showActiveMode();
  quizPool = getFilteredWords();

  if (quizPool.length === 0) {
    if (isFillMode()) {
      modeFill.innerHTML = `<p class="muted" style="text-align:center; padding:24px;">此範圍中沒有單字！</p>`;
    } else {
      matchQuestion.textContent = "此範圍中沒有單字！";
      optionsContainer.innerHTML = "";
      matchFeedback.textContent = "";
      matchHud.innerHTML = "";
    }
    return;
  }

  if (countSelect.value === "srs") {
    quizQueue = buildSrsQueue();
    updateSrsInfo(true);
    if (quizQueue.length === 0) {
      showEmptyMessage("🎉 這個範圍今天沒有需要複習的單字了！明天再來，或改選「題數」繼續練習。");
      return;
    }
  } else {
    updateSrsInfo(false);
    const limit = Number(countSelect.value) || 0;
    quizQueue = shuffle(quizPool);
    if (limit > 0) quizQueue = quizQueue.slice(0, limit);
  }
  beginRound();
};

function beginRound() {
  wrongList = [];
  currentIndex = 0;
  correctCount = 0;
  streak = 0;
  if (isFillMode()) startFillGame();
  else startMatchGame();
}

function posTag(pos) {
  return pos ? `<span class="tag tag-pos" style="margin-right:8px; vertical-align:middle;">${esc(pos)}</span>` : "";
}

function hudHtml() {
  const total = quizQueue.length;
  const pct = total ? Math.round((currentIndex / total) * 100) : 0;
  return `
    <div class="progress"><span style="width:${pct}%"></span></div>
    <div class="hud">
      <span>第 ${Math.min(currentIndex + 1, total)} / ${total} 題</span>
      <span>✅ ${correctCount}</span>
      <span>🔥 連對 ${streak}</span>
    </div>`;
}

/* ============================== 填空測驗 ============================== */

function hintText(word, level) {
  let shown = 0;
  return Array.from(word).map((ch) => {
    if (ch === " ") return "\u00A0\u00A0";
    if (shown < level) { shown++; return ch; }
    return "_";
  }).join(" ");
}

function startFillGame() {
  if (currentIndex >= quizQueue.length) { showQuizResult("填空測驗"); return; }

  currentWord = quizQueue[currentIndex];
  hintLevel = 0;

  modeFill.innerHTML = `
    ${hudHtml()}
    <div class="quiz-question">${posTag(currentWord.pos)}${esc(currentWord.ch)}</div>
    <div class="fill-wrap">
      <div class="hint-text" id="fill-hint"></div>
      <input type="text" id="fill-answer" class="fill-input" placeholder="請輸入英文單字..."
        autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false">
      <div class="result-actions" style="margin-top:0;">
        <button type="button" id="btn-hint" class="btn btn-ghost">💡 提示</button>
        <button type="button" id="btn-check-fill" class="btn btn-primary">送出答案</button>
      </div>
    </div>`;

  const input = $("fill-answer");
  input.focus();
  $("btn-check-fill").addEventListener("click", checkFillAnswer);
  $("btn-hint").addEventListener("click", showHint);
  input.addEventListener("keypress", (e) => { if (e.key === "Enter") checkFillAnswer(); });
}

function showHint() {
  const letters = currentWord.en.replace(/\s/g, "").length;
  const maxLevel = Math.max(1, letters - 1); // 至少保留一個字母不給
  hintLevel = Math.min(hintLevel + 1, maxLevel);
  $("fill-hint").textContent = hintText(currentWord.en, hintLevel);
  const input = $("fill-answer");
  if (input) input.focus();
}

function checkFillAnswer() {
  const input = $("fill-answer");
  const btnCheck = $("btn-check-fill");
  if (!input || input.disabled) return;

  const userInput = input.value.trim().toLowerCase().replace(/\s+/g, " ");
  if (!userInput) return;

  input.disabled = true;
  btnCheck.disabled = true;

  const isCorrect = userInput === currentWord.en.trim().toLowerCase().replace(/\s+/g, " ");
  srsRecord(currentWord, isCorrect);
  if (isCorrect) {
    correctCount++;
    streak++;
  } else {
    streak = 0;
    wrongList.push({ en: currentWord.en, pos: currentWord.pos, ch: currentWord.ch, userAnswer: userInput });
  }
  currentIndex++;

  modeFill.innerHTML = `
    ${hudHtml()}
    <div class="quiz-question">${posTag(currentWord.pos)}${esc(currentWord.ch)}</div>
    <div class="fill-wrap">
      <div class="answer-box ${isCorrect ? "ok" : "bad"}">
        <div style="font-weight:800; margin-bottom:6px; color:${isCorrect ? "var(--primary-ink)" : "var(--danger)"};">
          ${isCorrect ? "✅ 答對了！" : "❌ 答錯囉！"}
        </div>
        <div style="font-size:14px; margin-bottom:4px;">你的回答：<b ${isCorrect ? "" : 'style="text-decoration:line-through; color:var(--danger);"'}>${esc(userInput)}</b></div>
        <div>正確答案：<b style="color:var(--accent); font-size:19px;">${esc(currentWord.en)}</b></div>
      </div>
      <div class="result-actions" style="margin-top:0;">
        <button type="button" class="btn btn-ghost" onclick="EH.speak(${jsArg(currentWord.en)})">🔊 聽發音</button>
        <button type="button" id="btn-next-fill" class="btn btn-primary">下一題 ➡️</button>
      </div>
    </div>`;

  // 按鈕取得焦點後，按 Enter 就會觸發 click
  const next = $("btn-next-fill");
  next.focus();
  next.addEventListener("click", startFillGame);
}

/* ============================== 選擇配對 ============================== */

function startMatchGame() {
  if (currentIndex >= quizQueue.length) { showQuizResult("選擇測驗"); return; }

  isAnswerLocked = false;
  matchHud.innerHTML = hudHtml();
  matchFeedback.textContent = "";
  optionsContainer.innerHTML = "";

  if (quizPool.length < 3) {
    matchQuestion.textContent = "⚠️ 這個範圍的單字少於 3 個，請至少有 3 個單字才能進行選擇測驗！";
    return;
  }

  const isEnToCh = subTabEnCh.classList.contains("active");
  currentWord = quizQueue[currentIndex];

  if (isEnToCh) {
    matchQuestion.innerHTML = `${esc(currentWord.en)} <button type="button" class="btn btn-ghost btn-sm" onclick="EH.speak(${jsArg(currentWord.en)})">🔊</button>`;
  } else {
    matchQuestion.innerHTML = `${posTag(currentWord.pos)}${esc(currentWord.ch)}`;
  }

  // 優先挑「英文與中文都不同」的干擾選項，避免同義詞造成兩個答案
  let wrong = shuffle(quizPool.filter((w) =>
    w.en.toLowerCase() !== currentWord.en.toLowerCase() && w.ch !== currentWord.ch));
  if (wrong.length < 2) {
    wrong = shuffle(quizPool.filter((w) => w.en.toLowerCase() !== currentWord.en.toLowerCase()));
  }
  if (wrong.length < 2) {
    matchQuestion.textContent = "⚠️ 可用的干擾選項不足，請再新增一些單字！";
    return;
  }

  const makeChoice = (w, ok) => ({
    html: isEnToCh ? `${posTag(w.pos)}${esc(w.ch)}` : esc(w.en),
    isCorrect: ok
  });
  const choices = shuffle([makeChoice(currentWord, true), makeChoice(wrong[0], false), makeChoice(wrong[1], false)]);

  choices.forEach((choice, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.classList.add("option-btn");
    btn.innerHTML = `<span class="kbd">${i + 1}</span><span>${choice.html}</span>`;
    btn.dataset.correct = choice.isCorrect ? "1" : "0";
    btn.addEventListener("click", () => handleMatchClick(btn, choice.isCorrect));
    optionsContainer.appendChild(btn);
  });
}

function handleMatchClick(clickedBtn, isCorrect) {
  if (isAnswerLocked) return;
  isAnswerLocked = true;
  srsRecord(currentWord, isCorrect);

  if (isCorrect) {
    clickedBtn.classList.add("correct");
    correctCount++;
    streak++;
    matchFeedback.textContent = streak >= 3 ? `✅ 答對了！🔥 連對 ${streak}` : "✅ 答對了！";
    matchFeedback.style.color = "var(--primary)";
  } else {
    clickedBtn.classList.add("wrong");
    streak = 0;
    wrongList.push({ en: currentWord.en, pos: currentWord.pos, ch: currentWord.ch, userAnswer: "選擇錯誤選項" });
    matchFeedback.textContent = "❌ 答錯囉！";
    matchFeedback.style.color = "var(--danger)";
    optionsContainer.querySelectorAll(".option-btn").forEach((btn) => {
      if (btn.dataset.correct === "1") btn.classList.add("correct");
    });
  }

  currentIndex++;
  matchHud.innerHTML = hudHtml();
  setTimeout(startMatchGame, isCorrect ? 800 : 1500);
}

// 數字鍵 1 / 2 / 3 直接作答
document.addEventListener("keydown", (e) => {
  if (modeMatch.classList.contains("hidden") || isAnswerLocked || EH.modalOpen()) return;
  const tag = (e.target.tagName || "").toLowerCase();
  if (["input", "textarea", "select"].includes(tag)) return;
  const idx = ["1", "2", "3"].indexOf(e.key);
  if (idx < 0) return;
  const btns = optionsContainer.querySelectorAll(".option-btn");
  if (btns[idx]) btns[idx].click();
});

/* ============================== 結算 ============================== */

function uniqueWrongWords() {
  const seen = new Set();
  const words = [];
  wrongList.forEach((w) => {
    const k = wordKey(w);
    if (!seen.has(k)) {
      seen.add(k);
      words.push({ en: w.en, pos: w.pos, ch: w.ch });
    }
  });
  return words;
}

function showQuizResult(modeName) {
  EH.srs.flush();
  const total = quizQueue.length;
  const wrongCount = wrongList.length;
  const score = total ? Math.round(((total - wrongCount) / total) * 100) : 0;
  const emoji = score >= 90 ? "🏆" : score >= 60 ? "👍" : "💪";
  const comment = score === 100 ? "全部答對，太神啦！" : score >= 90 ? "非常棒！" : score >= 60 ? "不錯，再加強一下錯的地方" : "多複習幾次，下次一定更好";

  let html = `
    <div class="result-card">
      <div style="font-size:44px;">${emoji}</div>
      <div class="score-big">${score}<span style="font-size:22px;"> 分</span></div>
      <p class="muted" style="margin:6px 0;">${modeName}結束・${comment}</p>
      <p style="font-size:16px;">
        共 <b>${total}</b> 題｜答對 <b style="color:var(--primary)">${total - wrongCount}</b>｜答錯 <b style="color:var(--danger)">${wrongCount}</b>
      </p>`;

  if (wrongCount > 0) {
    html += `<div class="wrong-box"><b style="color:var(--danger);">📋 錯題訂正清單</b>`;
    wrongList.forEach((item, idx) => {
      html += `
        <div class="wrong-item">
          <b>${idx + 1}.</b> ${posTag(item.pos)}<b>${esc(item.ch)}</b><br>
          ❌ <span style="color:var(--danger); text-decoration:line-through;">${esc(item.userAnswer)}</span>　
          ✅ <b style="color:var(--accent);">${esc(item.en)}</b>
          <button type="button" class="btn btn-ghost btn-sm" onclick="EH.speak(${jsArg(item.en)})">🔊</button>
        </div>`;
    });
    html += `</div>`;
  }

  html += `<div class="result-actions">`;
  if (wrongCount > 0) {
    html += `<button type="button" class="btn btn-primary" onclick="retryWrong()">🎯 只重考錯題 (${uniqueWrongWords().length})</button>`;
    html += `<button type="button" class="btn btn-secondary" onclick="saveMistakes(this)">📝 存到錯題本</button>`;
  }
  html += `<button type="button" class="btn ${wrongCount > 0 ? "btn-ghost" : "btn-primary"}" onclick="initCurrentMode()">🔄 重新測驗</button>`;
  html += `</div></div>`;

  modeFill.classList.add("hidden");
  modeMatch.classList.add("hidden");
  resultBox.innerHTML = html;
  resultBox.classList.remove("hidden");
}

window.retryWrong = function () {
  const words = uniqueWrongWords();
  if (words.length === 0) return;
  showActiveMode();
  quizQueue = shuffle(words.map((w) => ({ ...w, folder: "" })));
  beginRound();
};

window.saveMistakes = async function (btn) {
  if (!currentUid) return;
  const words = uniqueWrongWords();
  const existing = new Set(allWordsList.filter((w) => w.folder === MISTAKES).map(wordKey));
  const toAdd = words.filter((w) => !existing.has(wordKey(w)));

  if (toAdd.length === 0) {
    EH.toast("這些錯題都已經在錯題本裡了", "info");
    if (btn) { btn.disabled = true; btn.textContent = "✅ 已在錯題本"; }
    return;
  }

  if (btn) btn.disabled = true;
  try {
    const ref = db.collection("users").doc(currentUid).collection("words");
    const batch = db.batch();
    const created = [];
    toAdd.forEach((w) => {
      const r = ref.doc();
      created.push({ id: r.id, en: w.en, pos: w.pos || "", ch: w.ch, folder: MISTAKES, createdAt: Date.now() });
      batch.set(r, {
        en: w.en, pos: w.pos || "", ch: w.ch, folder: MISTAKES,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    await batch.commit();
    EH.cache.append(currentUid, created);

    toAdd.forEach((w) => allWordsList.push({ en: w.en, pos: w.pos || "", ch: w.ch, folder: MISTAKES }));
    buildFolderOptions();
    EH.saveStats(allWordsList);
    EH.toast(`📝 已把 ${toAdd.length} 個單字存到「${MISTAKES}」`, "success", 3500);
    if (btn) btn.textContent = "✅ 已存到錯題本";
  } catch (err) {
    EH.toast("存入錯題本失敗：" + err.message, "error", 4000);
    if (btn) btn.disabled = false;
  }
};

// 讓 quiz.html 知道這支程式已完整載入（診斷用）
window.__EH_QUIZ_READY = "3300";
