// バックグラウンドスクリプト

// インストール時とブラウザ起動時の初期化
async function initializeExtension() {
  console.log('[Claude Usage] Initializing extension...');
  
  // 現在の設定を取得
  const result = await chrome.storage.local.get(['widgetVisible']);
  
  // widgetVisibleが未設定の場合はデフォルトでtrueに設定
  let isEnabled;
  if (result.widgetVisible === undefined) {
    isEnabled = true;
    await chrome.storage.local.set({ widgetVisible: true });
    console.log('[Claude Usage] Set default widgetVisible to true');
  } else {
    isEnabled = result.widgetVisible;
  }
  
  // バッジを更新
  updateBadge(isEnabled);
  console.log('[Claude Usage] Initialized with widgetVisible:', isEnabled);
}

// インストール時
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Claude Usage] Extension installed/updated:', details.reason);
  await initializeExtension();
});

// ブラウザ起動時
chrome.runtime.onStartup.addListener(async () => {
  console.log('[Claude Usage] Browser started');
  await initializeExtension();
});

// 拡張機能アイコンのクリックを処理
chrome.action.onClicked.addListener(async (tab) => {
  console.log('[Claude Usage] Extension icon clicked');
  
  // Claude.aiのページかチェック
  if (tab.url && tab.url.includes('claude.ai')) {
    // 現在の状態を取得
    const result = await chrome.storage.local.get(['widgetVisible']);
    
    // widgetVisibleが未設定の場合はtrueとして扱う
    const currentState = result.widgetVisible === undefined ? true : result.widgetVisible;
    const newState = !currentState; // 状態を反転
    
    // 新しい状態を保存
    await chrome.storage.local.set({ widgetVisible: newState });
    console.log('[Claude Usage] Widget state changed to:', newState);
    
    // バッジとアイコンの表示を更新
    updateBadge(newState);
    
    // content scriptが読み込まれているかチェック
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
      if (response && response.pong) {
        // content scriptが応答した場合、ウィジェットの表示/非表示を切り替え
        if (newState) {
          await chrome.tabs.sendMessage(tab.id, { action: 'showWidget' });
          console.log('[Claude Usage] Widget show message sent');
        } else {
          await chrome.tabs.sendMessage(tab.id, { action: 'hideWidget' });
          console.log('[Claude Usage] Widget hide message sent');
        }
      }
    } catch (error) {
      // content scriptが読み込まれていない場合は、次回ページ読み込み時に状態が反映される
      console.log('[Claude Usage] Content script not ready, state will apply on next page load');
    }
  } else {
    // Claude.ai以外のページの場合は、Claude.aiを開く
    chrome.tabs.create({ url: 'https://claude.ai/settings/usage' });
  }
});

// バッジとアイコンの表示を更新
async function updateBadge(isEnabled) {
  if (isEnabled) {
    // ON状態: 緑色のバッジ
    await chrome.action.setBadgeText({ text: 'ON' });
    await chrome.action.setBadgeBackgroundColor({ color: '#4ade80' });
  } else {
    // OFF状態: グレーのバッジ
    await chrome.action.setBadgeText({ text: 'OFF' });
    await chrome.action.setBadgeBackgroundColor({ color: '#9ca3af' });
  }
}

// 定期的にデータを更新する（オプション）
chrome.alarms.create('updateUsage', { periodInMinutes: 15 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'updateUsage') {
    // Claude.aiのタブが開いている場合のみ更新
    const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
    if (tabs.length > 0) {
      try {
        const response = await chrome.tabs.sendMessage(tabs[0].id, { action: 'getUsageData' });
        if (response && response.success) {
          await chrome.storage.local.set({
            usageData: response.data,
            lastUpdate: Date.now()
          });
        }
      } catch (error) {
        console.error('自動更新エラー:', error);
      }
    }
  }
});
