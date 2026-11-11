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

const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const authMessage = document.getElementById("auth-message");

// Firebase 錯誤代碼 → 中文說明
function zhError(error) {
  const map = {
    "auth/email-already-in-use": "這個信箱已經註冊過了，請直接登入",
    "auth/invalid-email": "信箱格式不正確",
    "auth/weak-password": "密碼太簡單，請至少 6 個字元",
    "auth/wrong-password": "信箱或密碼不正確",
    "auth/user-not-found": "信箱或密碼不正確",
    "auth/invalid-credential": "信箱或密碼不正確",
    "auth/invalid-login-credentials": "信箱或密碼不正確",
    "auth/too-many-requests": "嘗試次數太多，請稍後再試",
    "auth/network-request-failed": "網路連線失敗，請檢查網路後再試",
    "auth/user-disabled": "這個帳號已被停用"
  };
  return (error && map[error.code]) || (error && error.message) || "發生未知錯誤";
}

function showMessage(msg, isError = true) {
  if (authMessage) {
    authMessage.textContent = msg;
    authMessage.className = `auth-msg ${isError ? 'error' : 'success'}`;
    authMessage.classList.remove("hidden");
  }
}

function clearMessage() {
  if (authMessage) {
    authMessage.textContent = "";
    authMessage.classList.add("hidden");
  }
}

if (tabLogin && tabRegister) {
  tabLogin.onclick = () => {
    tabLogin.classList.add("active");
    tabRegister.classList.remove("active");
    loginForm.classList.remove("hidden");
    registerForm.classList.add("hidden");
    clearMessage();
  };

  tabRegister.onclick = () => {
    tabRegister.classList.add("active");
    tabLogin.classList.remove("active");
    registerForm.classList.remove("hidden");
    loginForm.classList.add("hidden");
    clearMessage();
  };
}

if (loginForm) {
  loginForm.onsubmit = function (e) {
    e.preventDefault();
    clearMessage();

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    showMessage("正在登入中...", false);

    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
      .then(() => auth.signInWithEmailAndPassword(email, password))
      .then((cred) => {
        // 信箱還沒驗證 → 去驗證頁；已驗證 → 首頁
        const verified = cred.user.emailVerified;
        showMessage(verified ? "登入成功！正在跳轉..." : "登入成功，請先完成信箱驗證...", false);
        setTimeout(() => {
          window.location.href = verified ? "index.html?v=2026" : "verify.html?v=3500";
        }, 500);
      })
      .catch((error) => {
        showMessage(`登入失敗：${zhError(error)}`, true);
      });
  };
}

if (registerForm) {
  registerForm.onsubmit = function (e) {
    e.preventDefault();
    clearMessage();

    const email = document.getElementById("reg-email").value.trim();
    const password = document.getElementById("reg-password").value;

    showMessage("正在建立帳號...", false);

    auth.createUserWithEmailAndPassword(email, password)
      .then(async (cred) => {
        // 寄出驗證信；就算寄信失敗也先進驗證頁，那裡可以重新寄送
        let sent = true;
        try {
          await cred.user.sendEmailVerification();
        } catch (err) {
          sent = false;
        }
        if (sent) {
          try { localStorage.setItem("eh_verify_sent_at", String(Date.now())); } catch (err) { /* 忽略 */ }
        }
        showMessage("註冊成功！" + (sent ? "已寄出驗證信，" : "") + "正在前往驗證頁...", false);
        setTimeout(() => { window.location.href = "verify.html?v=3500"; }, 800);
      })
      .catch((error) => {
        showMessage(`註冊失敗：${zhError(error)}`, true);
      });
  };
}
