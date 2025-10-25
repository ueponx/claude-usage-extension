// フローティングウィジェット
(function() {
  'use strict';

  console.log('[Claude Usage Widget] Script loaded');

  // 既に存在する場合は何もしない
  if (document.getElementById('claude-usage-widget')) {
    console.log('[Claude Usage Widget] Widget already exists, exiting');
    return;
  }

  let widget = null;
  let isDragging = false;
  let currentX = 0;
  let currentY = 0;
  let initialX = 0;
  let initialY = 0;
  let updateInterval = null;

  // バックグラウンドスクリプトからのメッセージを受信
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[Claude Usage Widget] Received message:', request);
    
    if (request.action === 'ping') {
      // Content scriptが読み込まれているか確認するためのpingに応答
      sendResponse({ pong: true });
    } else if (request.action === 'showWidget') {
      showWidget();
      sendResponse({ success: true });
    } else if (request.action === 'hideWidget') {
      hideWidget();
      sendResponse({ success: true });
    }
    
    return true;
  });

  // 使用量ページかどうかをチェック
  function isUsagePage() {
    const result = window.location.href.includes('claude.ai/settings/usage');
    console.log('[Claude Usage Widget] isUsagePage:', result);
    return result;
  }

  // ウィジェットを作成
  function createWidget() {
    console.log('[Claude Usage Widget] createWidget called');
    
    widget = document.createElement('div');
    widget.id = 'claude-usage-widget';
    widget.innerHTML = `
      <div class="widget-header">
        <h3 class="widget-title">Claude使用量</h3>
        <div class="widget-controls">
          <button class="widget-btn" id="widget-refresh" title="更新">🔄</button>
          <button class="widget-btn" id="widget-toggle" title="折りたたみ">−</button>
          <button class="widget-btn" id="widget-close" title="閉じる">×</button>
        </div>
      </div>
      <div class="widget-content">
        <div class="widget-loading">
          <div class="widget-spinner"></div>
          <div>読み込み中...</div>
        </div>
      </div>
    `;

    document.body.appendChild(widget);
    console.log('[Claude Usage Widget] Widget appended to body');

    // 保存された位置を復元
    restorePosition();

    // イベントリスナーを設定
    setupEventListeners();
    console.log('[Claude Usage Widget] Event listeners set up');

    // 使用量ページにいる場合はデータ取得、それ以外はキャッシュを表示
    if (isUsagePage()) {
      console.log('[Claude Usage Widget] On usage page, fetching data');
      fetchUsageData();
      // 5分ごとに自動更新
      updateInterval = setInterval(fetchUsageData, 5 * 60 * 1000);
    } else {
      console.log('[Claude Usage Widget] Not on usage page, loading cached data');
      loadCachedData();
    }
  }

  // イベントリスナーを設定
  function setupEventListeners() {
    const header = widget.querySelector('.widget-header');
    const refreshBtn = widget.querySelector('#widget-refresh');
    const toggleBtn = widget.querySelector('#widget-toggle');
    const closeBtn = widget.querySelector('#widget-close');

    // ドラッグ機能
    header.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);

    // ボタン
    refreshBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isUsagePage()) {
        fetchUsageData();
      } else {
        showMessage('使用量ページでのみ更新できます');
      }
    });

    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleWidget();
    });

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      hideWidget();
    });
  }

  // ドラッグ開始
  function dragStart(e) {
    if (e.target.closest('.widget-btn')) {
      return;
    }

    initialX = e.clientX - currentX;
    initialY = e.clientY - currentY;
    isDragging = true;
    widget.classList.add('dragging');
  }

  // ドラッグ中
  function drag(e) {
    if (!isDragging) return;

    e.preventDefault();
    currentX = e.clientX - initialX;
    currentY = e.clientY - initialY;

    widget.style.left = currentX + 'px';
    widget.style.top = currentY + 'px';
    widget.style.right = 'auto';
  }

  // ドラッグ終了
  function dragEnd() {
    if (!isDragging) return;

    isDragging = false;
    widget.classList.remove('dragging');
    savePosition();
  }

  // 位置を保存
  function savePosition() {
    chrome.storage.local.set({
      widgetPosition: {
        x: currentX,
        y: currentY
      }
    });
  }

  // 位置を復元
  function restorePosition() {
    chrome.storage.local.get(['widgetPosition'], (result) => {
      if (result.widgetPosition) {
        currentX = result.widgetPosition.x;
        currentY = result.widgetPosition.y;
        widget.style.left = currentX + 'px';
        widget.style.top = currentY + 'px';
        widget.style.right = 'auto';
        console.log('[Claude Usage Widget] Position restored:', currentX, currentY);
      } else {
        // 初期位置を設定（右上から20px、幅は約280pxと仮定）
        currentX = window.innerWidth - 300;
        currentY = 80;
        widget.style.left = currentX + 'px';
        widget.style.top = currentY + 'px';
        widget.style.right = 'auto';
        console.log('[Claude Usage Widget] Initial position set:', currentX, currentY);
      }
    });
  }

  // ウィジェットを折りたたみ/展開
  function toggleWidget() {
    const toggleBtn = widget.querySelector('#widget-toggle');
    widget.classList.toggle('collapsed');
    
    if (widget.classList.contains('collapsed')) {
      toggleBtn.textContent = '+';
      toggleBtn.title = '展開';
    } else {
      toggleBtn.textContent = '−';
      toggleBtn.title = '折りたたみ';
    }

    // 状態を保存
    chrome.storage.local.set({
      widgetCollapsed: widget.classList.contains('collapsed')
    });
  }

  // ウィジェットを非表示
  function hideWidget() {
    console.log('[Claude Usage Widget] Hiding widget');
    if (updateInterval) {
      clearInterval(updateInterval);
    }
    widget.remove();
    widget = null;
    
    // 非表示状態を保存
    chrome.storage.local.set({ widgetVisible: false });
  }

  // ウィジェットを再表示
  function showWidget() {
    console.log('[Claude Usage Widget] showWidget called, current widget:', widget);
    
    // 既にウィジェットが存在する場合は何もしない
    if (widget) {
      console.log('[Claude Usage Widget] Widget already exists, no action needed');
      return;
    }
    
    // ウィジェットが存在しない場合のみ作成
    chrome.storage.local.set({ widgetVisible: true }, () => {
      console.log('[Claude Usage Widget] Set widgetVisible to true, creating widget');
      createWidget();
    });
  }

  // メッセージを表示
  function showMessage(message) {
    const content = widget.querySelector('.widget-content');
    content.innerHTML = `
      <div class="widget-error">
        ${message}
      </div>
    `;
    setTimeout(() => {
      loadCachedData();
    }, 2000);
  }

  // キャッシュデータを読み込み
  function loadCachedData() {
    console.log('[Claude Usage Widget] Loading cached data');
    chrome.storage.local.get(['usageData', 'lastUpdate'], (result) => {
      console.log('[Claude Usage Widget] Cached data result:', result);
      if (result.usageData) {
        displayData(result.usageData, result.lastUpdate);
      } else {
        console.log('[Claude Usage Widget] No cached data found');
        const content = widget.querySelector('.widget-content');
        content.innerHTML = `
          <div class="widget-info">
            キャッシュデータがありません<br>
            <small>claude.ai/settings/usage を開いてください</small>
          </div>
        `;
      }
    });
  }

  // データを取得
  function fetchUsageData() {
    const content = widget.querySelector('.widget-content');
    
    // ローディング表示
    content.innerHTML = `
      <div class="widget-loading">
        <div class="widget-spinner"></div>
        <div>読み込み中...</div>
      </div>
    `;

    try {
      const usageData = extractUsageData();
      
      if (usageData === null) {
        // データが見つからない場合は案内メッセージを表示
        content.innerHTML = `
          <div class="widget-info">
            使用量データを読み込めませんでした<br>
            <small>ページを再読み込みするか、少し待ってから更新してください</small>
          </div>
        `;
        return;
      }
      
      displayData(usageData, Date.now());
      
      // データを保存
      chrome.storage.local.set({
        usageData: usageData,
        lastUpdate: Date.now()
      });
    } catch (error) {
      console.error('Error fetching usage data:', error);
      content.innerHTML = `
        <div class="widget-error">
          エラーが発生しました<br>
          <small>${error.message}</small>
        </div>
      `;
    }
  }

  // データを抽出
  function extractUsageData() {
    const data = {
      currentSession: null,
      allModels: null,
      opusOnly: null
    };

    const pageText = document.body.innerText;

    // Current session
    const currentMatch = pageText.match(/Current\s+session[^]*?(\d+)%[\s\S]*?使用済み/i) || 
                         pageText.match(/Current\s+session[^]*?(\d+)%/i);
    if (currentMatch) {
      data.currentSession = {
        percentage: parseInt(currentMatch[1]),
        reset: extractResetTime('Current session', pageText)
      };
    }

    // All models
    const allModelsMatch = pageText.match(/All\s+models[^]*?(\d+)%[\s\S]*?使用済み/i) || 
                           pageText.match(/All\s+models[^]*?(\d+)%/i);
    if (allModelsMatch) {
      data.allModels = {
        percentage: parseInt(allModelsMatch[1]),
        reset: extractResetTime('All models', pageText)
      };
    }

    // Opus only
    const opusMatch = pageText.match(/Opus\s+only[^]*?(\d+)%[\s\S]*?使用済み/i) || 
                      pageText.match(/Opus\s+only[^]*?(\d+)%/i);
    if (opusMatch) {
      data.opusOnly = {
        percentage: parseInt(opusMatch[1]),
        reset: extractResetTime('Opus only', pageText)
      };
    }

    if (!data.currentSession && !data.allModels && !data.opusOnly) {
      return null; // データが見つからない場合はnullを返す
    }

    return data;
  }

  // リセット時間を抽出
  function extractResetTime(section, text) {
    const sectionIndex = text.toLowerCase().indexOf(section.toLowerCase());
    if (sectionIndex === -1) return '--';
    
    const afterSection = text.substring(sectionIndex, sectionIndex + 400);
    
    const patterns = [
      /(\d+時間\d+分後)にリセット/,
      /(\d+時間後)にリセット/,
      /(\d+分後)にリセット/,
      /(\d+:\d+\s*\([^)]+\))にリセット/,
      /(\d+:\d+\s*\([^)]+\))\s*にリセット/
    ];

    for (const pattern of patterns) {
      const match = afterSection.match(pattern);
      if (match) return match[1];
    }
    
    return '--';
  }

  // データを表示
  function displayData(data, lastUpdate) {
    const content = widget.querySelector('.widget-content');
    let html = '';

    if (data.currentSession) {
      html += `
        <div class="usage-item">
          <div class="usage-label">Current Session</div>
          <div class="usage-bar">
            <div class="usage-bar-fill" style="width: ${data.currentSession.percentage}%"></div>
          </div>
          <div class="usage-stats">
            <span class="usage-percentage">${data.currentSession.percentage}%</span>
            <span class="usage-reset">${data.currentSession.reset}</span>
          </div>
        </div>
      `;
    }

    if (data.allModels) {
      html += `
        <div class="usage-item">
          <div class="usage-label">All Models</div>
          <div class="usage-bar">
            <div class="usage-bar-fill" style="width: ${data.allModels.percentage}%"></div>
          </div>
          <div class="usage-stats">
            <span class="usage-percentage">${data.allModels.percentage}%</span>
            <span class="usage-reset">${data.allModels.reset}</span>
          </div>
        </div>
      `;
    }

    if (data.opusOnly) {
      html += `
        <div class="usage-item opus">
          <div class="usage-label">Opus Only</div>
          <div class="usage-bar">
            <div class="usage-bar-fill" style="width: ${data.opusOnly.percentage}%"></div>
          </div>
          <div class="usage-stats">
            <span class="usage-percentage">${data.opusOnly.percentage}%</span>
            <span class="usage-reset">${data.opusOnly.reset}</span>
          </div>
        </div>
      `;
    }

    if (lastUpdate) {
      const updateTime = new Date(lastUpdate);
      const now = new Date();
      const diffMinutes = Math.floor((now - updateTime) / 60000);
      
      let timeText;
      if (diffMinutes < 1) {
        timeText = 'たった今';
      } else if (diffMinutes < 60) {
        timeText = `${diffMinutes}分前`;
      } else if (diffMinutes < 1440) {
        timeText = `${Math.floor(diffMinutes / 60)}時間前`;
      } else {
        timeText = updateTime.toLocaleString('ja-JP');
      }

      html += `
        <div class="widget-footer">
          最終更新: ${timeText}
        </div>
      `;
    }

    content.innerHTML = html;
  }

  // ウィジェットを初期化
  function initWidget() {
    console.log('[Claude Usage Widget] Initializing widget...');
    
    chrome.storage.local.get(['widgetVisible', 'widgetCollapsed'], (result) => {
      console.log('[Claude Usage Widget] Storage result:', result);
      
      // widgetVisibleを明示的にチェック（undefined の場合は true として扱う）
      const shouldShow = result.widgetVisible === undefined ? true : result.widgetVisible;
      
      if (!shouldShow) {
        console.log('[Claude Usage Widget] Widget is set to hidden, not creating');
        return;
      }

      console.log('[Claude Usage Widget] Creating widget');
      createWidget();

      // 折りたたみ状態を復元
      if (result.widgetCollapsed) {
        widget.classList.add('collapsed');
        const toggleBtn = widget.querySelector('#widget-toggle');
        if (toggleBtn) {
          toggleBtn.textContent = '+';
          toggleBtn.title = '展開';
        }
      }
      
      console.log('[Claude Usage Widget] Widget created successfully');
    });
  }

  // DOMContentLoadedまたはページ読み込み後に初期化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidget);
  } else {
    // DOMが既に読み込まれている場合
    initWidget();
  }

  // ページ変更を監視
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      console.log('[Claude Usage Widget] URL changed from', lastUrl, 'to', url);
      lastUrl = url;
      if (widget) {
        if (isUsagePage()) {
          console.log('[Claude Usage Widget] Moved to usage page, fetching data');
          fetchUsageData();
          // 自動更新を再開
          if (updateInterval) {
            clearInterval(updateInterval);
          }
          updateInterval = setInterval(fetchUsageData, 5 * 60 * 1000);
        } else {
          console.log('[Claude Usage Widget] Moved away from usage page, stopping auto-update');
          // 使用量ページ以外では自動更新を停止
          if (updateInterval) {
            clearInterval(updateInterval);
            updateInterval = null;
          }
          loadCachedData();
        }
      }
    }
  });
  
  observer.observe(document, { subtree: true, childList: true });
  console.log('[Claude Usage Widget] Page change observer set up');

})();
