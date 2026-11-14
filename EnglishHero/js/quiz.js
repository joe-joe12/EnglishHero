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
const mainTabTrans = $("main-tab-trans");
const modeTrans = $("mode-trans");
const sourceSelect = $("quiz-source");
const transSourceBox = $("trans-source-box");

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

// 「同時考詞性」開關：記住上次的選擇，切換時重新出題
const posBox = $("quiz-pos");
if (posBox) {
  posBox.checked = !!EH.store.get("eh_quiz_pos", false);
  posBox.addEventListener("change", () => {
    EH.store.set("eh_quiz_pos", posBox.checked);
    initCurrentMode();
  });
}

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
  Promise.all([EH.cache.getWords(uid), EH.srs.load(uid), EH.daily.load(uid)])
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

function selectMainTab(which) {
  mainTabFill.classList.toggle("active", which === "fill");
  mainTabMatch.classList.toggle("active", which === "match");
  mainTabTrans.classList.toggle("active", which === "trans");
  subModeBox.classList.toggle("hidden", which !== "match");
  transSourceBox.classList.toggle("hidden", which !== "trans");
  initCurrentMode();
}
mainTabFill.addEventListener("click", () => selectMainTab("fill"));
mainTabMatch.addEventListener("click", () => selectMainTab("match"));
mainTabTrans.addEventListener("click", () => selectMainTab("trans"));
sourceSelect.addEventListener("change", () => initCurrentMode());
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

function currentMode() {
  if (mainTabTrans.classList.contains("active")) return "trans";
  return mainTabFill.classList.contains("active") ? "fill" : "match";
}
function isFillMode() { return currentMode() === "fill"; }

function showActiveMode() {
  resultBox.classList.add("hidden");
  const m = currentMode();
  modeFill.classList.toggle("hidden", m !== "fill");
  modeMatch.classList.toggle("hidden", m !== "match");
  modeTrans.classList.toggle("hidden", m !== "trans");
}

// 記錄作答結果到複習進度，每 10 題順便上傳一次
function srsRecord(word, isCorrect) {
  if (!word.kind || word.kind === "word") EH.srs.record(word, isCorrect); // 句型、用字不參與單字的間隔複習
  const daily = EH.daily.add(1);
  if (daily.reached) EH.toast(`🎉 達成今日目標（${EH.daily.goal()} 題）！`, "success", 3500);
  recordCount++;
  if (recordCount % 10 === 0) EH.flushProgress();
}
window.addEventListener("pagehide", () => { EH.flushProgress(); });

