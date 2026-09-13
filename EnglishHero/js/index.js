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

document.addEventListener("DOMContentLoaded", () => {
  const userDisplay = document.getElementById("user-display");
  const btnLogout = document.getElementById("btn-logout");

  auth.onAuthStateChanged((user) => {
    if (user) {
      const emailName = user.email ? user.email.split("@")[0] : "使用者";
      if (userDisplay) {
        userDisplay.textContent = `👋 你好，${emailName}`;
      }
    } else {
      window.location.replace("login.html?v=2026");
    }
  });

  if (btnLogout) {
    btnLogout.addEventListener("click", () => {
      auth.signOut().then(() => {
        window.location.replace("login.html?v=2026");
      });
    });
  }
});
