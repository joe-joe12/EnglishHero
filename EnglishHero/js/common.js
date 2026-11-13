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

  // 是否要求「信箱驗證後才能使用」。要暫時關閉驗證功能，把下面改成 false 即可。
  EH.REQUIRE_VERIFIED = true;

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
    EH.auth.onAuthStateChanged(async (user) => {
      if (!user) {
        window.location.replace("login.html?v=3500");
        return;
      }
      // 信箱尚未驗證：先向伺服器更新一次狀態（可能剛在別的分頁 / 手機點完驗證信），還是沒驗證就導去驗證頁
      if (EH.REQUIRE_VERIFIED && !user.emailVerified) {
        try { await user.reload(); } catch (e) { /* 忽略，沿用目前狀態 */ }
        if (!user.emailVerified) {
          window.location.replace("verify.html?v=3500");
          return;
        }
      }
      cb(user);
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

  // ---------- 本機快取（大幅減少 Firestore 讀取次數） ----------
  // 第一次載入：讀取全部資料並存在本機。之後每次只查「新增的」；
  // 本機的新增 / 修改 / 刪除會同步更新快取。超過 24 小時或按「重新同步」才會完整重讀。
  // 單字用 EH.cache；其他資料集合（句型、用字改變…）用 EH.collection("名稱")
  const FULL_REFRESH_MS = 24 * 60 * 60 * 1000;
  const SYNC_MARGIN_MS = 5 * 60 * 1000; // 往前多抓 5 分鐘，避免裝置時間誤差漏掉新資料
  const CACHE_PREFIXES = ["eh_words_v1_", "eh_patterns_v1_", "eh_swaps_v1_", "eh_srs_v1_", "eh_daily_v1_"];

  function toMillis(v) {
    if (v && typeof v.toMillis === "function") return v.toMillis();
    return typeof v === "number" ? v : 0;
  }
  function normalizeDoc(doc) { // 單字
    const d = doc.data();
    return { id: doc.id, en: d.en || "", pos: d.pos || "", ch: d.ch || "", folder: d.folder || "未分類", createdAt: toMillis(d.createdAt) };
  }
  function normalizeGeneric(doc) { // 其他集合：保留所有欄位
    const d = doc.data();
    return { ...d, id: doc.id, createdAt: toMillis(d.createdAt) };
  }

  function makeCache(name, normalize) {
    const prefix = `eh_${name}_v1_`;
    const read = (uid) => {
      try {
        const raw = localStorage.getItem(prefix + uid);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    };
    const write = (uid, data) => {
      try {
        localStorage.setItem(prefix + uid, JSON.stringify(data));
      } catch (e) {
        // 空間不足就放棄快取（之後每次完整讀取，功能不受影響）
        try { localStorage.removeItem(prefix + uid); } catch (e2) { /* 忽略 */ }
      }
    };

    const api = {
      // 只看本機快取，不連線
      peek(uid) {
        const c = read(uid);
        return c ? c.words : null;
      },

      // 取得全部資料：優先用快取，只向 Firestore 補抓新增的
      async getWords(uid, opts = {}) {
        const col = EH.db.collection("users").doc(uid).collection(name);
        const now = Date.now();
        const c = read(uid);
        const needFull = !c || opts.force || !c.fullAt || now - c.fullAt > FULL_REFRESH_MS;

        if (needFull) {
          const snap = await col.get();
          const words = [];
          snap.forEach((doc) => words.push(normalize(doc)));
          write(uid, { words, syncedAt: now, fullAt: now });
          return words;
        }

        try {
          const since = firebase.firestore.Timestamp.fromMillis(Math.max(0, c.syncedAt - SYNC_MARGIN_MS));
          const snap = await col.where("createdAt", ">", since).get();
          const map = new Map(c.words.map((w) => [w.id, w]));
          snap.forEach((doc) => map.set(doc.id, normalize(doc)));
          const words = Array.from(map.values());
          write(uid, { words, syncedAt: now, fullAt: c.fullAt });
          return words;
        } catch (e) {
          console.warn("增量同步失敗，改用本機快取：", e);
          return c.words;
        }
      },

      // 本機做了新增：把新資料加進快取
      append(uid, newWords) {
        const c = read(uid);
        if (!c) return;
        const map = new Map(c.words.map((w) => [w.id, w]));
        newWords.forEach((w) => map.set(w.id, w));
        write(uid, { ...c, words: Array.from(map.values()) });
      },

      // 本機做了修改 / 刪除 / 搬移：用目前完整的清單覆蓋快取
      replaceAll(uid, words) {
        const c = read(uid);
        const now = Date.now();
        write(uid, { words, syncedAt: c ? c.syncedAt : now, fullAt: c ? c.fullAt : now });
      },

      // 登出時清除所有快取與進度（共用裝置的隱私）
      clearAll() {
        try {
          Object.keys(localStorage)
            .filter((k) => CACHE_PREFIXES.some((p) => k.startsWith(p)))
            .forEach((k) => localStorage.removeItem(k));
        } catch (e) { /* 忽略 */ }
      }
    };
    api.getAll = api.getWords;
    return api;
  }

  EH.cache = makeCache("words", normalizeDoc);

  const _collections = {};
  EH.collection = (name) => _collections[name] || (_collections[name] = makeCache(name, normalizeGeneric));

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

  // ---------- 每日目標與連續天數 ----------
  // 每答一題（考單字、背單字按「記得 / 不記得」）就算今天練習 1 題。
  // 連續天數 = 連續幾天「至少練習 1 題」；今天還沒練習不會中斷，要到明天才會歸零。
  // 資料先存本機，並同步一份到 users/{uid}/meta/daily（讀一次、寫一次，非常省額度）
  const DAILY_LOCAL = "eh_daily_v1_";
  const emptyDaily = () => ({ goal: 20, goalT: 0, days: {} });

  function dailyStreak(days) {
    let d = dayNow();
    if (!(days[d] > 0)) d--; // 今天還沒練習：從昨天開始算
    let n = 0;
    while (days[d] > 0) { n++; d--; }
    return n;
  }

  EH.daily = {
    DEFAULT_GOAL: 20,
    uid: null,
    data: emptyDaily(),
    dirtyDays: new Set(),
    goalDirty: false,

    _read(uid) {
      const d = EH.store.get(DAILY_LOCAL + uid, null);
      if (!d || typeof d !== "object") return emptyDaily();
      return { goal: d.goal || 20, goalT: d.goalT || 0, days: d.days || {} };
    },
    _saveLocal() {
      if (!this.uid) return;
      const t = dayNow();
      const days = {};
      Object.keys(this.data.days).forEach((k) => { if (t - Number(k) <= 90) days[k] = this.data.days[k]; });
      this.data.days = days; // 只保留最近 90 天
      EH.store.set(DAILY_LOCAL + this.uid, this.data);
    },

    loadLocal(uid) {
      this.uid = uid;
      this.data = this._read(uid);
      return this.data;
    },

    // 本機 + 雲端合併：每天取較大的次數，目標取「較晚設定」的
    async load(uid) {
      this.loadLocal(uid);
      try {
        const doc = await EH.db.collection("users").doc(uid).collection("meta").doc("daily").get();
        const r = doc.exists ? doc.data() : {};
        const rdays = r.days || {};
        Object.keys(rdays).forEach((k) => {
          const rc = Number(rdays[k]) || 0;
          if (rc > (this.data.days[k] || 0)) this.data.days[k] = rc;
        });
        Object.keys(this.data.days).forEach((k) => {
          if ((this.data.days[k] || 0) > (Number(rdays[k]) || 0)) this.dirtyDays.add(k);
        });
        if ((r.goalT || 0) > this.data.goalT) { this.data.goal = r.goal || 20; this.data.goalT = r.goalT; }
        else if (this.data.goalT > (r.goalT || 0)) this.goalDirty = true;
        this._saveLocal();
      } catch (e) {
        console.warn("讀取每日進度失敗，先使用本機資料：", e);
      }
      return this.data;
    },

    count() { return this.data.days[dayNow()] || 0; },
    goal() { return this.data.goal || 20; },
    streak() { return dailyStreak(this.data.days); },

    // 答一題。reached=true 代表「這一題剛好達成今日目標」
    add(n = 1) {
      const t = String(dayNow());
      const before = this.data.days[t] || 0;
      this.data.days[t] = before + n;
      this.dirtyDays.add(t);
      this._saveLocal();
      const g = this.goal();
      return { count: before + n, reached: before < g && before + n >= g };
    },

    setGoal(g) {
      this.data.goal = g;
      this.data.goalT = Date.now();
      this.goalDirty = true;
      this._saveLocal();
    },

    // 首頁用：只看本機，不連線
    peek(uid) {
      const d = this._read(uid);
      return { goal: d.goal || 20, count: d.days[dayNow()] || 0, streak: dailyStreak(d.days) };
    },

    async flush() {
      if (!this.uid || (this.dirtyDays.size === 0 && !this.goalDirty)) return;
      const payload = { goal: this.data.goal, goalT: this.data.goalT };
      const keys = Array.from(this.dirtyDays);
      if (keys.length) {
        payload.days = {};
        keys.forEach((k) => { payload.days[k] = this.data.days[k]; });
      }
      try {
        await EH.db.collection("users").doc(this.uid).collection("meta").doc("daily").set(payload, { merge: true });
        keys.forEach((k) => this.dirtyDays.delete(k));
        this.goalDirty = false;
      } catch (e) {
        console.warn("上傳每日進度失敗，稍後再試：", e);
      }
    }
  };

  // 一次上傳「複習進度」與「每日進度」
  EH.flushProgress = () => Promise.all([EH.srs.flush(), EH.daily.flush()]);
})();
