import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { simpleGit } from "simple-git";
import { findAppsInWorkspace } from "./appSelector";
import { Webview } from "./webview/webviewProvider";

/**
 * Manages the app creation wizard and post-creation walkthroughs.
 */
export class Wizard {
  private context: vscode.ExtensionContext;
  private _startupCheckDone = false;
  constructor(context: vscode.ExtensionContext, mainView: Webview) {
    this.context = context;

    // Register commands for creating C and Rust apps, used for onboarding walkthrough buttons
    context.subscriptions.push(vscode.commands.registerCommand("ledgerDevTools.newCApp", async () => {
      this.generateApp("c");
    }));
    context.subscriptions.push(vscode.commands.registerCommand("ledgerDevTools.newRustApp", async () => {
      this.generateApp("rust");
    }));

    // When the webview is ready, open any scheduled walkthrough (post app-creation),
    // or the onboarding walkthrough if no apps are found in the workspace.
    context.subscriptions.push(
      mainView.onWebviewReadyEvent(async () => {
        if (this._startupCheckDone) {
          return;
        }
        this._startupCheckDone = true;

        const pending = context.globalState.get<{ id: string }>("openWalkthroughOnStartup");
        if (pending) {
          await context.globalState.update("openWalkthroughOnStartup", undefined);
          vscode.commands.executeCommand("workbench.action.openWalkthrough", pending.id, false);
          return;
        }

        const appList = findAppsInWorkspace();
        if (!appList || appList.length === 0) {
          vscode.commands.executeCommand("workbench.action.openWalkthrough", "LedgerHQ.ledger-dev-tools#ledgerOnboarding", false);
        }
      }),
    );
  }

  /**
   * Logic to clone and customize the app
   */
  private async generateApp(sdk: string) {
    const appName = await vscode.window.showInputBox({
      prompt: "Enter the name of your app repo folder",
      value: `app-boilerplate${sdk === "rust" ? "-rust" : ""}`,
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return "App name cannot be empty.";
        }
        return null;
      },
    });

    if (!appName) {
      return;
    }

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

    const projectPath = folderUri[0].fsPath;
    const fullPath = path.join(projectPath, appName);

    // 2. Determine Repo URL based on selection
    const repoUrl = sdk === "rust"
      ? "https://github.com/LedgerHQ/app-boilerplate-rust"
      : "https://github.com/LedgerHQ/app-boilerplate";

    try {
      vscode.window.showInformationMessage(`Generating ${sdk.toUpperCase()} app in ${fullPath}...`);
      // Clone repo
      const git = simpleGit();
      await git.clone(repoUrl, fullPath);

      // Remove .git folder to detach from original repo and initialize a new one
      fs.rmSync(path.join(fullPath, ".git"), { recursive: true, force: true });
      await simpleGit(fullPath).init();
      await simpleGit(fullPath).add("./*");
      await simpleGit(fullPath).commit("Initial commit");

      const openFolder = "Open Folder";
      const choice = await vscode.window.showInformationMessage(
        "App created successfully!",
        openFolder,
      );

      if (choice === openFolder) {
        if (sdk === "rust") {
          await this.context.globalState.update("openWalkthroughOnStartup", { id: "LedgerHQ.ledger-dev-tools#rustDeviceAppCustomization" });
        }
        else {
          await this.context.globalState.update("openWalkthroughOnStartup", { id: "LedgerHQ.ledger-dev-tools#cDeviceAppCustomization" });
        }
        // Close all open editors so VS Code doesn't restore them (e.g. the onboarding walkthrough)
        // when it reopens with the new folder.
        await vscode.commands.executeCommand("workbench.action.closeAllEditors");
        vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(fullPath), { forceNewWindow: false });
      }
    }
    catch (error) {
      vscode.window.showErrorMessage("Failed to create app: " + error);
    }
  }
}
