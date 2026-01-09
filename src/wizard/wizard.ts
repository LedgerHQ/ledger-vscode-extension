import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { simpleGit } from "simple-git";

/**
 * Manages the Webview Panel that acts as the Form/Wizard
 */
export class WizardProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  // Show the webview
  public show() {
    if (this._view) {
      this._view.show(true);
    }
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
          await this._handleGeneration(data.data);
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
   * Logic to clone and customize the app
   */
  private async _handleGeneration(data: any) {
    console.log("Generating app with data:", data);
    // 1. Ask user where to save the project
    const folderUri = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: "Select Project Location",
    });

    if (!folderUri || folderUri.length === 0) {
      return;
    }

    // Placeholder for appName
    data.appName = data.appName || "app-ledger";
    data.coinName = data.coinName || "MyToken";
    data.curve = data.curve || "secp256k1";
    data.sdk = data.sdk || "c";

    const projectPath = folderUri[0].fsPath;
    const fullPath = path.join(projectPath, data.appName);

    // 2. Determine Repo URL based on selection
    const repoUrl = data.sdk === "rust"
      ? "https://github.com/LedgerHQ/app-boilerplate-rust"
      : "https://github.com/LedgerHQ/app-boilerplate";

    try {
      vscode.window.showInformationMessage(`Scaffolding ${data.sdk} app in ${fullPath}...`);

      // For this demo, we just create the folder to show it worked
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath);
      }

      // Clone repo
      const git = simpleGit();
      vscode.window.showInformationMessage(`Cloning repository from ${repoUrl} in ${fullPath}...`);
      await git.clone(repoUrl, fullPath);

      const openNewWindow = "Open in New Window";
      const choice = await vscode.window.showInformationMessage(
        "App created successfully!",
        openNewWindow,
      );

      if (choice === openNewWindow) {
        vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(fullPath), true);
      }
    }
    catch (error) {
      vscode.window.showErrorMessage("Failed to create app: " + error);
    }
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
   * Returns the HTML for the Form
   */
  private _getHtmlForWebview(webview: vscode.Webview) {
    const nonce = this.getNonce();

    // Get the local path to main script run in the webview (bundled by webpack to dist/).
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "dist", "wizard.js"));

    // Do the same for the stylesheet.
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "src", "wizard", "wizard.css"));

    // Codicon stylesheet for vscode-icon component
    const codiconUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "dist", "codicon.css"));

    return /* html */ `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <!--
                Use a content security policy to only allow loading styles from our extension directory,
                and only allow scripts that have a specific nonce.
            -->
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
            <link href="${codiconUri}" rel="stylesheet" id="vscode-codicon-stylesheet" />
            <link href="${styleUri}" rel="stylesheet" />
        </head>
        <body>
            <div class="container">
                <vscode-icon name="close" id="closeBtn" close action-icon></vscode-icon>
                <h2 title>New Device App</h2>
                <!-- SDK SELECTION -->
                <div>
                   <label style="display:block; margin-bottom:8px; font-weight:bold;">Select SDK</label>
                   <vscode-radio-group id="sdk-group">
                        <vscode-radio value="c" checked class="selected">
                            <div class="radio-content">
                                <span class="radio-title">C Language</span>
                                <span class="radio-desc">Native & Compact</span>
                            </div>
                        </vscode-radio>
                        <vscode-radio value="rust">
                            <div class="radio-content">
                                <span class="radio-title">Rust</span>
                                <span class="radio-desc">Safe & Modern</span>
                            </div>
                        </vscode-radio>
                   </vscode-radio-group>
                </div>

                <!-- FORM FIELDS -->
                <div>
                    <vscode-textfield id="appName" placeholder="e.g. app-ethereum">Application Name</vscode-textfield>
                </div>

                <div>
                    <vscode-textfield id="coinName" placeholder="e.g. SOMECOIN">Coin / Token Name</vscode-textfield>
                </div>

                <div>
                    <label style="display:block; margin-bottom: 5px;">Cryptography Curve</label>
                    <vscode-single-select id="curve">
                        <vscode-option value="secp256k1" selected>secp256k1 (Bitcoin/Eth)</vscode-option>
                        <vscode-option value="ed25519">ed25519 (Solana/Polkadot)</vscode-option>
                        <vscode-option value="prime256v1">prime256v1 (NIST)</vscode-option>
                    </vscode-single-select>
                </div>

                <vscode-button id="createBtn">Create Application</vscode-button>
            </div>

            <script nonce="${nonce}" src="${scriptUri}"></script>
        </body>
        </html>`;
  }
}
