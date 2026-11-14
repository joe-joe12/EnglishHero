// 通用「卡片集合」頁面引擎：新增 / 修改 / 刪除 / 搜尋 / 備份 / 翻牌背誦
// 背句型、用字改變兩個頁面共用，各自只需要提供設定（見 patterns.js、swaps.js）
EH.cardsPage = function (cfg) {
  const { esc, jsArg, shuffle } = EH;
  const $ = (id) => document.getElementById(id);
  const root = $("cards-container");
  const titleEl = $("cards-title");
  const cache = EH.collection(cfg.collection);
  const key = (suffix) => `eh_${cfg.collection}_${suffix}`;

  let uid = null;
  let items = [];
  let category = "ALL";
  let query = "";
  let editingId = null;
  let lastCategory = EH.store.get(key("lastcat"), "預設");
  let dailyReady = null;
  let judged = 0;
  const settings = { reverse: EH.store.get(key("reverse"), false) };
  let study = { list: [], index: 0, flipped: false, active: false };

  const colRef = () => EH.db.collection("users").doc(uid).collection(cfg.collection);
  const catOf = (it) => it.category || "預設";
  const persist = () => cache.replaceAll(uid, items);

  async function load(force) {
    const list = await cache.getWords(uid, { force: !!force });
    items = list.map((x) => ({ ...x }));
    items.sort((a, b) => a.createdAt - b.createdAt);
  }

  function categories() {
    return Array.from(new Set(items.map(catOf))).sort((a, b) => a.localeCompare(b));
  }

  function filtered() {
    const q = query.trim().toLowerCase();
    return items.filter((it) =>
      (category === "ALL" || catOf(it) === category) &&
      (!q || cfg.searchText(it).toLowerCase().includes(q)));
  }

  /* ============================== 列表畫面 ============================== */

  function renderList() {
    study.active = false;
    titleEl.textContent = `${cfg.emoji} ${cfg.pageTitle}`;
    root.innerHTML = `
      <div class="section-bar" style="margin-top:0;">
        <span class="section-title">共 <b id="cards-count">0</b> 筆</span>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-primary btn-sm" onclick="cardsAct('study')">▶ 開始背誦</button>
          <button class="btn btn-secondary btn-sm" onclick="cardsAct('add')">➕ 新增${esc(cfg.itemLabel)}</button>
        </div>
      </div>
      <div class="row" style="margin-bottom:12px;">
        <select id="cards-category" onchange="cardsAct('category', this.value)"></select>
        <input type="search" id="cards-search" placeholder="🔍 搜尋…" value="${esc(query)}" oninput="cardsAct('search', this.value)">
      </div>
      <div class="word-list" id="cards-list"></div>
      <div class="import-bar">
        <button class="btn btn-ghost" onclick="cardsAct('export')">💾 備份</button>
        <button class="btn btn-ghost" onclick="document.getElementById('cards-import').click()">📥 匯入</button>
        <input type="file" id="cards-import" accept=".json" class="hidden" onchange="cardsAct('import', event)">
        <button class="btn btn-ghost" onclick="cardsAct('sync')">🔄 重新同步</button>
      </div>`;
    renderCategoryOptions();
    renderItems();
  }

  function renderCategoryOptions() {
    const sel = $("cards-category");
    if (!sel) return;
    const cats = categories();
    if (category !== "ALL" && !cats.includes(category)) category = "ALL";
    sel.innerHTML = `<option value="ALL">全部分類</option>` +
      cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
    sel.value = category;
  }

  function renderItems() {
    const listEl = $("cards-list");
    if (!listEl) return;
    const list = filtered();
    $("cards-count").textContent = list.length;
    if (list.length === 0) {
      listEl.innerHTML = `<p class="muted" style="text-align:center; padding:26px 10px; line-height:1.8;">${
        items.length === 0 ? esc(cfg.emptyHint) : "沒有符合的項目"}</p>`;
      return;
    }
    listEl.innerHTML = list.map((it) => `
      <div class="word-row">
        <div class="word-main" style="flex-direction:column; align-items:flex-start; gap:3px; min-width:0;">
          <div>${cfg.listMain(it)}</div>
          ${cfg.listSub ? `<div class="muted" style="line-height:1.6; word-break:break-word;">${cfg.listSub(it)}</div>` : ""}
          ${category === "ALL" ? `<span class="tag">${esc(catOf(it))}</span>` : ""}
        </div>
        <div class="word-actions">
          <button class="btn btn-ghost btn-sm" onclick="cardsAct('speak', ${jsArg(it.id)})">🔊</button>
          <button class="btn btn-ghost btn-sm" onclick="cardsAct('edit', ${jsArg(it.id)})">修改</button>
          <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="cardsAct('del', ${jsArg(it.id)})">刪除</button>
        </div>
      </div>`).join("");
  }

  /* ============================== 新增 / 修改 ============================== */

  function fieldHtml(f, it) {
    let val = it ? it[f.key] : "";
    if (Array.isArray(val)) val = val.join("、");
    val = val || "";
    const ph = esc(f.placeholder || "");
    const input = f.type === "textarea"
      ? `<textarea id="cf-${f.key}" placeholder="${ph}" style="min-height:72px;">${esc(val)}</textarea>`
      : `<input type="text" id="cf-${f.key}" value="${esc(val)}" placeholder="${ph}" autocomplete="off">`;
    return `
      <div class="form-group">
        <label for="cf-${f.key}">${esc(f.label)}${f.required ? ' <span style="color:var(--danger)">*</span>' : ""}</label>
        ${input}
        ${f.help ? `<div class="muted" style="margin-top:4px;">${esc(f.help)}</div>` : ""}
      </div>`;
  }

  function closeForm() {
    const el = $("cards-form-backdrop");
    if (el) el.remove();
  }

  function openForm(it) {
    closeForm();
    editingId = it ? it.id : null;
    const box = document.createElement("div");
    box.id = "cards-form-backdrop";
    box.className = "eh-modal-backdrop";
    box.innerHTML = `
      <div class="eh-modal">
        <h3>${it ? "✏️ 修改" : "➕ 新增"}${esc(cfg.itemLabel)}</h3>
        ${cfg.fields.map((f) => fieldHtml(f, it)).join("")}
        <div class="form-group">
          <label for="cf-category">📁 分類</label>
          <input type="text" id="cf-category" list="cf-cats" value="${esc(it ? catOf(it) : lastCategory)}" placeholder="例：第一課 / 作文用" autocomplete="off">
          <datalist id="cf-cats">${categories().map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
        </div>
        <div class="modal-btns" style="flex-wrap:wrap;">
          <button class="btn btn-ghost" onclick="cardsAct('closeForm')">取消</button>
          ${it ? "" : `<button class="btn btn-secondary" onclick="cardsAct('saveMore')">儲存並再新增</button>`}
          <button class="btn btn-primary" onclick="cardsAct('save')">儲存</button>
        </div>
      </div>`;
    box.addEventListener("click", (e) => { if (e.target === box) closeForm(); });
    document.body.appendChild(box);
    const first = $("cf-" + cfg.fields[0].key);
    if (first) first.focus();
  }

  async function save(keepOpen) {
    const data = {};
    for (const f of cfg.fields) {
      let v = ($("cf-" + f.key).value || "").trim();
      if (f.type === "list") v = v.split(/[,，、;；\/／\n]+/).map((s) => s.trim()).filter(Boolean);
      const empty = Array.isArray(v) ? v.length === 0 : !v;
      if (f.required && empty) {
        EH.toast(`請填寫「${f.label}」`, "error");
        $("cf-" + f.key).focus();
        return;
      }
      data[f.key] = v;
    }
    data.category = ($("cf-category").value || "").trim() || "預設";
    if (cfg.validate) {
      const msg = cfg.validate(data);
      if (msg) {
        EH.toast(msg, "error", 3500);
        return;
      }
    }

    try {
      if (editingId) {
        await colRef().doc(editingId).update(data);
        const it = items.find((x) => x.id === editingId);
        if (it) Object.assign(it, data);
      } else {
        const ref = await colRef().add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        items.push({ id: ref.id, ...data, createdAt: Date.now() });
      }
      lastCategory = data.category;
      EH.store.set(key("lastcat"), lastCategory);
      persist();
      EH.toast("✅ 已儲存", "success", 1500);

      if (keepOpen && !editingId) {
        cfg.fields.forEach((f) => { $("cf-" + f.key).value = ""; });
        $("cf-" + cfg.fields[0].key).focus();
      } else {
        closeForm();
      }
      renderCategoryOptions();
      renderItems();
    } catch (err) {
      EH.toast("儲存失敗：" + err.message, "error", 4000);
    }
  }

  async function remove(id) {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    if (!(await EH.confirm(`確定要刪除這筆${cfg.itemLabel}嗎？`, { danger: true, okText: "刪除" }))) return;
    try {
      await colRef().doc(id).delete();
      items = items.filter((x) => x.id !== id);
      persist();
      renderCategoryOptions();
      renderItems();
      EH.toast("🗑️ 已刪除", "success", 1500);
    } catch (err) {
      EH.toast("刪除失敗：" + err.message, "error", 4000);
    }
  }

  /* ============================== 備份 / 匯入 ============================== */

  function exportData() {
    if (items.length === 0) { EH.toast("目前沒有資料可以備份", "error"); return; }
    const list = items.map(({ id, createdAt, ...rest }) => rest);
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const a = document.createElement("a");
    a.setAttribute("href", "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(list, null, 2)));
    a.setAttribute("download", `english_hero_${cfg.collection}_${stamp}.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
    EH.toast(`💾 已備份 ${list.length} 筆`, "success");
  }

  function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arr = JSON.parse(e.target.result);
        if (!Array.isArray(arr)) { EH.toast("檔案格式錯誤！", "error"); return; }
        const valid = arr.filter((x) => x && (cfg.isValid ? cfg.isValid(x) : cfg.fields.filter((f) => f.required).every((f) => {
          const v = x[f.key];
          return Array.isArray(v) ? v.length > 0 : !!v;
        })));
        if (valid.length === 0) { EH.toast("檔案裡沒有可匯入的資料", "error"); return; }
        if (!(await EH.confirm(`確定要匯入 ${valid.length} 筆資料嗎？`))) { event.target.value = ""; return; }

        const created = [];
        for (let i = 0; i < valid.length; i += 400) {
          const batch = EH.db.batch();
          valid.slice(i, i + 400).forEach((x) => {
            const data = { category: x.category || "預設" };
            cfg.fields.forEach((f) => { data[f.key] = x[f.key] !== undefined ? x[f.key] : (f.type === "list" ? [] : ""); });
            const r = colRef().doc();
            created.push({ id: r.id, ...data, createdAt: Date.now() });
            batch.set(r, { ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
          });
          await batch.commit();
        }
        items.push(...created);
        persist();
        event.target.value = "";
        renderCategoryOptions();
        renderItems();
        EH.toast(`✅ 已匯入 ${created.length} 筆`, "success");
      } catch (err) {
        EH.toast("匯入失敗：" + err.message, "error", 4000);
      }
    };
    reader.readAsText(file);
  }

  /* ============================== 翻牌背誦 ============================== */

  const faceInner = (html) => `<div style="margin:auto 0; width:100%;">${html}</div>`;

  function startStudy() {
    const list = filtered();
    if (list.length === 0) {
      EH.toast("目前沒有可以背誦的項目", "error");
      return;
    }
    study = { list: [...list], index: 0, flipped: false, active: true };
    titleEl.textContent = `🎯 ${cfg.pageTitle}${category === "ALL" ? "" : "：" + category}`;
    renderStudyShell();
  }

  function renderStudyShell() {
    root.innerHTML = `
      <button class="btn btn-ghost btn-sm" onclick="cardsAct('exit')" style="margin-bottom:10px;">⬅️ 返回列表</button>
      <div class="progress"><span id="cs-progress"></span></div>
      <div class="study-meta"><span id="cs-count"></span><span class="tag tag-accent">${esc(category === "ALL" ? "全部分類" : category)}</span></div>

      <div class="flip-scene" id="cs-scene">
        <div class="flip-card" id="cs-card" style="height:340px;" onclick="cardsAct('flip')">
          <div class="flip-face flip-front" style="justify-content:flex-start; overflow-y:auto;">
            <div id="cs-front" style="margin:auto 0; width:100%;"></div>
            <div class="face-hint">點擊卡片或按空白鍵翻面</div>
          </div>
          <div class="flip-face flip-back" style="justify-content:flex-start; overflow-y:auto;">
            <div id="cs-back" style="margin:auto 0; width:100%;"></div>
          </div>
        </div>
      </div>

      <div class="study-controls">
        <button class="btn btn-secondary" onclick="cardsAct('prev')">⬅️ 上一張</button>
        <button class="btn btn-primary" onclick="cardsAct('flip')">🔄 翻面</button>
        <button class="btn btn-secondary" onclick="cardsAct('next')">下一張 ➡️</button>
      </div>

      <div class="study-judge hidden" id="cs-judge">
        <button class="btn btn-danger" onclick="cardsAct('judge', false)">❌ 不記得 <span class="kbd">1</span></button>
        <button class="btn btn-primary" onclick="cardsAct('judge', true)">✅ 記得 <span class="kbd">2</span></button>
      </div>

      <div class="study-tools">
        <button class="btn btn-ghost btn-sm" onclick="cardsAct('shuffle')">🔀 隨機排序</button>
        <button class="btn btn-ghost btn-sm" id="cs-reverse" onclick="cardsAct('reverse')">🔁 先看答案</button>
        <button class="btn btn-ghost btn-sm" onclick="cardsAct('speak')">🔊 唸</button>
      </div>
      <div class="kbd-hint">
        <span class="kbd">←</span> <span class="kbd">→</span> 換卡　
        <span class="kbd">空白</span> 翻面　<span class="kbd">S</span> 發音
      </div>`;

    const scene = $("cs-scene");
    let x0 = null;
    scene.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    scene.addEventListener("touchend", (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
    });
    refreshReverseButton();
    updateCard();
  }

  function refreshReverseButton() {
    const b = $("cs-reverse");
    if (b) b.classList.toggle("is-on", settings.reverse);
  }

  function updateCard() {
    const it = study.list[study.index];
    if (!it) return;
    const total = study.list.length;
    $("cs-count").textContent = `${study.index + 1} / ${total}`;
    $("cs-progress").style.width = `${((study.index + 1) / total) * 100}%`;

    const q = `<div class="face-word" style="font-size:28px;">${cfg.q(it)}</div>`;
    const a = `<div class="face-word" style="font-size:26px;">${cfg.a(it)}</div>`;
    const extra = cfg.extra ? `<div class="muted" style="margin-top:14px; line-height:1.8; word-break:break-word;">${cfg.extra(it)}</div>` : "";
    // 一般：正面題目、背面答案；「先看答案」：正面答案、背面題目
    $("cs-front").innerHTML = settings.reverse ? a : q;
    $("cs-back").innerHTML = (settings.reverse ? q : a) + extra;

    study.flipped = false;
    $("cs-card").classList.remove("is-flipped");
    $("cs-judge").classList.add("hidden");
  }

  function swap(applyFn) {
    const card = $("cs-card");
    if (study.flipped && card) {
      card.classList.remove("is-flipped");
      study.flipped = false;
      $("cs-judge").classList.add("hidden");
      setTimeout(applyFn, 170);
    } else {
      applyFn();
    }
  }

  function go(delta) {
    const n = study.list.length;
    if (!n) return;
    const next = (study.index + delta + n) % n;
    swap(() => { study.index = next; updateCard(); });
  }

  function flip() {
    const card = $("cs-card");
    if (!card) return;
    study.flipped = !study.flipped;
    card.classList.toggle("is-flipped", study.flipped);
    $("cs-judge").classList.toggle("hidden", !study.flipped);
  }

  function speakItem(id) {
    const it = id ? items.find((x) => x.id === id) : study.list[study.index];
    if (it && cfg.speak) EH.speak(cfg.speak(it));
  }

  async function judge(ok) {
    if (!study.list[study.index]) return;
    if (!dailyReady) dailyReady = EH.daily.load(uid);
    await dailyReady;
    const d = EH.daily.add(1);
    judged++;
    if (judged % 10 === 0) EH.daily.flush();
    if (d.reached) EH.toast(`🎉 達成今日目標（${EH.daily.goal()} 題）！`, "success", 3500);
    else EH.toast(ok ? "✅ 記得" : "❌ 再看一次", ok ? "success" : "info", 1000);
    go(1);
  }

  function exitStudy() {
    study.active = false;
    if (dailyReady) EH.daily.flush();
    renderList();
  }

  document.addEventListener("keydown", (e) => {
    if (!study.active || EH.modalOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target.tagName || "").toLowerCase();
    if (["input", "textarea", "select"].includes(tag)) return;
    const onButton = tag === "button";
    switch (e.key) {
      case "ArrowLeft": e.preventDefault(); go(-1); break;
      case "ArrowRight": e.preventDefault(); go(1); break;
      case " ":
      case "Enter":
        if (onButton) return;
        e.preventDefault();
        flip();
        break;
      case "s": case "S": speakItem(); break;
      case "1": if (study.flipped) judge(false); break;
      case "2": if (study.flipped) judge(true); break;
    }
  });
  window.addEventListener("pagehide", () => { if (dailyReady) EH.daily.flush(); });

  /* ============================== 動作分派（給畫面上的 onclick 用） ============================== */

  window.cardsAct = function (action, arg) {
    switch (action) {
      case "add": openForm(null); break;
      case "edit": openForm(items.find((x) => x.id === arg)); break;
      case "del": return remove(arg);
      case "speak": speakItem(arg); break;
      case "save": return save(false);
      case "saveMore": return save(true);
      case "closeForm": closeForm(); break;
      case "category": category = arg; renderItems(); break;
      case "search": query = arg; renderItems(); break;
      case "study": startStudy(); break;
      case "exit": exitStudy(); break;
      case "flip": flip(); break;
      case "prev": go(-1); break;
      case "next": go(1); break;
      case "judge": return judge(arg);
      case "shuffle": study.list = shuffle(study.list); study.index = 0; updateCard(); EH.toast("🔀 已隨機排序", "info", 1200); break;
      case "reverse":
        settings.reverse = !settings.reverse;
        EH.store.set(key("reverse"), settings.reverse);
        refreshReverseButton();
        updateCard();
        break;
      case "export": exportData(); break;
      case "import": importData(arg); break;
      case "sync":
        return load(true).then(() => { renderList(); EH.toast("✅ 已重新同步", "success", 1500); })
          .catch((err) => EH.toast("同步失敗：" + err.message, "error", 4000));
    }
  };

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("cards-form-backdrop")) closeForm();
  });

  /* ============================== 啟動 ============================== */

  EH.requireUser((user) => {
    uid = user.uid;
    load(false)
      .then(renderList)
      .catch((err) => {
        root.innerHTML = `<p style="color:var(--danger); text-align:center; padding:30px;">載入失敗：${esc(err.message)}</p>`;
      });
  });

  window.__EH_CARDS_READY = "3700";
};
