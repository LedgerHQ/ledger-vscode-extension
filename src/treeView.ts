import * as vscode from "vscode";
import { getSelectedTarget } from "./targetSelector";

export class TreeDataProvider implements vscode.TreeDataProvider<TreeItem> {
  data: TreeItem[];

  constructor() {
    let buildAppDebug = new TreeItem("Build app [debug]");
    buildAppDebug.command = {
      command: "executeTask",
      title: "Build app [debug]",
      arguments: ["Build app [debug]"],
    };

    let buildApp = new TreeItem("Build app");
    buildApp.command = {
      command: "executeTask",
      title: "Build app",
      arguments: ["Build app"],
    };

    let selectTarget = new TreeItem("Select build target");
    selectTarget.command = {
      command: "selectTarget",
      title: "Select build target",
      arguments: [],
    };

    let runDevToolsImage = new TreeItem("Run dev-tools Docker image");
    runDevToolsImage.command = {
      command: "executeTask",
      title: "Run dev-tools image",
      arguments: ["Run dev-tools image"],
    };

    let openDevToolsTerminal = new TreeItem("Open dev-tools container terminal");
    openDevToolsTerminal.command = {
      command: "executeTask",
      title: "Open dev-tools container terminal",
      arguments: ["Open dev-tools container terminal"],
    };

    let clean = new TreeItem("Clean build files");
    clean.command = {
      command: "executeTask",
      title: "Clean build files",
      arguments: ["Clean build files"],
    };

    let build = new TreeItem("Build", [buildApp, buildAppDebug, clean]);
    build.id = "buildItems";

    let runTests = new TreeItem("Run functional tests");
    runTests.command = {
      command: "executeTask",
      title: "Run functional tests",
      arguments: ["Run functional tests"],
    };

    let runTestsDisplay = new TreeItem("Run functional tests (with display)");
    runTestsDisplay.command = {
      command: "executeTask",
      title: "Run functional tests (with display)",
      arguments: ["Run functional tests (with display)"],
    };

    let installTestsReqs = new TreeItem("Install tests requirements");
    installTestsReqs.command = {
      command: "executeTask",
      title: "Install tests requirements",
      arguments: ["Install tests requirements"],
    };

    let tests = new TreeItem("Tests", [runTests, runTestsDisplay, installTestsReqs]);

    let loadApp = new TreeItem("Load app on device");
    loadApp.command = {
      command: "executeTask",
      title: "Load app on device",
      arguments: ["Load app on device"],
    };

    let loadAppReqs = new TreeItem("Install app loading requirements");
    loadAppReqs.command = {
      command: "executeTask",
      title: "Install app loading requirements",
      arguments: ["Install app loading requirements"],
    };

    let load = new TreeItem("App Loading", [loadApp, loadAppReqs]);

    this.data = [selectTarget, runDevToolsImage, openDevToolsTerminal, build, tests, load];

    this.updateTargetLabel();
  }

  private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<
    TreeItem | undefined | null | void
  >();

  readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return element;
  }

  getChildren(element?: TreeItem | undefined): vscode.ProviderResult<TreeItem[]> {
    if (element === undefined) {
      return this.data;
    }
    return element.children;
  }

  updateTargetLabel(): void {
    let buildItem = this.data.find((item) => item.id && item.id === "buildItems");
    if (buildItem) {
      buildItem.label = `Build [${getSelectedTarget()}]`;
    }
    this.refresh();
  }
}

export class TreeItem extends vscode.TreeItem {
  children: TreeItem[] | undefined;

  constructor(label: string, children?: TreeItem[]) {
    super(label, children === undefined ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Expanded);
    this.children = children;
  }
}
