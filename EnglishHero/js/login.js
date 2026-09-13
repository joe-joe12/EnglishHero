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
      .then(() => {
        showMessage("登入成功！正在跳轉...", false);
        setTimeout(() => { window.location.href = "index.html?v=2026"; }, 500);
      })
      .catch((error) => {
        showMessage(`登入失敗：${error.message}`, true);
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
      .then(() => {
        showMessage("註冊成功！正在跳轉...", false);
        setTimeout(() => { window.location.href = "index.html?v=2026"; }, 500);
      })
      .catch((error) => {
        showMessage(`註冊失敗：${error.message}`, true);
      });
  };
}
