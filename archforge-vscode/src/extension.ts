import * as vscode from 'vscode';
import { ChatViewProvider } from './chatProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('ArchForge AI extension is now active!');

    const chatProvider = new ChatViewProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatProvider)
    );

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
            } else {
                vscode.window.showInformationMessage('Please highlight some code first to ask ArchForge about it.');
            }
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}
