window.openFolderEditModal = function(folderName) {
  currentFolderForManagement = folderName;
  const targetWords = allWords.filter(w => w.folder === folderName);

  pageTitleEl.textContent = `✏️ 管理資料夾：${folderName}`;
  btnBackFolders.style.display = "block";

  if (targetWords.length === 0) {
    containerEl.innerHTML = `
      <div style="text-align: center; color: #666; padding: 20px;">
        <p>這個資料夾裡沒有單字。</p>
        <button onclick="fetchAllWords(currentUser.uid)" style="margin-top: 10px; padding: 8px 16px; background: #4f46e5; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">返回資料夾列表</button>
      </div>
    `;
    return;
  }

  let html = ``;
  
  // 如果是「已經背過的單字」，額外提供一鍵清空按鈕
  if (folderName === "📦 已經背過的單字") {
    html += `
      <div style="margin-bottom: 15px; text-align: right;">
        <button onclick="confirmDeleteFolder('${folderName}')" style="padding: 8px 14px; background: #fee2e2; color: #ef4444; border: 1px solid #fca5a5; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 13px;">🗑️ 清空所有已背過單字</button>
      </div>
    `;
  }

  html += `<div style="background: #f8fafc; padding: 10px; border-radius: 8px;">`;
  targetWords.forEach(w => {
    html += `
      <div class="word-row" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-bottom: 1px solid #f1f5f9; background: #fff; margin-top: 6px; border-radius: 6px;">
        <div>
          <span style="font-size: 16px; font-weight: bold; color: #1d4ed8;">${w.en}</span>
          <span style="font-size: 12px; background: #e0f2fe; color: #0284c7; padding: 2px 6px; border-radius: 4px; margin-left: 8px;">${w.pos || '無詞性'}</span>
          <div style="font-size: 14px; color: #4b5563; margin-top: 2px;">${w.ch}</div>
        </div>
        <div style="display: flex; gap: 6px;">
          <button onclick="openSingleEditModal('${w.id}')" style="background: #e0e7ff; color: #4f46e5; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold;">修改</button>
          <button onclick="deleteSingleWord('${w.id}')" style="background: #fee2e2; color: #ef4444; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold;">刪除</button>
        </div>
      </div>
    `;
  });
  html += `</div>`;
  html += `
    <div style="margin-top: 15px; text-align: center;">
      <button onclick="fetchAllWords(currentUser.uid)" style="padding: 8px 16px; background: #64748b; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">⬅️ 返回資料夾列表</button>
    </div>
  `;

  containerEl.innerHTML = html;
};
