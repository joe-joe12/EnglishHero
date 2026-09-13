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
let allUserWords = [];
let foldersMap = {};
let currentTodayBatch = []; 

auth.onAuthStateChanged((user) => {
  if (user) {
    currentUser = user;
    fetchUserFoldersAndWords();
  } else {
    window.location.replace("login.html?v=2120");
  }
});

// 取得使用者的所有單字並建立資料夾對應表
async function fetchUserFoldersAndWords() {
  try {
    const snapshot = await db.collection("users").doc(currentUser.uid).collection("words").get();
    allUserWords = [];
    foldersMap = {};

    snapshot.forEach(doc => {
      const data = doc.data();
      allUserWords.push({ id: doc.id, ...data });
      if (data.folder && !data.folder.includes("🎯") && !data.folder.includes("📦")) {
        if (!foldersMap[data.folder]) {
          foldersMap[data.folder] = [];
        }
        foldersMap[data.folder].push(data);
      }
    });

    renderFolderSettings();

  } catch (err) {
    alert("載入資料夾失敗：" + err.message);
  }
}

// 動態在畫面上為每個資料夾產生「打勾選取框」與「天數輸入框」
function renderFolderSettings() {
  const container = document.getElementById("folder-settings-container");
  const folderNames = Object.keys(foldersMap);

  if (folderNames.length === 0) {
    container.innerHTML = `<p style="color: #6b7280; text-align: center; margin: 0;">目前沒有找到任何資料夾！</p>`;
    return;
  }

  let html = "";
  folderNames.forEach((folder, index) => {
    html += `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; background: #fff; padding: 10px 12px; border-radius: 8px; border: 1px solid #e5e7eb;">
        
        <!-- 左側：打勾框與資料夾名稱 -->
        <div style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
          <input type="checkbox" id="chk-${index}" class="folder-checkbox" data-folder="${folder}" style="width: 18px; height: 18px; cursor: pointer;" checked>
          <label for="chk-${index}" style="font-size: 15px; color: #1f2937; font-weight: 600; cursor: pointer; margin: 0; user-select: none;">
            📁 ${folder} <span style="color: #64748b; font-size: 13px; font-weight: normal;">(${foldersMap[folder].length}個單字)</span>
          </label>
        </div>

        <!-- 右側：天數設定 -->
        <div style="display: flex; align-items: center; gap: 6px;">
          <input type="number" min="1" value="2" class="folder-day-input" data-folder="${folder}" style="width: 60px; padding: 6px; border: 1px solid #d1d5db; border-radius: 6px; text-align: center;">
          <span style="font-size: 13px; color: #6b7280;">天背完</span>
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}

// 核心演算法：產生全域連續學習計畫 (只計算有打勾的資料夾)
window.generateGlobalPlan = function() {
  const targetDayNum = parseInt(document.getElementById("target-day").value);
  if (!targetDayNum || targetDayNum <= 0) {
    alert("請輸入有效的目標天數！");
    return;
  }

  // 1. 只抓取畫面上「有打勾」的資料夾
  const checkedBoxes = Array.from(document.querySelectorAll(".folder-checkbox")).filter(box => box.checked);
  
  if (checkedBoxes.length === 0) {
    alert("請至少勾選一個要背誦的資料夾！");
    return;
  }

  let globalTimeline = []; // 索引對應第 0 天、第 1 天...

  // 2. 將「有打勾」的資料夾依照設定天數切塊，並依序串連
  checkedBoxes.forEach(box => {
    const folderName = box.getAttribute("data-folder");
    
    // 找出對應這個資料夾的天數輸入框
    const dayInputs = Array.from(document.querySelectorAll(".folder-day-input"));
    const dayInput = dayInputs.find(input => input.getAttribute("data-folder") === folderName);
    
    const totalDays = dayInput ? (parseInt(dayInput.value) || 1) : 1;
    const words = foldersMap[folderName] || [];
    
    if (words.length === 0) return;

    const chunkSize = Math.ceil(words.length / totalDays);
    let folderDays = [];

    for (let d = 0; d < totalDays; d++) {
      const start = d * chunkSize;
      const end = start + chunkSize;
      folderDays.push(words.slice(start, end));
    }

    // 無縫串接至全域時間軸
    folderDays.forEach((dayWords, dayIndex) => {
      if (!globalTimeline[dayIndex]) {
        globalTimeline[dayIndex] = [];
      }
      globalTimeline[dayIndex].push(...dayWords);
    });
  });

  // 取得使用者指定的那一天（陣列從 0 開始，所以要減 1）
  const targetIndex = targetDayNum - 1;
  currentTodayBatch = globalTimeline[targetIndex] || [];

  // 渲染畫面供預覽
  document.getElementById("plan-result").classList.remove("hidden");
  document.getElementById("plan-title").innerText = 
    `📖 全域排程 - Day ${targetDayNum}：共 ${currentTodayBatch.length} 個單字。`;

  const container = document.getElementById("daily-words-container");
  container.innerHTML = "";

  if (currentTodayBatch.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: #6b7280; padding: 15px;">🎉 太棒了！您選取的資料夾在第 ${targetDayNum} 天已經全部背完了！</div>`;
    return;
  }

  currentTodayBatch.forEach((w, index) => {
    container.innerHTML += `
      <div class="word-item">
        <div>
          <span class="word-en">${index + 1}. ${w.en}</span>
          <span class="word-pos">(${w.pos || 'n.'})</span>
          <span style="font-size: 11px; background: #e0f2ff; color: #3730a3; padding: 2px 6px; border-radius: 4px; margin-left: 6px;">${w.folder}</span>
        </div>
        <span class="word-ch">${w.ch}</span>
      </div>
    `;
  });
};

// 寫入雲端「🎯 今日背誦計畫」資料夾
window.saveGlobalPlanToCloud = async function() {
  if (currentTodayBatch.length === 0) {
    alert("目前沒有可加入的計畫單字！");
    return;
  }

  const planFolderName = "🎯 今日背誦計畫";

  try {
    const userWordsRef = db.collection("users").doc(currentUser.uid).collection("words");

    // 1. 安全抓取並刪除舊的「🎯 今日背誦計畫」（改用前端迴圈比對，避免 Firestore 複合索引報錯）
    const allSnapshot = await userWordsRef.get();
    let deleteBatch = db.batch();
    let deleteCount = 0;

    allSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.folder === planFolderName) {
        deleteBatch.delete(doc.ref);
        deleteCount++;
      }
    });

    if (deleteCount > 0) {
      await deleteBatch.commit();
    }

    // 2. 將今天的份量寫入「🎯 今日背誦計畫」，並補上 createdAt 讓背單字畫面抓得到
    let writeBatch = db.batch();
    let writeCount = 0;

    for (const w of currentTodayBatch) {
      const newDocRef = userWordsRef.doc();
      writeBatch.set(newDocRef, {
        en: w.en,
        pos: w.pos || "n.",
        ch: w.ch,
        folder: planFolderName,
        createdAt: firebase.firestore.FieldValue.serverTimestamp() // 🌟 關鍵修正：補上時間戳記
      });
      writeCount++;
      if (writeCount >= 400) {
        await writeBatch.commit();
        writeBatch = db.batch();
        writeCount = 0;
      }
    }
    if (writeCount > 0) {
      await writeBatch.commit();
    }

    alert(`🎉 成功將當天串連的 ${currentTodayBatch.length} 個單字加入「${planFolderName}」資料夾！`);
  } catch (err) {
    alert("加入資料夾失敗：" + err.message);
  }
};
