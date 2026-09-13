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
  if (!config) return;

  try {
    const response = await fetch(config.fileUrl);
    if (!response.ok) throw new Error("無法載入題庫檔案，請檢查路徑");
    const words = await response.json();

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
    alert(`成功加入「${config.folderName}」！`);
  } catch (err) {
    alert("加入題庫失敗：" + err.message);
  }
};
