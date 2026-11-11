// 全站共用工具：Firebase 初始化、提示訊息、對話框、深色模式、發音、統計
// 只對外暴露 window.EH，不會和各頁面的變數名稱衝突
(function () {
  "use strict";

  const firebaseConfig = {
    apiKey: "AIzaSyA4bbUoXHi29YAjCgYrnuYRhZJ8_JEtalc",
    authDomain: "englishhero-d58c6.firebaseapp.com",
    projectId: "englishhero-d58c6",
    storageBucket: "englishhero-d58c6.firebasestorage.app",
    messagingSenderId: "437927020009",
    appId: "1:437927020009:web:30e18c99cfeec8ef4ef778",
    measurementId: "G-TZTCS02SK6"
  };

  const hasFb = typeof firebase !== "undefined";
  if (hasFb && !firebase.apps.length) firebase.initializeApp(firebaseConfig);

  const EH = (window.EH = {});

  EH.PLACEHOLDER = "___placeholder___";
  EH.LEARNED = "📦 已經背過的單字";
  EH.MISTAKES = "❌ 錯題本";
  EH.auth = hasFb && typeof firebase.auth === "function" ? firebase.auth() : null;
  EH.db = hasFb && typeof firebase.firestore === "function" ? firebase.firestore() : null;

  // ---------- 小工具 ----------
  EH.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
  // 給 inline onclick 的參數用（可安全包含引號）
  EH.jsArg = (v) => EH.esc(JSON.stringify(v));
  EH.wordKey = (w) => String(w.en).trim().toLowerCase() + "|" + String(w.ch).trim();
  EH.shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  EH.store = {
    get(key, fallback = null) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 忽略 */ }
    }
  };

  // ---------- 登入保護 ----------
  EH.requireUser = (cb) => {
    EH.auth.onAuthStateChanged((user) => {
      if (user) cb(user);
      else window.location.replace("login.html?v=3000");
    });
  };

  // ---------- 提示訊息 ----------
  EH.toast = (msg, type = "info", ms = 2600) => {
    let box = document.getElementById("eh-toasts");
    if (!box) {
      box = document.createElement("div");
      box.id = "eh-toasts";
      document.body.appendChild(box);
    }
    const t = document.createElement("div");
    t.className = "eh-toast " + type;
    t.textContent = msg;
    box.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => t.remove(), 250);
    }, ms);
  };

  // ---------- 對話框（取代 alert / confirm / prompt） ----------
  EH.modalOpen = () => !!document.querySelector(".eh-modal-backdrop");

  function openDialog({ message, input = false, defaultValue = "", okText = "確定", cancelText = "取消", danger = false }) {
    return new Promise((resolve) => {
      const root = document.createElement("div");
      root.className = "eh-modal-backdrop";
      root.innerHTML = `
        <div class="eh-modal" role="dialog" aria-modal="true">
          <div class="eh-modal-msg"></div>
          ${input ? '<input type="text" class="eh-modal-input" autocomplete="off">' : ""}
          <div class="eh-modal-actions">
            ${cancelText === null ? "" : '<button type="button" class="btn btn-ghost" data-act="cancel"></button>'}
            <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" data-act="ok"></button>
          </div>
        </div>`;
      root.querySelector(".eh-modal-msg").textContent = message;
      root.querySelector('[data-act="ok"]').textContent = okText;
      const cancelBtn = root.querySelector('[data-act="cancel"]');
      if (cancelBtn) cancelBtn.textContent = cancelText;
      const inputEl = root.querySelector(".eh-modal-input");
      if (inputEl) inputEl.value = defaultValue;
      document.body.appendChild(root);

      const finish = (ok) => {
        document.removeEventListener("keydown", onKey, true);
        const value = inputEl ? inputEl.value : null;
        root.remove();
        resolve(input ? (ok ? value : null) : ok);
      };
      const onKey = (e) => {
        if (e.key === "Escape") { e.preventDefault(); finish(false); }
        else if (e.key === "Enter") { e.preventDefault(); finish(true); }
      };
      document.addEventListener("keydown", onKey, true);
      root.addEventListener("click", (e) => {
        if (e.target === root) finish(false);
        const act = e.target.dataset && e.target.dataset.act;
        if (act === "ok") finish(true);
        if (act === "cancel") finish(false);
      });
      (inputEl || root.querySelector('[data-act="ok"]')).focus();
      if (inputEl) inputEl.select();
    });
  }

  EH.confirm = (message, opts = {}) => openDialog({ message, ...opts });
  EH.prompt = (message, defaultValue = "") => openDialog({ message, input: true, defaultValue });
  EH.alert = (message) => openDialog({ message, cancelText: null });

  // ---------- 發音 ----------
  EH.speak = (text) => {
    if (!text) return;
    if (!("speechSynthesis" in window)) {
      EH.toast("您的瀏覽器不支援語音朗讀功能", "error");
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  };

  // ---------- 深色模式 ----------
  const currentTheme = () => document.documentElement.dataset.theme || "light";
  EH.toggleTheme = () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    EH.store.set("eh_theme", next);
    const btn = document.getElementById("btn-theme");
    if (btn) btn.textContent = next === "dark" ? "☀️" : "🌙";
  };

  function injectThemeButton() {
    const panel = document.querySelector(".user-panel");
    if (!panel || document.getElementById("btn-theme")) return;
    const btn = document.createElement("button");
    btn.id = "btn-theme";
    btn.type = "button";
    btn.className = "btn btn-ghost btn-sm btn-icon";
    btn.title = "切換深色 / 淺色模式";
    btn.textContent = currentTheme() === "dark" ? "☀️" : "🌙";
    btn.addEventListener("click", EH.toggleTheme);
    panel.prepend(btn);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", injectThemeButton);
  else injectThemeButton();

  // ---------- 首頁統計（由背單字頁 / 測驗頁寫入，首頁讀取，不額外耗用 Firestore 讀取次數） ----------
  EH.saveStats = (words) => {
    const real = words.filter((w) => w.en !== EH.PLACEHOLDER);
    const library = real.filter((w) => w.folder !== EH.LEARNED && w.folder !== EH.MISTAKES);
    const learned = real.filter((w) => w.folder === EH.LEARNED);
    const folders = new Set(library.map((w) => (w.folder || "").split("/")[0]));
    EH.store.set("eh_stats", {
      total: library.length,
      learned: learned.length,
      folders: folders.size
    });
  };

  // ---------- 單字本機快取（大幅減少 Firestore 讀取次數） ----------
  // 第一次載入：讀取全部單字並存在本機。之後每次只查「新增的單字」；
  // 本機的新增 / 修改 / 刪除會同步更新快取。超過 24 小時或按「重新同步」才會完整重讀。
  const CACHE_PREFIX = "eh_words_v1_";
  const FULL_REFRESH_MS = 24 * 60 * 60 * 1000;
  const SYNC_MARGIN_MS = 5 * 60 * 1000; // 往前多抓 5 分鐘，避免裝置時間誤差漏掉新單字

  function cacheRead(uid) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + uid);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function cacheWrite(uid, data) {
    try {
      localStorage.setItem(CACHE_PREFIX + uid, JSON.stringify(data));
    } catch (e) {
      // 空間不足就放棄快取（之後每次完整讀取，功能不受影響）
      try { localStorage.removeItem(CACHE_PREFIX + uid); } catch (e2) { /* 忽略 */ }
    }
  }
  function normalizeDoc(doc) {
    const d = doc.data();
    let t = 0;
    if (d.createdAt && typeof d.createdAt.toMillis === "function") t = d.createdAt.toMillis();
    else if (typeof d.createdAt === "number") t = d.createdAt;
    return { id: doc.id, en: d.en || "", pos: d.pos || "", ch: d.ch || "", folder: d.folder || "未分類", createdAt: t };
  }

  EH.cache = {
    // 只看本機快取，不連線
    peek(uid) {
      const c = cacheRead(uid);
      return c ? c.words : null;
    },

    // 取得全部單字：優先用快取，只向 Firestore 補抓新增的
    async getWords(uid, opts = {}) {
      const col = EH.db.collection("users").doc(uid).collection("words");
      const now = Date.now();
      const c = cacheRead(uid);
      const needFull = !c || opts.force || !c.fullAt || now - c.fullAt > FULL_REFRESH_MS;

      if (needFull) {
        const snap = await col.get();
        const words = [];
        snap.forEach((doc) => words.push(normalizeDoc(doc)));
        cacheWrite(uid, { words, syncedAt: now, fullAt: now });
        return words;
      }

      try {
        const since = firebase.firestore.Timestamp.fromMillis(Math.max(0, c.syncedAt - SYNC_MARGIN_MS));
        const snap = await col.where("createdAt", ">", since).get();
        const map = new Map(c.words.map((w) => [w.id, w]));
        snap.forEach((doc) => map.set(doc.id, normalizeDoc(doc)));
        const words = Array.from(map.values());
        cacheWrite(uid, { words, syncedAt: now, fullAt: c.fullAt });
        return words;
      } catch (e) {
        console.warn("增量同步失敗，改用本機快取：", e);
        return c.words;
      }
    },

    // 本機做了新增：把新單字加進快取
    append(uid, newWords) {
      const c = cacheRead(uid);
      if (!c) return;
      const map = new Map(c.words.map((w) => [w.id, w]));
      newWords.forEach((w) => map.set(w.id, w));
      cacheWrite(uid, { ...c, words: Array.from(map.values()) });
    },

    // 本機做了修改 / 刪除 / 搬移：用目前完整的單字清單覆蓋快取
    replaceAll(uid, words) {
      const c = cacheRead(uid);
      const now = Date.now();
      cacheWrite(uid, {
        words,
        syncedAt: c ? c.syncedAt : now,
        fullAt: c ? c.fullAt : now
      });
    },

    // 登出時清除（共用裝置的隱私）
    clearAll() {
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith(CACHE_PREFIX) || k.startsWith("eh_srs_v1_"))
          .forEach((k) => localStorage.removeItem(k));
      } catch (e) { /* 忽略 */ }
    }
  };

  // ---------- 間隔複習（Leitner 盒子法） ----------
  // 每個單字記錄：b=階段(0~5)、d=下次複習日(第幾天)、c=第一次考的日期、t=最後更新時間
  // 答錯 → 回到階段 0，明天再考；答對 → 升一階，隔 2、4、8、16、32 天再出現
  // 進度存在 users/{uid}/meta/srs 這一份文件（讀一次、寫一次，非常省額度），並同步一份在本機
  const SRS_INTERVALS = [1, 2, 4, 8, 16, 32];
  const SRS_LOCAL = "eh_srs_v1_";
  const dayNow = () => {
    const d = new Date();
    return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
  };
  // 把「英文|中文」轉成短而安全的 key（不含特殊字元，可當 Firestore 欄位名稱）
  function cyrb53(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }
  const srsKey = (w) => "w" + cyrb53(String(w.en).trim().toLowerCase() + "|" + String(w.ch).trim()).toString(36);

  EH.srs = {
    INTERVALS: SRS_INTERVALS,
    today: dayNow,
    key: srsKey,
    items: {},
    uid: null,
    dirty: new Set(),

    _saveLocal() {
      if (this.uid) EH.store.set(SRS_LOCAL + this.uid, this.items);
    },

    // 載入進度：本機 + 雲端，兩邊取「較新」的
    async load(uid) {
      this.uid = uid;
      this.items = EH.store.get(SRS_LOCAL + uid, {}) || {};
      try {
        const doc = await EH.db.collection("users").doc(uid).collection("meta").doc("srs").get();
        const remote = doc.exists ? (doc.data().items || {}) : {};
        Object.keys(remote).forEach((k) => {
          const l = this.items[k];
          if (!l || (remote[k].t || 0) > (l.t || 0)) this.items[k] = remote[k];
        });
        // 本機比雲端新（或雲端沒有）的，稍後補上傳
        Object.keys(this.items).forEach((k) => {
          const r = remote[k];
          if (!r || (this.items[k].t || 0) > (r.t || 0)) this.dirty.add(k);
        });
        this._saveLocal();
      } catch (e) {
        console.warn("讀取複習進度失敗，先使用本機資料：", e);
      }
      return this.items;
    },

    get(w) { return this.items[srsKey(w)] || null; },
    isNew(w) { return !this.items[srsKey(w)]; },
    isDue(w) {
      const it = this.items[srsKey(w)];
      return !!it && it.d <= dayNow();
    },
    // 今天已經「第一次考」的新單字數（用來限制每天的新單字量）
    newToday() {
      const t = dayNow();
      return Object.values(this.items).filter((it) => it.c === t).length;
    },
    // 首頁用：只看本機資料，不連線
    localDueCount(uid) {
      const items = EH.store.get(SRS_LOCAL + uid, {}) || {};
      const t = dayNow();
      return Object.values(items).filter((it) => it.d <= t).length;
    },
    localHasAny(uid) {
      const items = EH.store.get(SRS_LOCAL + uid, {}) || {};
      return Object.keys(items).length > 0;
    },

    // 記錄一次作答。回傳 false 代表這次沒有更新（還沒到期就答對，不提早升級）
    record(w, correct) {
      const k = srsKey(w);
      const it = this.items[k];
      const t0 = dayNow();
      if (correct) {
        if (it && it.d > t0) return false;
        const b = Math.min((it ? it.b : 0) + 1, SRS_INTERVALS.length - 1);
        this.items[k] = { b, d: t0 + SRS_INTERVALS[b], c: it ? it.c : t0, t: Date.now() };
      } else {
        this.items[k] = { b: 0, d: t0 + SRS_INTERVALS[0], c: it ? it.c : t0, t: Date.now() };
      }
      this.dirty.add(k);
      this._saveLocal();
      return true;
    },

    // 單字的英文或中文被修改：把舊的複習進度複製給新的單字
    rename(oldW, newW) {
      const ok = srsKey(oldW), nk = srsKey(newW);
      if (ok === nk) return;
      const it = this.items[ok];
      if (!it || this.items[nk]) return;
      this.items[nk] = { ...it, t: Date.now() };
      this.dirty.add(nk);
      this._saveLocal();
    },

    // 把尚未上傳的進度寫到雲端（只傳有變動的）
    async flush() {
      if (!this.uid || this.dirty.size === 0) return;
      const keys = Array.from(this.dirty);
      const payload = {};
      keys.forEach((k) => { payload[k] = this.items[k]; });
      try {
        await EH.db.collection("users").doc(this.uid).collection("meta").doc("srs")
          .set({ items: payload }, { merge: true });
        keys.forEach((k) => this.dirty.delete(k));
      } catch (e) {
        console.warn("上傳複習進度失敗，稍後再試：", e);
      }
    }
  };
})();
