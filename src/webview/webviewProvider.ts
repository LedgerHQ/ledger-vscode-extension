import * as vscode from "vscode";
import { TaskSpec } from "../taskProvider";
import { setSelectedTests } from "../appSelector";
import { LedgerDevice, SpecialAllDevice } from "../targetSelector";

/**
 * Manages the Webview Panel that acts as the Form/Wizard
 */
export class Webview implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private appSelectedEmitter: vscode.EventEmitter<string> = new vscode.EventEmitter<string>();
  public onAppSelectedEvent: vscode.Event<string> = this.appSelectedEmitter.event;
  private targetSelectedEmitter: vscode.EventEmitter<string> = new vscode.EventEmitter<string>();
  public onTargetSelectedEvent: vscode.Event<string> = this.targetSelectedEmitter.event;
  // Promise resolve for when the webview is ready
  private _webviewReadyResolve!: () => void;
  private _webviewReady: Promise<void>;

  constructor(private readonly _extensionUri: vscode.Uri) {
    this._webviewReady = new Promise((resolve) => {
      this._webviewReadyResolve = resolve;
    });
  }

  // Show the webview
  public async show() {
    await vscode.commands.executeCommand("workbench.view.extension.ledger-tools");
    await vscode.commands.executeCommand("setContext", "myApp.showWizard", true);
    await vscode.commands.executeCommand("appWebView.focus");
  }

  public async addTestCasesToWebview(testCases: string[], selectedTestCases: string[] = []) {
    await this._webviewReady;
    if (this._view) {
      this._view.webview.postMessage({
        command: "addTestCases",
        testCases: testCases,
        selectedTestCases: selectedTestCases,
      });
    }
  }

  public async addAppsToWebview(apps: string[], selectedApp: string) {
    await this._webviewReady;
    if (this._view) {
      console.log("Adding apps to webview :", apps, " selected :", selectedApp);
      this._view.webview.postMessage({
        command: "addApps",
        apps: apps,
        selectedApp: selectedApp,
      });
    }
  }

  public async addTargetsToWebview(targets: (LedgerDevice | SpecialAllDevice)[], selectedTarget: string) {
    await this._webviewReady;
    if (this._view) {
      const targetsNames: string[] = targets.map(device => device.toString());
      this._view.webview.postMessage({
        command: "addTargets",
        targets: targetsNames,
        selectedTarget: selectedTarget,
      });
    }
  }

  public async addTasksToWebview(specs: TaskSpec[]) {
    await this._webviewReady;
    if (this._view) {
      this._view.webview.postMessage({
        command: "addTasks",
        specs: specs,
      });
    }
  }

  public async onEndTaskProcess(taskName: string, success: boolean) {
    await this._webviewReady;
    if (this._view) {
      this._view.webview.postMessage({
        command: "endTaskProcess",
        taskName: taskName,
        success: success,
      });
    }
  }

  // Called when the webview is resolved
  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    // Enable scripts in the webview
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    // Set the HTML content for the webview
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Listen messages from the webview (frontend)
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.command) {
        case "webviewReady":
          {
            console.log("Webview signaled ready");
            // Signal that the webview is ready - this resolves pending addToWebview calls
            this._webviewReadyResolve();
          }
          break;
        case "executeTask":
          {
            const taskName: string = data.taskName;
            console.log("Executing task from webview : ", taskName);
            await vscode.commands.executeCommand("executeTask", taskName);
          }
          break;
        case "updateSelectedTests":
          {
            const selectedTests: string[] = data.selectedTests;
            console.log("Updating selected tests from webview : ", selectedTests);
            setSelectedTests(selectedTests);
          }
          break;
        case "appSelected":
          {
            const selectedApp: string = data.selectedApp;
            console.log("App selected in webview : ", selectedApp);
            this.appSelectedEmitter.fire(selectedApp);
          }
          break;
        case "refreshTests":
          {
            console.log("Refresh tests requested from webview");
            await vscode.commands.executeCommand("refreshTests");
          }
          break;
        case "targetSelected":
          {
            const selectedTarget: string = data.selectedTarget;
            console.log("Updating selected target from webview : ", selectedTarget);
            this.targetSelectedEmitter.fire(selectedTarget);
          }
          break;
      }
    });
  }

  /**
   * Returns the HTML shell for the Svelte webview
   */
  private _getHtmlForWebview(webview: vscode.Webview) {
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
