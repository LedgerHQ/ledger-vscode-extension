import * as vscode from "vscode";
import { TaskSpec } from "../taskProvider";
import { setSelectedTests } from "../appSelector";
import { LedgerDevice, SpecialAllDevice } from "../targetSelector";

/**
 * Options for refreshing the webview content.
 * - undefined: skip, don't update this section
 * - null: clear the content for this section
 * - object: update with provided data
 */
export interface WebviewRefreshOptions {
  apps?: {
    list: string[];
    selected: string;
  } | null;
  targets?: {
    list: (LedgerDevice | SpecialAllDevice)[];
    selected: string;
  } | null;
  buildUseCases?: {
    list: string[];
    selected: string;
  } | null;
  testCases?: {
    list: string[];
    selected?: string[];
  } | null;
  tasks?: {
    list: TaskSpec[];
  } | null;
  variants?: {
    list: string[];
    selected: string;
  } | null;
}

/**
 * Manages the Webview Panel that acts as the Form/Wizard
 */
export class Webview implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private appSelectedEmitter: vscode.EventEmitter<string> = new vscode.EventEmitter<string>();
  public onAppSelectedEvent: vscode.Event<string> = this.appSelectedEmitter.event;
  private targetSelectedEmitter: vscode.EventEmitter<string> = new vscode.EventEmitter<string>();
  public onTargetSelectedEvent: vscode.Event<string> = this.targetSelectedEmitter.event;
  private useCaseSelectedEmitter: vscode.EventEmitter<string> = new vscode.EventEmitter<string>();
  public onUseCaseSelectedEvent: vscode.Event<string> = this.useCaseSelectedEmitter.event;
  // Promise resolve for when the webview is ready
  private _webviewReadyResolve!: () => void;
  private _webviewReady: Promise<void>;

  constructor(private readonly _extensionUri: vscode.Uri) {
    this._webviewReady = new Promise((resolve) => {
      this._webviewReadyResolve = resolve;
    });
  }

  // Wait until the webview is fully loaded and ready
  public async waitUntilReady(): Promise<void> {
    return this._webviewReady;
  }

  /**
   * Refresh webview with optional data updates.
   * - undefined: skip, don't update this section
   * - null: clear the content for this section
   * - object: update with provided data
   */
  public async refresh(options: WebviewRefreshOptions): Promise<void> {
    await this._webviewReady;
    if (!this._view) {
      return;
    }

    if (options.apps !== undefined) {
      this._view.webview.postMessage({
        command: "addApps",
        apps: options.apps?.list ?? [],
        selectedApp: options.apps?.selected ?? "",
      });
    }

    if (options.targets !== undefined) {
      const targetsNames = options.targets?.list.map(device => device.toString()) ?? [];
      this._view.webview.postMessage({
        command: "addTargets",
        targets: targetsNames,
        selectedTarget: options.targets?.selected ?? "",
      });
    }

    if (options.buildUseCases !== undefined) {
      this._view.webview.postMessage({
        command: "addBuildUseCases",
        buildUseCases: options.buildUseCases?.list ?? [],
        selectedBuildUseCase: options.buildUseCases?.selected ?? "",
      });
    }

    if (options.testCases !== undefined) {
      this._view.webview.postMessage({
        command: "addTestCases",
        testCases: options.testCases?.list ?? [],
        selectedTestCases: options.testCases?.selected ?? [],
      });
    }

    if (options.tasks !== undefined) {
      this._view.webview.postMessage({
        command: "addTasks",
        specs: options.tasks?.list ?? [],
      });
    }

    if (options.variants !== undefined) {
      this._view.webview.postMessage({
        command: "addVariants",
        variants: options.variants?.list ?? [],
        selectedVariant: options.variants?.selected ?? "",
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
        case "openApp":
          {
            console.log("Open app folder requested from webview");
            await vscode.commands.executeCommand("vscode.openFolder");
          }
          break;
        case "openWorkspace":
          {
            console.log("Open workspace folder requested from webview");
            await vscode.commands.executeCommand("workbench.action.openWorkspace");
          }
          break;
        case "buildUseCaseSelected":
          {
            const selectedBuildUseCase: string = data.selectedBuildUseCase;
            console.log("Updating selected build use case from webview : ", selectedBuildUseCase);
            this.useCaseSelectedEmitter.fire(selectedBuildUseCase);
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
    const wordmarkUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "resources", "ledger-wordmark-transparent.png"));

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
            <script>
              window.resourceUris = {
                wordmark: "${wordmarkUri}"
              };
            </script>
            <script src="${scriptUri}"></script>
        </body>
        </html>`;
  }
}
