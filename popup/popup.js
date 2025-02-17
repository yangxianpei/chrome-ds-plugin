const providerModels = {
    deepseek: ['deepseek-chat', 'deepseek-coder'],
    siliconflow: ['deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B']
};

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('configForm');
    const providerSelect = document.getElementById('provider');
    const modelSelect = document.getElementById('model');
    const apiKeyInput = document.getElementById('apiKey');
    const togglePassword = document.getElementById('togglePassword');
    const openChatBtn = document.createElement('button');

    // 加载已保存的配置
    chrome.storage.local.get(['provider', 'model', 'apiKey'], (result) => {
        if (result.provider) {
            providerSelect.value = result.provider;
            updateModelOptions();
        }
        if (result.model) modelSelect.value = result.model;
        if (result.apiKey) apiKeyInput.value = result.apiKey;
    });

    // 服务商选择变化时更新模型选项
    providerSelect.addEventListener('change', updateModelOptions);

    // 显示/隐藏密码
    togglePassword.addEventListener('click', function () {
        const type = apiKeyInput.getAttribute('type') === 'password' ? 'text' : 'password';
        apiKeyInput.setAttribute('type', type);

        // 切换图标
        const icon = this.querySelector('i');
        icon.classList.toggle('bi-eye');
        icon.classList.toggle('bi-eye-slash');
    });

    function updateModelOptions() {
        const provider = providerSelect.value;
        modelSelect.disabled = !provider;
        modelSelect.innerHTML = '<option value="">请选择模型</option>';

        if (provider && providerModels[provider]) {
            providerModels[provider].forEach(model => {
                const option = document.createElement('option');
                option.value = model;
                option.textContent = model;
                modelSelect.appendChild(option);
            });
        }
    }

    // 表单提交处理
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const config = {
            provider: providerSelect.value,
            model: modelSelect.value,
            apiKey: apiKeyInput.value
        };

        if (!config.provider || !config.model || !config.apiKey) {
            showAlert('请填写所有必要信息', 'danger');
            return;
        }

        // 验证API Key
        try {
            const baseUrl = config.provider === 'deepseek'
                ? 'https://api.deepseek.com'
                : 'https://api.siliconflow.cn';

            const response = await fetch(`${baseUrl}/v1/user/info`, {
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`
                }
            });

            if (!response.ok) {
                throw new Error('API Key 验证失败');
            }

            // 保存配置
            await chrome.storage.local.set(config);
            showAlert('配置已保存', 'success');
            setTimeout(() => {
                window.close();
            }, 1500);
        } catch (error) {
            showAlert('错误：' + error.message, 'danger');
        }
    });

    // 添加聊天按钮
    openChatBtn.className = 'btn btn-primary mb-3 w-100';
    openChatBtn.textContent = '打开聊天';
    openChatBtn.addEventListener('click', async () => {
        try {
            const config = await chrome.storage.local.get(['provider', 'model', 'apiKey']);
            if (!config.provider || !config.model || !config.apiKey) {
                showAlert('请先完成配置后再打开聊天', 'warning');
                return;
            }

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                showAlert('无法获取当前标签页', 'danger');
                return;
            }

            try {
                // 直接发送消息给 content script
                await chrome.tabs.sendMessage(tab.id, {
                    type: 'INJECT_SIDEBAR',
                    text: ''
                });
                window.close();
            } catch (error) {
                // 如果发送失败，说明 content script 未加载
                console.log('Initial message failed, trying to reload:', error);

                // 刷新页面
                await chrome.tabs.reload(tab.id);

                // 监听页面加载完成
                chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                    if (tabId === tab.id && info.status === 'complete') {
                        // 移除监听器
                        chrome.tabs.onUpdated.removeListener(listener);

                        // 等待一段时间确保 content script 加载完成
                        setTimeout(async () => {
                            try {
                                await chrome.tabs.sendMessage(tab.id, {
                                    type: 'INJECT_SIDEBAR',
                                    text: ''
                                });
                                window.close();
                            } catch (err) {
                                console.error('Failed to send message after reload:', err);
                                showAlert('打开聊天失败，请手动刷新页面后重试', 'danger');
                            }
                        }, 1000);
                    }
                });
            }
        } catch (error) {
            console.error('Error in openChatBtn click handler:', error);
            showAlert('打开聊天失败：' + error.message, 'danger');
        }
    });

    // 将聊天按钮插入到表单最前面
    form.insertBefore(openChatBtn, form.firstChild);

    function showAlert(message, type) {
        // 移除现有的提示
        const existingAlert = document.querySelector('.alert');
        if (existingAlert) {
            existingAlert.remove();
        }

        // 创建新的提示
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} mt-3`;
        alert.textContent = message;
        form.appendChild(alert);

        // 自动消失
        if (type === 'success') {
            setTimeout(() => {
                alert.remove();
            }, 1500);
        }
    }

    // 获取知乎、掘金和微博热搜
    fetchZhihuHot();
    fetchJuejinHot();
    fetchWeiboHot();
});

