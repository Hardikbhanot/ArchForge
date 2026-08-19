import * as vscode from 'vscode';
import * as https from 'https';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'archforge.chatView';
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview();

        webviewView.webview.onDidReceiveMessage(async data => {
            switch (data.type) {
                case 'askQuestion': {
                    const editor = vscode.window.activeTextEditor;
                    let codeContext = '';
                    if (editor) {
                        const selection = editor.selection;
                        if (selection && !selection.isEmpty) {
                            codeContext = editor.document.getText(selection);
                        } else {
                            codeContext = editor.document.getText();
                        }
                    }

                    try {
                        const answer = await this.queryArchForgeBackend(codeContext, data.value);
                        this._view?.webview.postMessage({ type: 'addResponse', value: answer });
                    } catch (err: any) {
                        this._view?.webview.postMessage({ type: 'addResponse', value: `Error: ${err.message}` });
                    }
                    break;
                }
            }
        });
    }

    public sendHighlightedCode(code: string) {
        if (this._view) {
            this._view.show?.(true);
            this._view.webview.postMessage({ type: 'setCodeContext', value: code });
        }
    }

    private queryArchForgeBackend(code: string, question: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const payload = JSON.stringify({ code, question });

            const options = {
                hostname: 'api.archforge.hbhanot.tech',
                port: 443,
                path: '/api/v1/extension/chat',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                }
            };

            const req = https.request(options, res => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.error) {
                            reject(new Error(json.error));
                        } else {
                            resolve(json.answer);
                        }
                    } catch (e) {
                        reject(new Error('Failed to parse backend response'));
                    }
                });
            });

            req.on('error', e => reject(e));
            req.write(payload);
            req.end();
        });
    }

    private _getHtmlForWebview() {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>ArchForge AI Chat</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    padding: 10px;
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                    box-sizing: border-box;
                }
                .chat-history {
                    flex-grow: 1;
                    overflow-y: auto;
                    margin-bottom: 10px;
                    padding-right: 5px;
                }
                .message {
                    margin-bottom: 15px;
                    padding: 10px;
                    border-radius: 8px;
                    line-height: 1.4;
                }
                .user-message {
                    background-color: rgba(59, 130, 246, 0.15);
                    border: 1px solid rgba(59, 130, 246, 0.3);
                }
                .ai-message {
                    background-color: rgba(139, 92, 246, 0.1);
                    border: 1px solid rgba(139, 92, 246, 0.2);
                }
                .input-container {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    padding-bottom: 20px;
                }
                textarea {
                    width: 100%;
                    min-height: 60px;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 4px;
                    padding: 8px;
                    resize: vertical;
                    box-sizing: border-box;
                }
                button {
                    background-color: #8b5cf6;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-weight: bold;
                    align-self: flex-end;
                }
                button:hover {
                    background-color: #7c3aed;
                }
                pre {
                    background-color: var(--vscode-textCodeBlock-background);
                    padding: 8px;
                    border-radius: 4px;
                    overflow-x: auto;
                }
                code {
                    font-family: var(--vscode-editor-font-family);
                }
            </style>
        </head>
        <body>
            <div class="chat-history" id="chat-history">
                <div class="message ai-message">
                    👋 <b>ArchForge AI</b><br><br>
                    I am connected to your local ArchForge server. Highlight code in your editor and ask me about its architectural impact!
                </div>
            </div>
            
            <div class="input-container">
                <textarea id="question-input" placeholder="Ask about architecture... (Shift+Enter for newline)"></textarea>
                <button id="ask-btn">Ask AI</button>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                
                const history = document.getElementById('chat-history');
                const input = document.getElementById('question-input');
                const btn = document.getElementById('ask-btn');

                btn.addEventListener('click', () => {
                    const text = input.value.trim();
                    if (text) {
                        appendMessage('You', text, 'user-message');
                        input.value = '';
                        vscode.postMessage({ type: 'askQuestion', value: text });
                    }
                });

                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        btn.click();
                    }
                });

                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.type) {
                        case 'addResponse':
                            appendMessage('ArchForge', message.value, 'ai-message');
                            break;
                    }
                });

                function appendMessage(sender, text, className) {
                    const div = document.createElement('div');
                    div.className = 'message ' + className;
                    
                    // Basic Markdown rendering
                    let formatted = text
                        .replace(/</g, '&lt;').replace(/>/g, '&gt;') // sanitize html tags first
                        .replace(/\\n/g, '<br>')
                        .replace(/\n/g, '<br>')
                        .replace(/### (.*?)(<br>|$)/g, '<h3>$1</h3>')
                        .replace(/## (.*?)(<br>|$)/g, '<h2>$1</h2>')
                        .replace(/# (.*?)(<br>|$)/g, '<h1>$1</h1>')
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        .replace(/\*(.*?)\*/g, '<em>$1</em>')
                        .replace(/```[a-z]*<br>([\s\S]*?)<br>```/g, '<pre><code>$1</code></pre>')
                        .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
                        .replace(/`([^`]+)`/g, '<code style="background: rgba(128,128,128,0.2); padding: 2px 4px; border-radius: 3px;">$1</code>');

                    div.innerHTML = '<b>' + sender + '</b><br><br>' + formatted;
                    history.appendChild(div);
                    history.scrollTop = history.scrollHeight;
                }
            </script>
        </body>
        </html>`;
    }
}
