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
})();
