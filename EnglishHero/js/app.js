// === Firebase 專案設定 ===
const firebaseConfig = {
  apiKey: "AIzaSyA4bbUoXHi29YAjCgYrnuYRhZJ8_JEtalc",
  authDomain: "englishhero-d58c6.firebaseapp.com",
  projectId: "englishhero-d58c6",
  storageBucket: "englishhero-d58c6.firebasestorage.app",
  messagingSenderId: "437927020009",
  appId: "1:437927020009:web:30e18c99cfeec8ef4ef778",
  measurementId: "G-TZTCS02SK6"
};

// 初始化 Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();

// 監聽登入狀態
auth.onAuthStateChanged((user) => {
  const userEmailEl = document.getElementById("user-display-email");
  const logoutBtn = document.getElementById("btn-logout");

  if (user) {
    // 已登入：顯示信箱帳號
    if (userEmailEl) {
      userEmailEl.textContent = user.email;
    }

    // 綁定登出按鈕事件
    if (logoutBtn) {
      logoutBtn.onclick = async () => {
        try {
          await auth.signOut();
          window.location.replace("login.html");
        } catch (error) {
          alert("登出失敗：" + error.message);
        }
      };
    }
  } else {
    // 未登入：提示並自動轉跳登入頁
    if (userEmailEl) {
      userEmailEl.textContent = "未登入，轉跳中...";
    }
    setTimeout(() => {
      window.location.replace("login.html");
    }, 500);
  }
});