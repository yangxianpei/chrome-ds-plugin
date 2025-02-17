// 创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'askDeepseek',
        title: '向 DeepSeek 提问',
        contexts: ['selection']
    });
});

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'askDeepseek') {
        // 先注入 content script
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
        });

        // 发送消息给 content script
        chrome.tabs.sendMessage(tab.id, {
            type: 'INJECT_SIDEBAR',
            text: info.selectionText
        });
    }
});

// 监听关闭侧边栏的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'CLOSE_SIDEBAR') {
        chrome.tabs.sendMessage(sender.tab.id, { type: 'CLOSE_SIDEBAR' });
    }
});

function injectSidebar(selectedText) {
    // 检查是否已存在侧边栏
    if (document.getElementById('deepseek-sidebar-frame')) {
        return;
    }

    // 创建 iframe 用于加载侧边栏
    const iframe = document.createElement('iframe');
    iframe.id = 'deepseek-sidebar-frame';
    iframe.src = chrome.runtime.getURL('sidebar/sidebar.html');
    iframe.style.cssText = `
    position: fixed;
    top: 0;
    right: 0;
    width: 400px;
    height: 100vh;
    border: none;
    z-index: 10000;
  `;

    document.body.appendChild(iframe);

    // 等待 iframe 加载完成后发送选中的文本
    iframe.onload = () => {
        iframe.contentWindow.postMessage({
            type: 'SELECTED_TEXT',
            text: selectedText
        }, '*');
    };
} 