// 监听来自 background.js 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Content script received message:', request); // 添加调试日志

    if (request.type === 'INJECT_SIDEBAR') {
        try {
            // 检查是否已经存在侧边栏
            let container = document.getElementById('deepseek-sidebar-container');
            if (container) {
                console.log('Sidebar already exists, sending text to iframe'); // 调试日志
                const iframe = document.getElementById('deepseek-sidebar-frame');
                if (iframe) {
                    iframe.contentWindow.postMessage({
                        type: 'SELECTED_TEXT',
                        text: request.text
                    }, '*');
                }
                return;
            }

            console.log('Injecting new sidebar'); // 调试日志
            injectSidebar(request.text);
        } catch (error) {
            console.error('Error injecting sidebar:', error); // 错误日志
        }
    } else if (request.type === 'CLOSE_SIDEBAR') {
        const container = document.getElementById('deepseek-sidebar-container');
        if (container) {
            container.remove();
        }
    }
});

// 监听来自 iframe 的消息
window.addEventListener('message', async (event) => {
    if (event.data.type === 'CLOSE_SIDEBAR') {
        const container = document.getElementById('deepseek-sidebar-container');
        if (container) {
            container.remove();
        }
    } else if (event.data.type === 'GET_CONFIG') {
        // 获取配置并发送回 iframe
        chrome.storage.local.get(['provider', 'model', 'apiKey'], (result) => {
            const iframe = document.getElementById('deepseek-sidebar-frame');
            if (iframe) {
                iframe.contentWindow.postMessage({
                    type: 'CONFIG_RESPONSE',
                    config: result
                }, '*');
            }
        });
    } else if (event.data.type === 'TOGGLE_FULLSCREEN') {
        const container = document.getElementById('deepseek-sidebar-container');
        if (container) {
            if (event.data.fullscreen) {
                // 进入全屏 - 从右向左展开
                container.style.cssText = `
                    position: fixed;
                    top: 0;
                    right: 0;
                    width: 100vw;
                    height: 100vh;
                    z-index: 2147483647;
                    background: white;
                    box-shadow: none;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    transform-origin: right center;
                `;
            } else {
                // 退出全屏 - 从左向右收缩
                container.style.cssText = `
                    position: fixed;
                    top: 0;
                    right: 0;
                    width: 400px;
                    height: 100vh;
                    z-index: 2147483647;
                    background: white;
                    box-shadow: -2px 0 5px rgba(0,0,0,0.1);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    transform-origin: right center;
                `;
            }
        }
    }
});

function injectSidebar(selectedText) {
    console.log('Injecting sidebar with text:', selectedText); // 调试日志

    // 创建容器
    const container = document.createElement('div');
    container.id = 'deepseek-sidebar-container';
    container.style.cssText = `
        position: fixed;
        top: 0;
        right: 0;
        width: 400px;
        height: 100vh;
        z-index: 2147483647;
        background: white;
        box-shadow: -2px 0 5px rgba(0,0,0,0.1);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        transform-origin: right center;
    `;

    // 创建 iframe
    const iframe = document.createElement('iframe');
    iframe.id = 'deepseek-sidebar-frame';
    iframe.src = chrome.runtime.getURL('sidebar/sidebar.html');
    iframe.style.cssText = `
        width: 100%;
        height: 100%;
        border: none;
        background: white;
    `;

    container.appendChild(iframe);
    document.body.appendChild(container);

    // 等待 iframe 加载完成后发送选中的文本
    iframe.onload = () => {
        console.log('Iframe loaded, sending text:', selectedText); // 调试日志
        iframe.contentWindow.postMessage({
            type: 'SELECTED_TEXT',
            text: selectedText
        }, '*');
    };

    // 添加拖动调整宽度的功能
    const resizeHandle = document.createElement('div');
    resizeHandle.style.cssText = `
        position: absolute;
        left: 0;
        top: 0;
        width: 4px;
        height: 100%;
        cursor: ew-resize;
        background: transparent;
    `;
    container.appendChild(resizeHandle);

    let isResizing = false;
    let startX, startWidth;

    resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = container.offsetWidth;
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const width = startWidth - (e.clientX - startX);
        if (width > 300 && width < window.innerWidth - 100) {
            container.style.width = width + 'px';
        }
    });

    document.addEventListener('mouseup', () => {
        isResizing = false;
        document.body.style.userSelect = '';
    });
}

// 初始化时立即注册消息监听器
console.log('Content script loaded'); // 调试日志 