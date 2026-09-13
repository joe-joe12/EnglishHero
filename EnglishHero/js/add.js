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

const folderSelect = document.getElementById("folder-select");
const newFolderGroup = document.getElementById("new-folder-group");
const newFolderInput = document.getElementById("new-folder-input");
const btnToggleNewFolder = document.getElementById("btn-toggle-new-folder");
const btnCancelNewFolder = document.getElementById("btn-cancel-new-folder");
const addForm = document.getElementById("add-word-form");
const msgEl = document.getElementById("add-msg");
const btnAutoTranslate = document.getElementById("btn-auto-translate");

// 內建常用單字快查庫（100% 成功、0秒秒查，你隨時可以在這裡自由新增更多單字！）
const localDictionary = {
  "apple": { ch: "蘋果", pos: "n." },
  "banana": { ch: "香蕉", pos: "n." },
  "book": { ch: "書本", pos: "n." },
  "cat": { ch: "貓", pos: "n." },
  "dog": { ch: "狗", pos: "n." },
  "car": { ch: "汽車", pos: "n." },
  "computer": { ch: "電腦", pos: "n." },
  "phone": { ch: "手機", pos: "n." },
  "water": { ch: "水", pos: "n." },
  "food": { ch: "食物", pos: "n." },
  "run": { ch: "跑步", pos: "v." },
  "eat": { ch: "吃", pos: "v." },
  "drink": { ch: "喝", pos: "v." },
  "read": { ch: "閱讀", pos: "v." },
  "write": { ch: "寫字", pos: "v." },
  "study": { ch: "讀書 / 學習", pos: "v." },
  "learn": { ch: "學習", pos: "v." },
  "happy": { ch: "快樂的", pos: "adj." },
  "sad": { ch: "傷心的", pos: "adj." },
  "big": { ch: "大的", pos: "adj." },
  "small": { ch: "小的", pos: "adj." },
  "fast": { ch: "快的", pos: "adj." },
  "slow": { ch: "慢的", pos: "adj." },
  "good": { ch: "好的", pos: "adj." },
  "bad": { ch: "壞的", pos: "adj." },
  "quickly": { ch: "快速地", pos: "adv." },
  "slowly": { ch: "緩慢地", pos: "adv." }
};

// 驗證登入並載入現有資料夾
auth.onAuthStateChanged((user) => {
  if (user) {
    currentUser = user;
    loadUserFolders(user.uid);
  } else {
    window.location.replace("login.html?v=2026");
  }
});

// 從 Firestore 抓取現有的資料夾清單
function loadUserFolders(uid) {
  db.collection("users").doc(uid).collection("words").get()
    .then((snapshot) => {
      const foldersSet = new Set();
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.folder) {
          foldersSet.add(data.folder);
        }
      });

      folderSelect.innerHTML = "";
      if (foldersSet.size === 0) {
        folderSelect.innerHTML = `<option value="預設分類">預設分類</option>`;
      } else {
        foldersSet.forEach(folderName => {
          const opt = document.createElement("option");
          opt.value = folderName;
          opt.textContent = folderName;
          folderSelect.appendChild(opt);
        });

        // 🌟 自動記憶功能：嘗試讀取使用者上次選擇的資料夾
        const lastSelectedFolder = localStorage.getItem("english_hero_last_folder");
        if (lastSelectedFolder && foldersSet.has(lastSelectedFolder)) {
          folderSelect.value = lastSelectedFolder;
        }
      }
    })
    .catch((err) => {
      console.error("載入資料夾失敗：", err);
      folderSelect.innerHTML = `<option value="預設分類">預設分類</option>`;
    });
}

// 切換至「新增資料夾」模式
btnToggleNewFolder.addEventListener("click", () => {
  folderSelect.value = "";
  folderSelect.disabled = true;
  newFolderGroup.classList.remove("hidden");
  newFolderInput.required = true;
  newFolderInput.focus();
  btnToggleNewFolder.classList.add("hidden");
});

// 取消新增資料夾，回到下拉選單
btnCancelNewFolder.addEventListener("click", () => {
  newFolderGroup.classList.add("hidden");
  newFolderInput.required = false;
  newFolderInput.value = "";
  folderSelect.disabled = false;
  btnToggleNewFolder.classList.remove("hidden");
});

// 秒查且 100% 成功的本地智慧查詢
if (btnAutoTranslate) {
  btnAutoTranslate.addEventListener("click", async () => {
    const enInput = document.getElementById("word-en");
    const chInput = document.getElementById("word-ch");
    const posSelect = document.getElementById("word-pos");
    const wordKey = enInput.value.trim().toLowerCase();

    if (!wordKey) {
      alert("請先輸入英文單字！");
      enInput.focus();
      return;
    }

    btnAutoTranslate.textContent = "查詢中...";

    setTimeout(async () => {
      if (localDictionary[wordKey]) {
        chInput.value = localDictionary[wordKey].ch;
        if (posSelect) posSelect.value = localDictionary[wordKey].pos;
        btnAutoTranslate.textContent = "✨ 自動查中文";
        return;
      }

      try {
        const translateUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(wordKey)}&langpair=en|zh-TW`;
        const transRes = await fetch(translateUrl);
        const transData = await transRes.json();

        if (transData && transData.responseData && transData.responseData.translatedText) {
          chInput.value = transData.responseData.translatedText;
        } else {
          alert("找不到對應的中文，請手動輸入。");
        }
      } catch (error) {
        alert("查詢失敗，請手動輸入中文。");
      } finally {
        btnAutoTranslate.textContent = "✨ 自動查中文";
      }
    }, 100);
  });
}

// 表單送出儲存
if (addForm) {
  addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!currentUser) return;

    let folder = "";
    if (!newFolderGroup.classList.contains("hidden")) {
      folder = newFolderInput.value.trim();
    } else {
      folder = folderSelect.value;
    }

    if (!folder) {
      alert("請選擇或輸入資料夾名稱！");
      return;
    }

    // 🌟 自動記憶功能：當使用者成功儲存單字時，把這次選的資料夾記錄到瀏覽器中
    localStorage.setItem("english_hero_last_folder", folder);

    const en = document.getElementById("word-en").value.trim();
    const pos = document.getElementById("word-pos") ? document.getElementById("word-pos").value : "";
    const ch = document.getElementById("word-ch").value.trim();

    msgEl.textContent = "儲存中...";
    msgEl.className = "msg";

    db.collection("users").doc(currentUser.uid).collection("words").add({
      folder: folder,
      en: en,
      pos: pos,
      ch: ch,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(() => {
      msgEl.textContent = "✅ 新增成功！";
      msgEl.className = "msg success";
      
      document.getElementById("word-en").value = "";
      if (document.getElementById("word-pos")) {
        document.getElementById("word-pos").value = "";
      }
      document.getElementById("word-ch").value = "";
      document.getElementById("word-en").focus();
      
      loadUserFolders(currentUser.uid);
      
      if (!newFolderGroup.classList.contains("hidden")) {
        btnCancelNewFolder.click();
        folderSelect.value = folder;
      }

      setTimeout(() => { msgEl.textContent = ""; }, 2500);
    })
    .catch((err) => {
      msgEl.textContent = `❌ 儲存失敗：${err.message}`;
      msgEl.className = "msg error";
    });
  });
}
