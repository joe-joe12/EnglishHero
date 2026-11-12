const db = EH.db;
let currentUser = null;

// 注意：fileUrl 的資料夾名稱 JSON 在 GitHub Pages 等區分大小寫的主機上必須與實際資料夾完全一致
const PRESET_CONFIGS = {
  lungting_grade1_l4: { folderName: "📁 龍騰版高一第四課", fileUrl: "./JSON/lungting_grade1_l4.json" },
  lungting_grade1_l5: { folderName: "📁 龍騰版高一第五課", fileUrl: "./JSON/lungting_grade1_l5.json" },
  lungting_grade1_l6: { folderName: "📁 龍騰版高一第六課", fileUrl: "./JSON/lungting_grade1_l6.json" },
  junior_2000: { folderName: "📖 國中基礎2000單", fileUrl: "./JSON/junior_2000.json" },
  cap_exam: { folderName: "🔥 國中會考高頻單", fileUrl: "./JSON/cap.json" },
  liveabc_sep: { folderName: "📚 LiveABC 9月份", fileUrl: "./JSON/liveabc_sep.json" },
  liveabc_nov: { folderName: "📚 LiveABC 11月份", fileUrl: "./JSON/liveabc_nov.json" }
};

EH.requireUser((user) => {
  currentUser = user;
  markImported();
});

// 依本機快取，標出已經加入過的題庫（沒有快取時不顯示，不額外讀取資料庫）
function markImported() {
  const words = currentUser ? EH.cache.peek(currentUser.uid) : null;
  const folders = new Set((words || []).map((w) => w.folder));
  document.querySelectorAll(".preset-card[data-preset]").forEach((card) => {
    const cfg = PRESET_CONFIGS[card.dataset.preset];
    const badge = card.querySelector(".preset-badge");
    if (cfg && badge) badge.classList.toggle("hidden", !folders.has(cfg.folderName));
  });
}

window.importPreset = async function (presetKey) {
  if (!currentUser) {
    EH.toast("登入狀態還在確認中，請稍後再試", "error");
    return;
  }
  const config = PRESET_CONFIGS[presetKey];
  if (!config) {
    EH.toast("找不到對應的題庫設定！", "error");
    return;
  }

  const btn = document.querySelector(`.preset-card[data-preset="${presetKey}"] button`);
  try {
    const response = await fetch(config.fileUrl);
    if (!response.ok) {
      throw new Error(`HTTP 錯誤！狀態碼：${response.status}，請檢查檔案路徑是否正確。`);
    }
    const words = await response.json();
    if (!Array.isArray(words) || words.length === 0) {
      EH.toast("此題庫檔案內容為空或格式不正確！", "error");
      return;
    }

    if (!(await EH.confirm(`確定要將「${config.folderName}」共 ${words.length} 個單字加入您的資料庫嗎？`))) return;

    const ref = db.collection("users").doc(currentUser.uid).collection("words");

    // 避免重複匯入：先看本機快取，沒有再用查詢確認
    let already = new Set((EH.cache.peek(currentUser.uid) || []).map((w) => w.folder)).has(config.folderName);
    if (!already) {
      const dup = await ref.where("folder", "==", config.folderName).limit(1).get();
      already = !dup.empty;
    }
    if (already && !(await EH.confirm("這個題庫已經加入過了，確定要再加一次嗎？\n（會產生重複單字）"))) return;

    if (btn) { btn.disabled = true; btn.textContent = "加入中..."; }

    // 分批寫入 (每 400 筆為一個 Batch)，避免觸發 Firestore 500 筆上限
    const created = [];
    for (let i = 0; i < words.length; i += 400) {
      const batch = db.batch();
      words.slice(i, i + 400).forEach((w) => {
        if (!w || !w.en || !w.ch) return; // 略過不完整的資料
        const r = ref.doc();
        created.push({ id: r.id, en: w.en, pos: w.pos || "", ch: w.ch, folder: config.folderName, createdAt: Date.now() });
        batch.set(r, {
          en: w.en,
          pos: w.pos || "",
          ch: w.ch,
          folder: config.folderName,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });
      await batch.commit();
    }

    EH.cache.append(currentUser.uid, created); // 同步更新本機快取，背單字頁立刻看得到
    EH.toast(`🎉 已加入「${config.folderName}」共 ${created.length} 個單字`, "success", 3500);
    markImported();
  } catch (err) {
    console.error("載入 JSON 失敗：", err);
    EH.toast(`加入題庫失敗：${err.message}`, "error", 5000);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "➕ 加入題庫"; }
  }
};
