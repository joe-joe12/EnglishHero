const SEND_COOLDOWN = 60; // 重新寄送驗證信的間隔（秒），避免被 Firebase 判定寄太頻繁
const $ = (id) => document.getElementById(id);

let user = null;
let done = false;

// 如果關閉了「必須驗證」功能，這頁就不需要停留
if (!EH.REQUIRE_VERIFIED) window.location.replace("index.html?v=3000");

function show(msg, type) {
  const box = $("verify-msg");
  box.textContent = msg;
  box.className = "auth-msg " + (type === "success" ? "success" : "error");
}

function zh(e) {
  const map = {
    "auth/too-many-requests": "寄送太頻繁，請稍後再試",
    "auth/network-request-failed": "網路連線失敗，請檢查網路後再試",
    "auth/user-token-expired": "登入已過期，請重新登入",
    "auth/requires-recent-login": "請重新登入後再試"
  };
  return (e && map[e.code]) || (e && e.message) || "發生未知錯誤";
}

// 向伺服器更新狀態，看使用者是否已經點過驗證信
async function check(silent) {
  if (!user || done) return false;
  try {
    await user.reload();
  } catch (e) {
    if (!silent) show("檢查失敗：" + zh(e), "error");
    return false;
  }
  if (user.emailVerified) {
    done = true;
    try { await user.getIdToken(true); } catch (e) { /* 讓安全規則看到最新的驗證狀態；失敗也沒關係 */ }
    show("✅ 驗證成功！正在前往首頁...", "success");
    setTimeout(() => window.location.replace("index.html?v=3000"), 700);
    return true;
  }
  if (!silent) show("還沒偵測到驗證完成，請先點信裡的連結，再回來按一次。", "error");
  return false;
}

function secondsLeft() {
  const last = EH.store.get("eh_verify_sent_at", 0) || 0;
  return Math.max(0, SEND_COOLDOWN - Math.floor((Date.now() - last) / 1000));
}

function updateResendButton() {
  const btn = $("btn-resend");
  const left = secondsLeft();
  btn.disabled = left > 0;
  btn.textContent = left > 0 ? `📨 重新寄送驗證信（${left} 秒後可重寄）` : "📨 重新寄送驗證信";
}

async function resend() {
  if (!user || secondsLeft() > 0) return;
  $("btn-resend").disabled = true;
  try {
    await user.sendEmailVerification();
    EH.store.set("eh_verify_sent_at", Date.now());
    show("已重新寄出驗證信，請到信箱查看（也看看垃圾郵件匣）", "success");
  } catch (e) {
    show("寄送失敗：" + zh(e), "error");
  }
  updateResendButton();
}

EH.auth.onAuthStateChanged(async (u) => {
  if (!u) {
    window.location.replace("login.html?v=3500");
    return;
  }
  user = u;
  $("verify-email").textContent = u.email || "";
  updateResendButton();
  await check(true); // 已經驗證過的人直接前進
});

$("btn-check").addEventListener("click", () => check(false));
$("btn-resend").addEventListener("click", resend);
$("btn-signout").addEventListener("click", async () => {
  EH.cache.clearAll();
  await EH.auth.signOut();
  window.location.replace("login.html?v=3500");
});

// 每 6 秒自動檢查一次；從信箱 App 切回來時也立刻檢查
setInterval(() => { if (!document.hidden) check(true); }, 6000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) check(true); });
setInterval(updateResendButton, 1000);
