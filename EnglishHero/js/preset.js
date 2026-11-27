const db = EH.db;
let currentUser = null;

const PRESET_CONFIGS = {
  lungting_grade1_l4: { folderName: "📖 龍騰版本/第四課", fileUrl: "./JSON/lungting_grade1_l4.json" },
  lungting_grade1_l5: { folderName: "📖 龍騰版本/第五課", fileUrl: "./JSON/lungting_grade1_l5.json" },
  lungting_grade1_l6: { folderName: "📖 龍騰版本/第六課", fileUrl: "./JSON/lungting_grade1_l6.json" },
  lungting_grade1_R2: { folderName: "📖 龍騰版本/複習二", fileUrl: "./JSON/lungting_grade1_R2.json" },
  junior_2000: { folderName: "📖 國中基礎2000單", fileUrl: "./JSON/junior_2000.json" },
  liveabc_sep: { folderName: "📚 LiveABC 9月份", fileUrl: "./JSON/liveabc_sep.json" },
  liveabc_nov: { folderName: "📚 LiveABC 11月份", fileUrl: "./JSON/liveabc_nov.json" },
  liveabc_dec: { folderName: "📚 LiveABC 12月號", fileUrl: "./JSON/liveabc_dec.json" },
  high_frequency_unit7: { folderName: "📖 高頻單字/Unit 7", fileUrl: "./JSON/high_frequency_unit7.json" },
  high_frequency_unit8: { folderName: "📖 高頻單字/Unit 8", fileUrl: "./JSON/high_frequency_unit8.json" },
  high_frequency_unit9: { folderName: "📖 高頻單字/Unit 9", fileUrl: "./JSON/high_frequency_unit9.json" },
};

// 單字所屬資料夾：有 unit → 「主資料夾/單元名稱」，沒有 → 主資料夾
const cleanUnit = (u) => String(u || "").replace(/\//g, "-").trim();
function targetFolder(parent, w) {
  const unit = cleanUnit(w.unit);
  return unit ? `${parent}/${unit}` : parent;
}
// 這個題庫（含子資料夾）是否已存在
const inPreset = (folder, parent) => folder === parent || (folder || "").startsWith(parent + "/");

EH.requireUser((user) => {
  currentUser = user;
  markImported();
});

function markImported() {
  const words = currentUser ? EH.cache.peek(currentUser.uid) : null;
  const folders = (words || []).map((w) => w.folder);
  document.querySelectorAll(".preset-card[data-preset]").forEach((card) => {
    const cfg = PRESET_CONFIGS[card.dataset.preset];
    const badge = card.querySelector(".preset-badge");
    if (cfg && badge) badge.classList.toggle("hidden", !folders.some((f) => inPreset(f, cfg.folderName)));
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

    const valid = words.filter((w) => w && w.en && w.ch);
    const units = new Set(valid.map((w) => cleanUnit(w.unit)).filter(Boolean));
    const unitNote = units.size ? `，分成 ${units.size} 個單元子資料夾` : "";
    if (!(await EH.confirm(`確定要將「${config.folderName}」共 ${valid.length} 個單字加入您的資料庫嗎？${unitNote}`))) return;

    const ref = db.collection("users").doc(currentUser.uid).collection("words");

    // 避免重複匯入：先看本機快取，沒有再用查詢確認（含子資料夾）
    let already = (EH.cache.peek(currentUser.uid) || []).some((w) => inPreset(w.folder, config.folderName));
    if (!already) {
      const prefix = config.folderName + "/";
      const [a, b] = await Promise.all([
        ref.where("folder", "==", config.folderName).limit(1).get(),
        ref.where("folder", ">=", prefix).where("folder", "<", prefix + "\uf8ff").limit(1).get()
      ]);
      already = !a.empty || !b.empty;
    }
    if (already && !(await EH.confirm("這個題庫已經加入過了，確定要再加一次嗎？\n（會產生重複單字）"))) return;

    if (btn) { btn.disabled = true; btn.textContent = "加入中..."; }

    const created = [];
    for (let i = 0; i < valid.length; i += 400) {
      const batch = db.batch();
      valid.slice(i, i + 400).forEach((w) => {
        const folder = targetFolder(config.folderName, w);
        const r = ref.doc();
        created.push({ id: r.id, en: w.en, pos: w.pos || "", ch: w.ch, folder, createdAt: Date.now() });
        batch.set(r, {
          en: w.en,
          pos: w.pos || "",
          ch: w.ch,
          folder,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });
      await batch.commit();
    }

    EH.cache.append(currentUser.uid, created);
    EH.toast(`🎉 已加入「${config.folderName}」共 ${created.length} 個單字`, "success", 3500);
    markImported();
  } catch (err) {
    console.error("載入 JSON 失敗：", err);
    EH.toast(`加入題庫失敗：${err.message}`, "error", 5000);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "➕ 加入題庫"; }
  }
};
