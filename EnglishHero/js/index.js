EH.requireUser((user) => {
  const name = user.email ? user.email.split("@")[0] : "使用者";
  const userDisplay = document.getElementById("user-display");
  if (userDisplay) userDisplay.textContent = `👋 你好，${name}`;

  // 依時段問候
  const h = new Date().getHours();
  const hello = h < 12 ? "早安" : h < 18 ? "午安" : "晚安";
  document.getElementById("greeting").textContent = `${hello}，${name}！準備好背單字了嗎？`;

  // 統計（由背單字頁 / 測驗頁載入資料時寫入）
  const stats = EH.store.get("eh_stats");
  if (stats) {
    document.getElementById("stat-total").textContent = stats.total;
    document.getElementById("stat-learned").textContent = stats.learned;
    document.getElementById("stat-folders").textContent = stats.folders;
  }

  // 間隔複習：只看本機資料，不額外讀取 Firestore
  const due = EH.srs.localDueCount(user.uid);
  const srsText = document.getElementById("srs-text");
  if (due > 0) srsText.textContent = `🧠 今天有 ${due} 個單字該複習了`;
  else if (EH.srs.localHasAny(user.uid)) srsText.textContent = "🎉 今天到期的都複習完了，可以再學一些新單字";

  // 繼續上次的資料夾
  const last = EH.store.get("eh_last_study");
  if (last) {
    const card = document.getElementById("continue-card");
    card.href = "study.html?folder=" + encodeURIComponent(last);
    document.getElementById("continue-name").textContent = last;
    card.classList.remove("hidden");
  }
});

const btnLogout = document.getElementById("btn-logout");
if (btnLogout) {
  btnLogout.addEventListener("click", () => {
    EH.cache.clearAll();
    EH.auth.signOut().then(() => {
      window.location.replace("login.html?v=3000");
    });
  });
}
