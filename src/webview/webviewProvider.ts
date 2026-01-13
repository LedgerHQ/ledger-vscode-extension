import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { simpleGit } from "simple-git";

/**
 * Manages the Webview Panel that acts as the Form/Wizard
 */
export class Webview implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  // Show the webview
  public async show() {
    await vscode.commands.executeCommand("workbench.view.extension.ledger-tools");
    await vscode.commands.executeCommand("setContext", "myApp.showWizard", true);
    await vscode.commands.executeCommand("appWebView.focus");
  }

  // Cette méthode est appelée par VS Code dès que la vue devient visible
  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    // Options : on autorise le JS pour que le wizard soit interactif
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    // On injecte le contenu HTML
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // On écoute les messages qui viennent du HTML (ex: clic sur "Finish")
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.command) {
        case "generateApp":
          // Focus container first, then set context, then focus mainView
          await vscode.commands.executeCommand("workbench.view.extension.ledger-tools");
          await vscode.commands.executeCommand("setContext", "myApp.showWizard", false);
          await vscode.commands.executeCommand("mainView.focus");
          break;
        case "closeWizard":
          console.log("Closing wizard!!!!");
          // Focus container first, then set context, then focus mainView
          await vscode.commands.executeCommand("workbench.view.extension.ledger-tools");
          await vscode.commands.executeCommand("setContext", "myApp.showWizard", false);
          await vscode.commands.executeCommand("mainView.focus");
          break;
      }
    });
  }

  /**
   * Generates a nonce for Content Security Policy
   * @returns random nonce string
   */
  private getNonce() {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  /**
   * Returns the HTML shell for the Svelte webview
   */
  private _getHtmlForWebview(webview: vscode.Webview) {
    const nonce = this.getNonce();

    // Get the local path to main script run in the webview (bundled by webpack to dist/).
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "dist", "webview.js"));
    const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "dist", "codicon.css"));

    // TODO : add security policies
    return /* html */ `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${codiconsUri}" rel="stylesheet" id="vscode-codicon-stylesheet" />
            <title>Create Ledger App</title>
        </head>
        <body>
            <script src="${scriptUri}"></script>
        </body>
        </html>`;
  }
}