// 添加获取知乎热搜的函数
async function fetchZhihuHot() {
    try {
        const response = await fetch('https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50', {
            headers: {
                'Content-Type': 'application/json',
                // 添加必要的请求头
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (!response.ok) {
            throw new Error('获取知乎热搜失败');
        }

        const data = await response.json();

        // 获取前5条热搜
        const hotItems = data.data.slice(0, 5).map((item, index) => {
            const target = item.target;
            return {
                index: index + 1,
                title: target.title,
                url: `https://www.zhihu.com/question/${target.id}`,
                heat: target.detail_text || ''
            };
        });

        // 更新DOM
        const hotList = document.getElementById('hotList');
        hotList.innerHTML = hotItems.map(item => `
            <li class="hot-item">
                <a href="${item.url}" target="_blank" title="${item.title}">
                    <span class="hot-index">${item.index}</span>
                    ${item.title}
                    <small style="color: #999; margin-left: 8px;">${item.heat}</small>
                </a>
            </li>
        `).join('');

        // 添加点击事件处理
        hotList.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                chrome.tabs.create({ url: link.href });
            });
        });
    } catch (error) {
        console.error('获取知乎热搜失败:', error);
        const hotList = document.getElementById('hotList');
        hotList.innerHTML = `
            <li class="hot-item" style="color: #999; text-align: center;">
                获取热搜失败，请稍后重试
            </li>
        `;
    }
}

// 添加自动刷新功能
let refreshInterval;

function startAutoRefresh() {
    // 每5分钟刷新一次
    refreshInterval = setInterval(() => {
        fetchZhihuHot();
        fetchJuejinHot();
        fetchWeiboHot();
    }, 5 * 60 * 1000);
}

function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
}

// 当弹窗打开时开始自动刷新
document.addEventListener('DOMContentLoaded', startAutoRefresh);

// 当弹窗关闭时停止自动刷新
window.addEventListener('unload', stopAutoRefresh);

// 添加获取掘金热搜的函数
async function fetchJuejinHot() {
    try {
        const response = await fetch('https://api.juejin.cn/content_api/v1/content/article_rank?category_id=1&type=hot', {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('获取掘金热搜失败');
        }

        const data = await response.json();

        // 获取前5条热搜
        const hotItems = data.data.slice(0, 5).map((item, index) => {
            return {
                index: index + 1,
                title: item.content.title,
                url: `https://juejin.cn/post/${item.content.content_id}`,
                author: item.author.name,
                viewCount: item.content_counter.view
            };
        });

        // 更新DOM
        const juejinHotList = document.getElementById('juejinHotList');
        juejinHotList.innerHTML = hotItems.map(item => `
            <li class="hot-item">
                <a href="${item.url}" target="_blank" title="${item.title}">
                    <span class="hot-index">${item.index}</span>
                    ${item.title}
                    <div class="hot-meta">
                        <span class="author">${item.author}</span>
                        <span class="view-count">${item.viewCount} 阅读</span>
                    </div>
                </a>
            </li>
        `).join('');

        // 添加点击事件处理
        juejinHotList.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                chrome.tabs.create({ url: link.href });
            });
        });
    } catch (error) {
        console.error('获取掘金热搜失败:', error);
        const juejinHotList = document.getElementById('juejinHotList');
        juejinHotList.innerHTML = `
            <li class="hot-item" style="color: #999; text-align: center;">
                获取热搜失败，请稍后重试
            </li>
        `;
    }
}

// 添加获取微博热搜的函数
async function fetchWeiboHot() {
    try {
        const response = await fetch('https://weibo.com/ajax/side/hotSearch', {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('获取微博热搜失败');
        }

        const data = await response.json();

        // 获取前5条热搜
        const hotItems = data.data.realtime.slice(0, 5).map((item, index) => {
            return {
                index: index + 1,
                title: item.word,
                url: `https://s.weibo.com/weibo?q=${encodeURIComponent(item.word)}`,
                tag: item.icon_desc || '',
                num: item.num ? `${Math.floor(item.num / 10000)}万` : ''
            };
        });

        // 更新DOM
        const weiboHotList = document.getElementById('weiboHotList');
        weiboHotList.innerHTML = hotItems.map(item => `
            <li class="hot-item">
                <a href="${item.url}" target="_blank" title="${item.title}">
                    <span class="hot-index">${item.index}</span>
                    ${item.title}
                    ${item.tag ? `<span class="hot-tag ${item.tag.toLowerCase()}">${item.tag}</span>` : ''}
                    ${item.num ? `<small style="color: #999; margin-left: 8px;">${item.num}讨论</small>` : ''}
                </a>
            </li>
        `).join('');

        // 添加点击事件处理
        weiboHotList.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                chrome.tabs.create({ url: link.href });
            });
        });
    } catch (error) {
        console.error('获取微博热搜失败:', error);
        const weiboHotList = document.getElementById('weiboHotList');
        weiboHotList.innerHTML = `
            <li class="hot-item" style="color: #999; text-align: center;">
                获取热搜失败，请稍后重试
            </li>
        `;
    }
}

