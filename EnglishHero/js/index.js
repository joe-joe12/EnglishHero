EH.requireUser((user) => {
  const name = user.email ? user.email.split("@")[0] : "使用者";
  const userDisplay = document.getElementById("user-display");
  if (userDisplay) userDisplay.textContent = `👋 你好，${name}`;

  // 依時段問候
  const h = new Date().getHours();
  const hello = h < 12 ? "早安" : h < 18 ? "午安" : "晚安";
  document.getElementById("greeting").textContent = `${hello}，${name}！準備好背單字了嗎？`;

  // 統計：有本機快取就直接算（不連線）；沒有的話要先進過背單字或考單字一次
  const cachedWords = EH.cache.peek(user.uid);
  if (cachedWords) EH.saveStats(cachedWords);

  const stats = EH.store.get("eh_stats");
  if (stats) {
    document.getElementById("stat-total").textContent = stats.total;
    document.getElementById("stat-learned").textContent = stats.learned;
    document.getElementById("stat-folders").textContent = stats.folders;
  }

  // 每日目標與連續天數（只讀本機，不連線）
  function renderDaily() {
    const d = EH.daily.peek(user.uid);
    const pct = Math.min(100, Math.round((d.count / d.goal) * 100));
    document.getElementById("daily-streak").textContent = `🔥 連續 ${d.streak} 天`;
    document.getElementById("daily-bar").style.width = pct + "%";
    document.getElementById("daily-text").textContent =
      d.count >= d.goal
        ? `🎉 今天 ${d.count} / ${d.goal} 題，目標達成！`
        : `今天 ${d.count} / ${d.goal} 題`;
  }
  renderDaily();

  const goalBtn = document.getElementById("btn-goal");
  if (goalBtn) {
    goalBtn.addEventListener("click", async () => {
      const v = await EH.prompt("每天想練習幾題？（5～200）", String(EH.daily.peek(user.uid).goal));
      if (v === null) return;
      const n = parseInt(v, 10);
      if (isNaN(n) || n < 5 || n > 200) {
        EH.toast("請輸入 5～200 的數字", "error");
        return;
      }
      EH.daily.loadLocal(user.uid);
      EH.daily.setGoal(n);
      EH.daily.flush();
      renderDaily();
      EH.toast("🎯 已設定每日目標", "success", 1500);
    });
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
    // 共用裝置：一併清掉上一位使用者的統計與上次進度
    ["eh_stats", "eh_last_study", "eh_last_add_folder"].forEach((k) => {
      try { localStorage.removeItem(k); } catch (e) { /* 忽略 */ }
    });
    EH.auth.signOut().then(() => {
      window.location.replace("login.html?v=3000");
    });
  });
}
