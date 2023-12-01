import * as vscode from "vscode";
import * as path from "path";
import { TargetSelector } from "./targetSelector";
import { getSelectedApp } from "./appSelector";
import { TaskSpec } from "./taskProvider";
import { DevImageStatus } from "./containerManager";

export class TreeDataProvider implements vscode.TreeDataProvider<TreeItem> {
  private data: TreeItem[];
  private targetSelector: TargetSelector;

  constructor(targetSelector: TargetSelector) {
    this.data = [];
    this.targetSelector = targetSelector;
    this.addDefaultTreeItems();
    this.updateAppAndTargetLabels();
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

  private addTaskToTree(spec: TaskSpec): void {
    let taskItem = new TreeItem(spec.name);
    taskItem.tooltip = spec.toolTip;
    taskItem.command = {
      command: "executeTask",
      title: spec.name,
      arguments: [spec.name],
    };
    if (spec.group) {
      let rootItem = this.data.find((item) => item.label === spec.group);
      if (!rootItem) {
        rootItem = new TreeItem(spec.group);
        if (rootItem.label?.toString().startsWith("Docker Container")) {
          rootItem.iconPath = {
            light: path.join(__filename, "..", "..", "resources", "docker-light.png"),
            dark: path.join(__filename, "..", "..", "resources", "docker-dark.png"),
          };
        }
        if (rootItem.label?.toString().startsWith("Build")) {
          rootItem.iconPath = {
            light: path.join(__filename, "..", "..", "resources", "tool-light.png"),
            dark: path.join(__filename, "..", "..", "resources", "tool-dark.png"),
          };
        }
        if (rootItem.label?.toString().startsWith("Functional")) {
          rootItem.iconPath = {
            light: path.join(__filename, "..", "..", "resources", "test-light.png"),
            dark: path.join(__filename, "..", "..", "resources", "test-dark.png"),
          };
        }
        if (rootItem.label?.toString().startsWith("Device")) {
          rootItem.iconPath = {
            light: path.join(__filename, "..", "..", "resources", "device-light.png"),
            dark: path.join(__filename, "..", "..", "resources", "device-dark.png"),
          };
        }
        this.data.push(rootItem);
      }
      rootItem.addChild(taskItem);
    } else {
      this.data.push(taskItem);
    }
  }

  public addAllTasksToTree(taskSpecs: TaskSpec[]): void {
    // Keep only default items
    this.data = this.data.filter((item) => item.default);
    taskSpecs.forEach((spec) => {
      // Add only enabled tasks
      if (spec.enabled) {
        this.addTaskToTree(spec);
        if (spec.name.includes("Run tests")) {
          this.addTestDependenciesTreeItem();
        }
      }
    });
    this.updateAppAndTargetLabels();
  }

  private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<
    TreeItem | undefined | null | void
  >();

  readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  private addTestDependenciesTreeItem(): void {
    // Check functional tests root item exists
    let testsRootItem = this.data.find((item) => item.label?.toString().startsWith("Functional"));
    // Check if dependencies item already exists
    let addTestDependenciesItem = testsRootItem?.children?.find((item) =>
      item.label?.toString().startsWith("Add test dependencies")
    );
    if (testsRootItem && !addTestDependenciesItem) {
      // Add item to add new test requirements
      let addTestDependenciesItem = new TreeItem("Add test dependencies");
      addTestDependenciesItem.tooltip =
        "Add Python test dependencies for current app (for instance 'apk add python3-protobuf'). This will be saved in your global configuration.";
      addTestDependenciesItem.command = {
        // Command that let's user input string saved for each app present in workspace
        command: "addTestsDependencies",
        title: "Add test dependencies",
        arguments: [],
      };
      testsRootItem.addChild(addTestDependenciesItem);
    }
  }

  // updateContainerStatus function that takes DevImageStatus as argument to set the "Docker Operations" TreeItem
  public updateContainerLabel(status: DevImageStatus): void {
    const currentApp = getSelectedApp();
    let itemPrefix: string = "Docker Container";
    let itemSuffix: string = "";
    if (currentApp) {
      let containerItem = this.data.find((item) => item.label && item.label.toString().startsWith("Docker Container"));
      if (containerItem) {
        switch (status) {
          case DevImageStatus.running:
            itemSuffix = "running";
            break;
          case DevImageStatus.syncing:
            itemSuffix = "syncing";
            break;
          case DevImageStatus.stopped:
            itemSuffix = "stopped";
            break;
          default:
            itemSuffix = "stopped";
            break;
        }
        containerItem.label = `${itemPrefix} [${itemSuffix}]`;
      }
    }
    this.refresh();
  }

  public updateAppAndTargetLabels(): void {
    const currentApp = getSelectedApp();
    if (currentApp) {
      let selectTargetItem = this.data.find((item) => item.label && item.label.toString().startsWith("Select build target"));
      let selectAppItem = this.data.find((item) => item.label && item.label.toString().startsWith("Select app"));
      if (selectAppItem) {
        selectAppItem.label = `Select app [${currentApp.appFolderName}]`;
      }
      if (selectTargetItem) {
        selectTargetItem.label = `Select build target [${this.targetSelector.getSelectedTarget()}]`;
      }
    } else {
      // Remove all tree items. The welcome view will be displayed instead.
      this.data = [];
    }
    this.refresh();
  }

  public addDefaultTreeItems(): void {
    // Check select app and select target items don't already exist
    const selectAppItem = this.data.find((item) => item.label && item.label.toString().startsWith("Select app"));
    const selectTargetItem = this.data.find((item) => item.label && item.label.toString().startsWith("Select build target"));

    if (!selectAppItem) {
      let selectApp = new TreeItem("Select app");
      selectApp.setDefault();
      selectApp.tooltip = "Select app from workspace to build";
      selectApp.command = {
        command: "showAppList",
        title: "Select app",
        arguments: [],
      };
      console.log("Ledger: Adding selectApp to tree");
      this.data.push(selectApp);
    }

    if (!selectTargetItem) {
      let selectTarget = new TreeItem("Select build target");
      selectTarget.setDefault();
      selectTarget.tooltip = "Select device to build for";
      selectTarget.command = {
        command: "selectTarget",
        title: "Select build target",
        arguments: [],
      };
      console.log("Ledger: Adding selectTarget to tree");
      this.data.push(selectTarget);
    }
  }
}

export class TreeItem extends vscode.TreeItem {
  children: TreeItem[] | undefined;
  default: boolean;

  constructor(label: string, children?: TreeItem[]) {
    super(label, children === undefined ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Expanded);
    this.children = children;
    this.default = false;
  }

  setDefault() {
    this.default = true;
  }

  addChild(child: TreeItem) {
    if (!this.children) {
      this.children = [];
    }
    this.children.push(child);
    super.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
  }
}
