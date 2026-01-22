import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { simpleGit } from "simple-git";
import { findAppsInWorkspace } from "./appSelector";

/**
 * Manages the Webview Panel that acts as the Form/Wizard
 */
export class Wizard {
  private context: vscode.ExtensionContext;
  constructor(context: vscode.ExtensionContext, mainView: vscode.TreeView<any>) {
    this.context = context;

    // Register commands for creating C and Rust apps, used for onboarding walkthrough buttons
    context.subscriptions.push(vscode.commands.registerCommand("ledgerDevTools.newCApp", async () => {
      this.generateApp("c");
    }),
    );
    context.subscriptions.push(vscode.commands.registerCommand("ledgerDevTools.newRustApp", async () => {
      this.generateApp("rust");
    }),
    );

    // On activation, check if we need to open the walkthrough, if mainView is visible
    if (mainView.visible) {
      this.showIfNeeded();
    }

    // On mainView visibility change, check if we need to open the walkthrough
    context.subscriptions.push(
      mainView.onDidChangeVisibility((e) => {
        if (e.visible) {
          this.showIfNeeded();
        }
      }),
    );
  }

  public async showIfNeeded() {
    // Check globalState FIRST - this takes priority over appList check
    const wizardCtxData = this.context.globalState.get<{ id: string; open: boolean }>("openWalkthroughOnStartup");
    console.log(`Wizard showIfNeeded called, wizardCtxData:`, wizardCtxData);

    if (wizardCtxData && wizardCtxData.open === true) {
      console.log("Opening walkthrough from globalState:", wizardCtxData.id);
      await this.context.globalState.update("openWalkthroughOnStartup", undefined);
      await vscode.commands.executeCommand("workbench.action.openWalkthrough", wizardCtxData.id, false);
      return;
    }

    // Only check appList if no globalState walkthrough was set
    const appList = findAppsInWorkspace();
    console.log("appList length:", appList ? appList.length : 0);

    if (!appList || appList.length === 0) {
      await vscode.commands.executeCommand("workbench.action.openWalkthrough", "LedgerHQ.ledger-dev-tools#ledgerOnboarding", false);
    }
  };

  /**
   * Logic to clone and customize the app
   */
  private async generateApp(sdk: string) {
    const appName = await vscode.window.showInputBox({
      prompt: "Enter the name of your app repo folder",
      value: "app-boilerplate",
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
    //   if (!fs.existsSync(fullPath)) {
    //     fs.mkdirSync(fullPath);
    //   }

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
          // Do nothing yet
        }
        else {
          await this.context.globalState.update("openWalkthroughOnStartup", { id: "LedgerHQ.ledger-dev-tools#cDeviceAppCustomization", open: true });
        }
        vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(fullPath), { forceNewWindow: false });
      }
    }
    catch (error) {
      vscode.window.showErrorMessage("Failed to create app: " + error);
    }
  }
}
