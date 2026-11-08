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

let currentUser = null;

auth.onAuthStateChanged((user) => {
  if (user) {
    currentUser = user;
  } else {
    window.location.replace("login.html?v=2101");
  }
});

// 注意：fileUrl 的資料夾名稱 JSON 在 GitHub Pages 等區分大小寫的主機上必須與實際資料夾完全一致
const PRESET_CONFIGS = {
  lungting_grade1_l4: {
    folderName: "📁 龍騰版高一第四課",
    fileUrl: "./JSON/lungting_grade1_l4.json"
  },
  lungting_grade1_l5: {
    folderName: "📁 龍騰版高一第五課",
    fileUrl: "./JSON/lungting_grade1_l5.json"
  },
  lungting_grade1_l6: {
    folderName: "📁 龍騰版高一第六課",
    fileUrl: "./JSON/lungting_grade1_l6.json"
  },
  junior_2000: {
    folderName: "📖 國中基礎2000單",
    fileUrl: "./JSON/junior_2000.json"
  },
  cap_exam: {
    folderName: "🔥 國中會考高頻單",
    fileUrl: "./JSON/cap.json"
  },
  liveabc_sep: {
    folderName: "📚 LiveABC 9月份",
    fileUrl: "./JSON/liveabc_sep.json"
  }
};

window.importPreset = async function(presetKey) {
  if (!currentUser) {
    alert("登入狀態還在確認中，請稍後再試（或請先登入）。");
    return;
  }

  const config = PRESET_CONFIGS[presetKey];
  if (!config) {
    alert("找不到對應的題庫設定！");
    return;
  }

  try {
    const response = await fetch(config.fileUrl);
    if (!response.ok) {
      throw new Error(`HTTP 錯誤！狀態碼：${response.status}，請檢查檔案路徑是否正確。`);
    }
    const words = await response.json();

    if (!Array.isArray(words) || words.length === 0) {
      alert("此題庫檔案內容為空或格式不正確！");
      return;
    }

    if (!confirm(`確定要將「${config.folderName}」共 ${words.length} 個單字加入您的資料庫嗎？`)) {
      return;
    }

    const userWordsRef = db.collection("users").doc(currentUser.uid).collection("words");

    // 檢查是否已經匯入過同名題庫，避免重複堆積
    const dup = await userWordsRef.where("folder", "==", config.folderName).limit(1).get();
    if (!dup.empty && !confirm("這個題庫已經加入過了，確定要再加一次嗎？（會產生重複單字）")) {
      return;
    }

    // 分批寫入 (每 400 筆為一個 Batch)，避免觸發 Firestore 500 筆上限限制
    const BATCH_SIZE = 400;
    let added = 0;
    for (let i = 0; i < words.length; i += BATCH_SIZE) {
      const chunk = words.slice(i, i + BATCH_SIZE);
      const batch = db.batch();

      chunk.forEach(w => {
        if (!w || !w.en || !w.ch) return; // 略過不完整的資料
        const newDocRef = userWordsRef.doc();
        batch.set(newDocRef, {
          en: w.en,
          pos: w.pos || "",
          ch: w.ch,
          folder: config.folderName,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        added++;
      });

      await batch.commit();
    }

    alert(`🎉 成功加入「${config.folderName}」共 ${added} 個單字！`);
  } catch (err) {
    console.error("載入 JSON 失敗：", err);
    alert(`加入題庫失敗：${err.message}\n(請確認專案根目錄是否有 JSON 資料夾以及對應的檔案)`);
  }
};
