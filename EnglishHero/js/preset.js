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

const PRESET_CONFIGS = {
  lungting_grade1_l4: {
    folderName: "📁 龍騰版高一第四課",
    fileUrl: "./JSON/lungting_grade1_l4.json"
  },
  lungting_grade1_l5: {
    folderName: "📁 龍騰版高一第五課",
    fileUrl: "./JSON/lungting_grade1_l5.json"
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

    if (!words || words.length === 0) {
      alert("此題庫檔案內容為空！");
      return;
    }

    if (!confirm(`確定要將「${config.folderName}」共 ${words.length} 個單字加入您的資料庫嗎？`)) {
      return;
    }

    const batch = db.batch();
    const userWordsRef = db.collection("users").doc(currentUser.uid).collection("words");

    words.forEach(w => {
      const newDocRef = userWordsRef.doc();
      batch.set(newDocRef, {
        en: w.en,
        pos: w.pos || "n.",
        ch: w.ch,
        folder: config.folderName
      });
    });

    await batch.commit();
    alert(`🎉 成功加入「${config.folderName}」！`);
  } catch (err) {
    console.error("載入 JSON 失敗：", err);
    alert(`加入題庫失敗：${err.message}\n(請確認專案根目錄是否有 JSON 資料夾以及對應的檔案)`);
  }
};
