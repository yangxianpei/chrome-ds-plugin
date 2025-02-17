class Sidebar {
    constructor() {
        this.messages = document.getElementById('messages');
        this.userInput = document.getElementById('userInput');
        this.sendButton = document.getElementById('sendButton');
        this.toggleFullscreenBtn = document.getElementById('toggleFullscreen');
        this.closeButton = document.getElementById('closeButton');
        this.sidebar = document.querySelector('.sidebar');
        this.messageHistory = [];

        this.initializeEventListeners();
        this.initializeMarkdown();
    }

    initializeEventListeners() {
        // 发送消息
        this.sendButton.addEventListener('click', async () => {
            console.log('Send button clicked'); // 调试日志
            await this.sendMessage();
        });

        this.userInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                console.log('Enter pressed'); // 调试日志
                await this.sendMessage();
            }
        });

        // 全屏切换
        this.toggleFullscreenBtn.addEventListener('click', () => {
            console.log('Toggle fullscreen clicked'); // 调试日志

            // 切换全屏状态
            const isFullscreen = this.sidebar.classList.toggle('fullscreen');

            // 通知父窗口切换全屏状态
            window.parent.postMessage({
                type: 'TOGGLE_FULLSCREEN',
                fullscreen: isFullscreen
            }, '*');

            // 更新按钮图标
            const icon = this.toggleFullscreenBtn.querySelector('.fullscreen-icon');
            if (isFullscreen) {
                icon.textContent = '⮌';  // 退出全屏图标
            } else {
                icon.textContent = '⛶';  // 进入全屏图标
            }
        });

        // 关闭侧边栏
        this.closeButton.addEventListener('click', () => {
            console.log('Close button clicked'); // 调试日志
            window.parent.postMessage({ type: 'CLOSE_SIDEBAR' }, '*');
        });

        // 监听选中文本消息
        window.addEventListener('message', (event) => {
            console.log('Received message:', event.data); // 调试日志
            if (event.data.type === 'SELECTED_TEXT') {
                this.userInput.value = event.data.text;
            }
        });
    }

    initializeMarkdown() {
        if (typeof marked !== 'undefined') {
            marked.setOptions({
                highlight: function (code, lang) {
                    if (lang && hljs && hljs.getLanguage(lang)) {
                        try {
                            return hljs.highlight(code, { language: lang }).value;
                        } catch (e) {
                            console.error('代码高亮失败:', e);
                            return code;
                        }
                    }
                    return code;
                },
                breaks: true
            });
        } else {
            console.error('marked 库未加载');
        }
    }

    async sendMessage() {
        const message = this.userInput.value.trim();
        if (!message) {
            console.log('Empty message, not sending'); // 调试日志
            return;
        }

        console.log('Sending message:', message); // 调试日志

        try {
            const config = await this.getConfig();
            console.log('Got config:', config); // 调试日志

            const baseUrl = config.provider === 'deepseek'
                ? 'https://api.deepseek.com'
                : 'https://api.siliconflow.cn';

            this.addMessage(message, 'user');
            this.userInput.value = '';
            this.messageHistory.push({ role: 'user', content: message });

            console.log('Sending request to:', baseUrl); // 调试日志

            const response = await fetch(`${baseUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.apiKey}`
                },
                body: JSON.stringify({
                    model: config.model,
                    messages: this.messageHistory,
                    stream: true
                })
            });

            if (!response.ok) {
                throw new Error(`API 请求失败: ${response.status} ${response.statusText}`);
            }

            const reader = response.body.getReader();
            let assistantMessage = '';
            const messageElement = this.createMessageElement('', 'assistant');
            this.messages.appendChild(messageElement);

            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                // 将新数据添加到缓冲区
                buffer += decoder.decode(value, { stream: true });

                // 处理完整的行
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // 保留最后一个不完整的行

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine || trimmedLine === 'data: [DONE]') continue;

                    if (trimmedLine.startsWith('data: ')) {
                        try {
                            const jsonStr = trimmedLine.slice(6);
                            const data = JSON.parse(jsonStr);

                            if (data.choices?.[0]?.delta?.content) {
                                assistantMessage += data.choices[0].delta.content;
                                messageElement.innerHTML = marked.parse(assistantMessage);
                                messageElement.scrollIntoView({ behavior: 'smooth' });
                            }
                        } catch (e) {
                            console.error('解析数据失败:', trimmedLine, e);
                            continue;
                        }
                    }
                }
            }

            // 处理剩余的缓冲区数据
            if (buffer.trim()) {
                const trimmedLine = buffer.trim();
                if (trimmedLine.startsWith('data: ') && trimmedLine !== 'data: [DONE]') {
                    try {
                        const jsonStr = trimmedLine.slice(6);
                        const data = JSON.parse(jsonStr);

                        if (data.choices?.[0]?.delta?.content) {
                            assistantMessage += data.choices[0].delta.content;
                            messageElement.innerHTML = marked.parse(assistantMessage);
                            messageElement.scrollIntoView({ behavior: 'smooth' });
                        }
                    } catch (e) {
                        console.error('解析最后数据失败:', trimmedLine, e);
                    }
                }
            }

            this.messageHistory.push({ role: 'assistant', content: assistantMessage });
        } catch (error) {
            console.error('发送消息失败:', error); // 调试日志
            this.addMessage(`错误：${error.message}`, 'assistant');
        }
    }

    addMessage(content, role) {
        const messageElement = this.createMessageElement(content, role);
        this.messages.appendChild(messageElement);
        messageElement.scrollIntoView({ behavior: 'smooth' });
    }

    createMessageElement(content, role) {
        const div = document.createElement('div');
        div.className = `message ${role}`;
        div.innerHTML = role === 'user' ? content : marked.parse(content);
        return div;
    }

    async getConfig() {
        try {
            return await new Promise((resolve, reject) => {
                // 通过 postMessage 获取配置
                window.parent.postMessage({ type: 'GET_CONFIG' }, '*');

                // 监听配置响应
                const configListener = (event) => {
                    if (event.data.type === 'CONFIG_RESPONSE') {
                        window.removeEventListener('message', configListener);
                        if (event.data.config) {
                            resolve(event.data.config);
                        } else {
                            reject(new Error('请先完成配置'));
                        }
                    }
                };

                window.addEventListener('message', configListener);

                // 5秒超时
                setTimeout(() => {
                    window.removeEventListener('message', configListener);
                    reject(new Error('获取配置超时'));
                }, 5000);
            });
        } catch (error) {
            throw new Error('请先完成配置');
        }
    }
}

// 确保 DOM 加载完成后再初始化
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing Sidebar'); // 调试日志
    new Sidebar();
}); 