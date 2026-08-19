"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const chatProvider_1 = require("./chatProvider");
function activate(context) {
    console.log('ArchForge AI extension is now active!');
    const chatProvider = new chatProvider_1.ChatViewProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(chatProvider_1.ChatViewProvider.viewType, chatProvider));
    let disposable = vscode.commands.registerCommand('archforge.askAI', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const selection = editor.selection;
            const text = editor.document.getText(selection);
            if (text) {
                // Focus the sidebar view
                vscode.commands.executeCommand('workbench.view.extension.archforge-sidebar');
                // Could optionally seed the input box or trigger an immediate question,
                // but for now, just opening the sidebar with the selection available 
                // in the active editor is enough because the chatProvider reads the active editor directly.
            }
            else {
                vscode.window.showInformationMessage('Please highlight some code first to ask ArchForge about it.');
            }
        }
    });
    context.subscriptions.push(disposable);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map