function showEmptyMessage(msg) {
  if (currentMode() === "trans") {
    modeTrans.innerHTML = `<p class="muted" style="text-align:center; padding:24px; line-height:1.8;">${esc(msg)}</p>`;
  } else if (isFillMode()) {
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
  if (currentMode() === "trans") { initTransMode(); return; }
  ensureScopeOptions("word");
  setSrsOptionEnabled(true);
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
  const m = currentMode();
  if (m === "fill") startFillGame();
  else if (m === "trans") startTransGame();
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
      <span>🎯 今日 ${EH.daily.count()}/${EH.daily.goal()}</span>
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
  chosenPos = null;
  const askPos = needPos(currentWord); // 勾了「同時考詞性」：題目不再直接顯示詞性，改成讓你選

  modeFill.innerHTML = `
    ${hudHtml()}
    <div class="quiz-question">${askPos ? "" : posTag(currentWord.pos)}${esc(currentWord.ch)}</div>
    <div class="fill-wrap">
      ${askPos ? posPickerHtml() : ""}
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

  const askPos = needPos(currentWord);
  if (askPos && !chosenPos) {
    EH.toast("請也選一下這個字的詞性", "info", 1800);
    return;
  }

  input.disabled = true;
  btnCheck.disabled = true;

  const spellOk = userInput === currentWord.en.trim().toLowerCase().replace(/\s+/g, " ");
  const posOk = !askPos || posMatches(chosenPos, currentWord.pos);
  const isCorrect = spellOk && posOk;
  srsRecord(currentWord, isCorrect);
  if (isCorrect) {
    correctCount++;
    streak++;
  } else {
    streak = 0;
    wrongList.push({
      en: currentWord.en, pos: currentWord.pos, ch: currentWord.ch, userAnswer: userInput,
      answerOk: spellOk,
      posNote: askPos && !posOk ? `詞性選 ${chosenPos}，正確是 ${posName(currentWord.pos)}` : ""
    });
  }
  currentIndex++;

  const posLine = askPos
    ? `<div style="font-size:14px; margin-bottom:4px;">詞性：你選 <b>${esc(chosenPos)}</b>　${posOk ? "✅" : `❌ 正確是 <b style="color:var(--accent);">${esc(posName(currentWord.pos))}</b>`}</div>`
    : "";

  modeFill.innerHTML = `
    ${hudHtml()}
    <div class="quiz-question">${posTag(currentWord.pos)}${esc(currentWord.ch)}</div>
    <div class="fill-wrap">
      <div class="answer-box ${isCorrect ? "ok" : "bad"}">
        <div style="font-weight:800; margin-bottom:6px; color:${isCorrect ? "var(--primary-ink)" : "var(--danger)"};">
          ${isCorrect ? "✅ 答對了！" : "❌ 答錯囉！"}
        </div>
        <div style="font-size:14px; margin-bottom:4px;">你的回答：<b ${spellOk ? "" : 'style="text-decoration:line-through; color:var(--danger);"'}>${esc(userInput)}</b></div>
        ${posLine}
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
  pendingMatch = null;
  chosenPos = null;
  matchHud.innerHTML = hudHtml();
  matchFeedback.textContent = "";
  optionsContainer.innerHTML = "";

  if (quizPool.length < 3) {
    matchQuestion.textContent = "⚠️ 這個範圍的單字少於 3 個，請至少有 3 個單字才能進行選擇測驗！";
    return;
  }

  const isEnToCh = subTabEnCh.classList.contains("active");
  currentWord = quizQueue[currentIndex];
  const showPos = !needPos(currentWord); // 要考詞性時，不能在題目 / 選項上直接露出詞性

  if (isEnToCh) {
    matchQuestion.innerHTML = `${esc(currentWord.en)} <button type="button" class="btn btn-ghost btn-sm" onclick="EH.speak(${jsArg(currentWord.en)})">🔊</button>`;
  } else {
    matchQuestion.innerHTML = `${showPos ? posTag(currentWord.pos) : ""}${esc(currentWord.ch)}`;
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
    html: isEnToCh ? `${showPos ? posTag(w.pos) : ""}${esc(w.ch)}` : esc(w.en),
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

  // 先標示「這個選項」對或錯
  if (isCorrect) {
    clickedBtn.classList.add("correct");
  } else {
    clickedBtn.classList.add("wrong");
    optionsContainer.querySelectorAll(".option-btn").forEach((btn) => {
      if (btn.dataset.correct === "1") btn.classList.add("correct");
    });
  }

  // 有勾「同時考詞性」：還要再選詞性，選完才算這題的結果
  if (needPos(currentWord)) {
    pendingMatch = { answerOk: isCorrect };
    chosenPos = null;
    matchFeedback.innerHTML = `
      <div style="margin-top:6px; font-weight:400;">
        <div class="muted" style="margin-bottom:6px;">${isCorrect ? "✅ 選對了！" : "❌ 選錯了。"}再選這個字的詞性：</div>
        ${posPickerHtml("pickMatchPos")}
      </div>`;
    return;
  }
  finalizeMatch(isCorrect, null);
}

window.pickMatchPos = function (p) {
  if (!pendingMatch) return;
  const info = pendingMatch;
  pendingMatch = null;
  chosenPos = p;
  finalizeMatch(info.answerOk, p);
};

function finalizeMatch(answerOk, pickedPos) {
  const w = currentWord;
  const askPos = pickedPos !== null;
  const posOk = !askPos || posMatches(pickedPos, w.pos);
  const ok = answerOk && posOk;
  srsRecord(w, ok);

  if (ok) {
    correctCount++;
    streak++;
    matchFeedback.textContent = (askPos ? "✅ 答對了，詞性也對！" : "✅ 答對了！") + (streak >= 3 ? `🔥 連對 ${streak}` : "");
    matchFeedback.style.color = "var(--primary)";
  } else {
    streak = 0;
    wrongList.push({
      en: w.en, pos: w.pos, ch: w.ch,
      userAnswer: answerOk ? "（答案正確）" : "選擇錯誤選項",
      answerOk,
      posNote: askPos && !posOk ? `詞性選 ${pickedPos}，正確是 ${posName(w.pos)}` : ""
    });
    matchFeedback.textContent = !answerOk ? "❌ 答錯囉！" : `❌ 詞性不對，正確是 ${posName(w.pos)}`;
    matchFeedback.style.color = "var(--danger)";
  }

  currentIndex++;
  matchHud.innerHTML = hudHtml();
  setTimeout(startMatchGame, ok ? 800 : 1800);
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
      words.push(w.q ? { ...w.q } : { en: w.en, pos: w.pos, ch: w.ch });
    }
  });
  return words;
}

function showQuizResult(modeName) {
  EH.flushProgress();
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

  html += `<div class="result-actions">`;
  if (wrongCount > 0) {
    html += `<button type="button" class="btn btn-primary" onclick="retryWrong()">🎯 只重考錯題 (${uniqueWrongWords().length})</button>`;
    if (wrongList.every((w) => !w.kind || w.kind === "word")) { // 句型、用字不存進單字的錯題本
      html += `<button type="button" class="btn btn-secondary" onclick="saveMistakes(this)">📝 存到錯題本</button>`;
    }
  }
  html += `<button type="button" class="btn ${wrongCount > 0 ? "btn-ghost" : "btn-primary"}" onclick="initCurrentMode()">🔄 重新測驗</button>`;
  html += `</div>`;

  if (wrongCount > 0) {
    html += `<div class="wrong-box"><b style="color:var(--danger);">📋 錯題訂正清單</b>`;
    wrongList.forEach((item, idx) => { html += wrongItemHtml(item, idx); });
    html += `</div>`;
  }

  html += `</div>`;

  modeFill.classList.add("hidden");
  modeMatch.classList.add("hidden");
  modeTrans.classList.add("hidden");
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

/* ============================== 詞性（勾選「同時考詞性」時使用） ============================== */

const POS_OPTIONS = [["n.", "名詞"], ["v.", "動詞"], ["adj.", "形容詞"], ["adv.", "副詞"], ["prep.", "介系詞"], ["conj.", "連接詞"], ["phr.", "片語"]];
const normPos = (p) => String(p || "").trim().toLowerCase().replace(/\.+$/, "");
const posList = (p) => String(p || "").split(/[\/,、\s]+/).map(normPos).filter(Boolean); // 「n./v.」這種多詞性也能比對
let chosenPos = null;
let pendingMatch = null;

function posTestOn() {
  const el = $("quiz-pos");
  return !!(el && el.checked);
}
// 只有「單字」、而且這個單字有填詞性，才會考詞性
function needPos(q) {
  return posTestOn() && (!q.kind || q.kind === "word") && posList(q.pos).length > 0;
}
function posMatches(chosen, expected) { return posList(expected).includes(normPos(chosen)); }
function posName(p) {
  const f = POS_OPTIONS.find(([k]) => normPos(k) === normPos(p));
  return f ? `${f[0]} ${f[1]}` : String(p || "");
}
function posPickerHtml(onPick) {
  const fn = onPick || "selectPos";
  return `<div class="muted" style="margin-bottom:6px;">🏷️ 這個字的詞性是？</div>
    <div class="pos-picker">${POS_OPTIONS.map(([k, n]) =>
      `<button type="button" class="btn btn-secondary btn-sm pos-chip" data-pos="${esc(k)}" onclick="${fn}(${jsArg(k)})">${esc(k)} ${esc(n)}</button>`).join("")}</div>`;
}
window.selectPos = function (p) {
  chosenPos = p;
  document.querySelectorAll(".pos-chip").forEach((b) => b.classList.toggle("is-on", b.dataset.pos === p));
};

/* ============================== 打字測驗（英翻中 / 換字 / 詞性轉換） ============================== */

// 題目統一成 {kind, en(題目), ch(答案), ...}，這樣錯題、重考、結算都能共用
const toWordQ = (w) => ({ kind: "word", en: w.en, pos: w.pos || "", ch: w.ch, folder: w.folder });
const toPatternQ = (p) => ({ kind: "pattern", en: p.pattern, pos: "", ch: p.ch, example: p.example || "", exampleCh: p.exampleCh || "", folder: p.category || "預設" });
const toSwapQ = (s) => {
  const alts = (Array.isArray(s.to) ? s.to : []).filter(Boolean);
  return { kind: "swap", en: s.from, pos: "", ch: alts.join(" / "), alts, note: s.note || "", example: s.example || "", folder: s.category || "預設" };
};

// 詞性轉換：一組「詞性變化」（create / creation、creativity / creative / creatively）
// 會隨機組出「給一個字，寫出指定詞性的字」的題目
const FORM_POS = [["v", "動詞", "v."], ["n", "名詞", "n."], ["adj", "形容詞", "adj."], ["adv", "副詞", "adv."]];
const FORM_PER_FAMILY = 3; // 每組每次最多出幾題，避免同一個字佔太多題
function toFormQs(fam) {
  const lists = FORM_POS
    .map(([k, name, abbr]) => ({ k, name, abbr, words: (Array.isArray(fam[k]) ? fam[k] : []).filter(Boolean) }))
    .filter((x) => x.words.length);
  const summary = lists.map((x) => `${x.words.join("、")} (${x.abbr})`).join(" → ");
  const qs = [];
  lists.forEach((s) => s.words.forEach((word) => lists.forEach((t) => {
    if (t.k === s.k) return;
    qs.push({
      kind: "form", en: word, pos: s.abbr, ch: t.words.join(" / "), alts: t.words,
      targetPos: t.abbr, targetName: t.name, meaning: fam.ch || "", summary, folder: fam.category || "預設"
    });
  })));
  return shuffle(qs).slice(0, FORM_PER_FAMILY);
}

const SOURCE_COLLECTION = { pattern: "patterns", swap: "swaps", form: "forms" };
const SOURCE_LABEL = { pattern: "句型", swap: "用字改變", form: "詞性變化" };
const SOURCE_BUILD = { pattern: (x) => [toPatternQ(x)], swap: (x) => [toSwapQ(x)], form: toFormQs };

const extraData = { pattern: null, swap: null, form: null };
let scopeSource = "word"; // 目前「測驗範圍」選單裡放的是：單字資料夾 / 句型、用字、詞性變化的分類
let transPending = null;  // 目前這題的作答狀態
let initSeq = 0;

const normEn = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
const normZh = (s) => String(s || "")
  .replace(/[\s\u3000，,。.、；;：:！!？?（）()\[\]【】「」『』"'“”‘’~～…\-—]/g, "")
  .toLowerCase();

// 中文答案比對（寬鬆）：中文意思可能有好幾個（用 / 、 ， ； 分開），符合任何一個就算對
function zhMeanings(ch) {
  const parts = String(ch).split(/[\/／、,，;；\n]|\s{2,}/).map(normZh).filter(Boolean);
  return Array.from(new Set([normZh(ch), ...parts])).filter(Boolean);
}
function matchesChinese(answer, ch) {
  const a = normZh(answer);
  if (!a) return false;
  return zhMeanings(ch).some((m) => {
    if (a === m) return true;
    if (m.length >= 2 && a.length >= 2) {
      if (m.includes(a) && a.length >= Math.ceil(m.length / 2)) return true; // 寫了意思的主要部分
      if (a.includes(m) && a.length <= m.length + 1) return true;            // 多寫了一點點（例如加「的」）
    }
    return false;
  });
}

async function loadExtra(src) {
  if (extraData[src]) return;
  extraData[src] = await EH.collection(SOURCE_COLLECTION[src]).getAll(currentUid);
}

function setSrsOptionEnabled(on) {
  Array.from(countSelect.options || []).forEach((o) => { if (o.value === "srs") o.disabled = !on; });
}

// 「測驗範圍」選單的內容跟著題目來源換：單字→資料夾；其他→分類
function ensureScopeOptions(src) {
  if (scopeSource === src) return;
  scopeSource = src;
  if (src === "word") {
    quizFolderSelect.innerHTML = `<option value="ALL">全部資料夾 (綜合測驗)</option>`;
    quizFolderSelect.value = "ALL";
    buildFolderOptions();
  } else {
    const cats = Array.from(new Set((extraData[src] || []).map((x) => x.category || "預設"))).sort((a, b) => a.localeCompare(b));
    quizFolderSelect.innerHTML = `<option value="ALL">全部分類</option>` +
      cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  }
  quizFolderSelect.value = "ALL";
  updateSubFolderDropdown();
}

async function initTransMode() {
  const seq = ++initSeq;
  const src = sourceSelect.value || "word";
  setSrsOptionEnabled(src === "word");
  if (src !== "word" && countSelect.value === "srs") countSelect.value = "10";

  if (src !== "word") {
    try {
      await loadExtra(src);
    } catch (err) {
      if (seq === initSeq) showEmptyMessage("載入失敗：" + err.message);
      return;
    }
    if (seq !== initSeq) return; // 載入期間使用者又切換了，放棄這次
  }
  ensureScopeOptions(src);

  const cat = quizFolderSelect.value;
  if (src === "word") {
    quizPool = getFilteredWords().map(toWordQ);
  } else {
    quizPool = (extraData[src] || [])
      .filter((x) => cat === "ALL" || (x.category || "預設") === cat)
      .flatMap(SOURCE_BUILD[src]);
  }

  if (quizPool.length === 0) {
    updateSrsInfo(false);
    showEmptyMessage(src === "word"
      ? "此範圍中沒有單字！"
      : `還沒有任何「${SOURCE_LABEL[src]}」。\n請先回首頁進入「${SOURCE_LABEL[src]}」新增，再回來考試！`);
    return;
  }

  if (src === "word" && countSelect.value === "srs") {
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
}

function transPrompt(q) {
  if (q.kind === "swap") return "寫出更好的替代用字（寫一個就可以）";
  if (q.kind === "form") return `寫出它的「${q.targetName} ${q.targetPos}」形式（寫一個就可以）`;
  if (q.kind === "pattern") return "寫出這個句型的中文意思";
  return "寫出中文意思";
}

function transQuestionHtml(q, showPos) {
  const size = q.kind === "pattern" ? "font-size:22px;" : "";
  const tag = (q.kind === "word" && showPos) || q.kind === "form" ? posTag(q.pos) : "";
  const sub = q.kind === "form"
    ? `<div style="font-size:15px; font-weight:700; margin-top:8px;">→ ${esc(q.targetName)} ${esc(q.targetPos)}</div>` +
      (q.meaning ? `<div class="muted" style="font-size:13px; font-weight:400;">${esc(q.meaning)}</div>` : "")
    : "";
  return `<div class="quiz-question" style="${size}">${tag}${esc(q.en)}
    <button type="button" class="btn btn-ghost btn-sm" onclick="EH.speak(${jsArg(q.en)})">🔊</button>${sub}</div>`;
}

function startTransGame() {
  if (currentIndex >= quizQueue.length) { showQuizResult("打字測驗"); return; }

  const q = quizQueue[currentIndex];
  currentWord = q;
  transPending = null;
  chosenPos = null;
  const askPos = needPos(q);
  const placeholder = q.kind === "swap" ? "例：glad" : q.kind === "form" ? "請輸入英文單字..." : "請輸入中文...";

  modeTrans.innerHTML = `
    ${hudHtml()}
    ${transQuestionHtml(q, !askPos)}
    <div class="fill-wrap">
      <p class="muted" style="margin-bottom:8px;">${transPrompt(q)}</p>
      ${askPos ? posPickerHtml() : ""}
      <input type="text" id="trans-answer" class="fill-input" placeholder="${placeholder}"
        autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false">
      <div class="result-actions" style="margin-top:0;">
        <button type="button" id="btn-trans-reveal" class="btn btn-ghost">👀 看答案</button>
        <button type="button" id="btn-trans-submit" class="btn btn-primary">${q.kind === "pattern" ? "對照答案" : "送出答案"}</button>
      </div>
    </div>`;

  const input = $("trans-answer");
  input.focus();
  $("btn-trans-submit").addEventListener("click", () => submitTrans(false));
  $("btn-trans-reveal").addEventListener("click", () => submitTrans(true));
  input.addEventListener("keypress", (e) => { if (e.key === "Enter") submitTrans(false); });
}

function submitTrans(reveal) {
  const input = $("trans-answer");
  if (!input || input.disabled || transPending) return;
  const q = currentWord;
  const typed = input.value.trim();
  const askPos = needPos(q);
  if (!reveal && !typed && q.kind !== "pattern") {
    EH.toast("請先輸入答案，或按「看答案」", "info", 1500);
    return;
  }
  if (!reveal && askPos && !chosenPos) {
    EH.toast("請也選一下這個字的詞性", "info", 1800);
    return;
  }
  input.disabled = true;

  // 單字、用字、詞性轉換：自動批改；句型：沒辦法自動批改，看完參考答案後自己評分
  const auto = q.kind !== "pattern";
  let meaningOk = false;
  if (!reveal && q.kind === "word") meaningOk = matchesChinese(typed, q.ch);
  else if (!reveal && (q.kind === "swap" || q.kind === "form")) meaningOk = q.alts.some((a) => normEn(a) === normEn(typed));
  const posOk = !askPos || (!reveal && posMatches(chosenPos, q.pos));

  transPending = {
    ok: meaningOk && posOk, auto, meaningOk, askPos, posOk, chosen: chosenPos,
    userAnswer: typed || (reveal ? "（看答案）" : "（未作答）")
  };
  renderTransResult();
}

function transAnswerHtml(q) {
  const lines = [];
  if (q.kind === "swap") {
    lines.push(`<b style="color:var(--accent);">${q.alts.map(esc).join("、")}</b>`);
    if (q.note) lines.push(`<div class="muted" style="margin-top:4px;">${esc(q.note)}</div>`);
    if (q.example) lines.push(`<div class="muted"><i>${esc(q.example)}</i></div>`);
  } else if (q.kind === "form") {
    lines.push(`<b style="color:var(--accent);">${q.alts.map(esc).join("、")}</b>`);
    if (q.summary) lines.push(`<div class="muted" style="margin-top:4px;">${esc(q.summary)}</div>`);
  } else if (q.kind === "pattern") {
    lines.push(`<b style="color:var(--accent);">${esc(q.ch)}</b>`);
    if (q.example) lines.push(`<div class="muted" style="margin-top:4px;"><i>${esc(q.example)}</i></div>`);
    if (q.exampleCh) lines.push(`<div class="muted">${esc(q.exampleCh)}</div>`);
  } else {
    lines.push(`<b style="color:var(--accent); font-size:19px;">${esc(q.ch)}</b>`);
  }
  return lines.join("");
}

function renderTransResult() {
  const q = currentWord;
  const p = transPending;
  const typedHtml = `<div style="font-size:14px; margin-bottom:4px;">你的回答：<b>${esc(p.userAnswer)}</b></div>`;
  const posLine = p.askPos
    ? `<div style="font-size:14px; margin-bottom:4px;">詞性：你選 <b>${esc(p.chosen || "（未選）")}</b>　${p.posOk ? "✅" : `❌ 正確是 <b style="color:var(--accent);">${esc(posName(q.pos))}</b>`}</div>`
    : "";
  let box, buttons;

  if (p.auto) {
    box = `
      <div class="answer-box ${p.ok ? "ok" : "bad"}">
        <div style="font-weight:800; margin-bottom:6px; color:${p.ok ? "var(--primary-ink)" : "var(--danger)"};">
          ${p.ok ? "✅ 答對了！" : "❌ 答錯囉！"}${p.overridden ? "（已改為答對）" : ""}
        </div>
        ${typedHtml}
        ${posLine}
        <div>${q.kind === "swap" ? "可以換成：" : "正確答案："}${transAnswerHtml(q)}</div>
      </div>`;
    buttons = `
      <div class="result-actions" style="margin-top:0;">
        ${p.ok ? "" : `<button type="button" id="btn-trans-override" class="btn btn-secondary">✅ 其實我答對了</button>`}
        <button type="button" id="btn-trans-next" class="btn btn-primary">下一題 ➡️</button>
      </div>`;
  } else {
    box = `
      <div class="answer-box" style="border-color:var(--border); background:var(--surface-2);">
        <div style="font-weight:800; margin-bottom:6px;">📖 對照參考答案</div>
        ${typedHtml}
        <div>參考答案：${transAnswerHtml(q)}</div>
      </div>`;
    buttons = `
      <div class="result-actions" style="margin-top:0;">
        <button type="button" id="btn-self-wrong" class="btn btn-danger">❌ 我答錯了</button>
        <button type="button" id="btn-self-right" class="btn btn-primary">✅ 我答對了</button>
      </div>`;
  }

  modeTrans.innerHTML = `${hudHtml()}${transQuestionHtml(q, true)}<div class="fill-wrap">${box}${buttons}</div>`;

  const next = $("btn-trans-next");
  if (next) {
    next.focus();
    next.addEventListener("click", () => finalizeTrans(p.ok));
  }
  const override = $("btn-trans-override");
  if (override) {
    override.addEventListener("click", () => {
      p.ok = true;
      p.overridden = true;
      renderTransResult();
    });
  }
  const wrong = $("btn-self-wrong");
  if (wrong) wrong.addEventListener("click", () => finalizeTrans(false));
  const right = $("btn-self-right");
  if (right) right.addEventListener("click", () => finalizeTrans(true));
}

// 這題最後的結果確定後才計分（讓「其實我答對了」可以改判）
function finalizeTrans(ok) {
  const q = currentWord;
  const p = transPending;
  if (!p) return;
  if (ok) {
    correctCount++;
    streak++;
  } else {
    streak = 0;
    wrongList.push({
      en: q.en, pos: q.pos, ch: q.ch, userAnswer: p.userAnswer, mode: "trans", kind: q.kind, q,
      answerOk: p.auto && p.meaningOk,
      posNote: p.askPos && !p.posOk ? `詞性選 ${p.chosen || "（未選）"}，正確是 ${posName(q.pos)}` : ""
    });
  }
  srsRecord(q, ok);
  currentIndex++;
  transPending = null;
  startTransGame();
}

function wrongItemHtml(item, idx) {
  const speak = `<button type="button" class="btn btn-ghost btn-sm" onclick="EH.speak(${jsArg(item.en)})">🔊</button>`;
  const posLine = item.posNote ? `<br>🏷️ ${esc(item.posNote)}` : "";
  const strike = (t) => `<span style="color:var(--danger); text-decoration:line-through;">${esc(t)}</span>`;

  if (item.mode === "trans") {
    const target = item.q && item.q.kind === "form" ? ` <span class="tag tag-pos">→ ${esc(item.q.targetPos)}</span>` : "";
    const tag = item.kind === "word" || item.kind === "form" ? posTag(item.pos) : "";
    const body = item.answerOk ? "✅ 答案正確" : `❌ ${strike(item.userAnswer)}　✅ <b style="color:var(--accent);">${esc(item.ch)}</b>`;
    return `
        <div class="wrong-item">
          <b>${idx + 1}.</b> ${tag}<b>${esc(item.en)}</b>${target}<br>
          ${body}${posLine} ${speak}
        </div>`;
  }
  const body = item.answerOk
    ? `✅ 答案正確（<b style="color:var(--accent);">${esc(item.en)}</b>）`
    : `❌ ${strike(item.userAnswer)}　✅ <b style="color:var(--accent);">${esc(item.en)}</b>`;
  return `
        <div class="wrong-item">
          <b>${idx + 1}.</b> ${posTag(item.pos)}<b>${esc(item.ch)}</b><br>
          ${body}${posLine} ${speak}
        </div>`;
}

window.__EH_QUIZ_READY = "3800";
