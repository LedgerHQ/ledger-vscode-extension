import * as vscode from "vscode";
import * as path from "path";
import { TargetSelector } from "./targetSelector";
import { getSelectedApp } from "./appSelector";
import { TaskSpec } from "./taskProvider";
import { DevImageStatus } from "./containerManager";

export class TreeDataProvider implements vscode.TreeDataProvider<TreeItem> {
  private data: TreeItem[];
  private targetSelector: TargetSelector;
  private fileDecorationProvider: ViewFileDecorationProvider;

  constructor(targetSelector: TargetSelector) {
    this.data = [];
    this.targetSelector = targetSelector;
    this.addDefaultTreeItems();
    this.updateAppAndTargetLabels();
    this.fileDecorationProvider = new ViewFileDecorationProvider(this);
    vscode.window.registerFileDecorationProvider(this.fileDecorationProvider);
  }

  getTaskItemByLabel(label: string): TreeItem | undefined {
    //Loop through all items in the tree that have children
    for (let item of this.data) {
      if (item.children) {
        for (let child of item.children) {
          if (child.label === label) {
            return child;
          }
        }
      }
    }
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
          rootItem.iconPath = new vscode.ThemeIcon("vm");
        }
        if (rootItem.label?.toString().startsWith("Build")) {
          rootItem.iconPath = new vscode.ThemeIcon("tools");
        }
        if (rootItem.label?.toString().startsWith("Functional")) {
          rootItem.iconPath = new vscode.ThemeIcon("test-view-icon");
        }
        if (rootItem.label?.toString().startsWith("Device")) {
          rootItem.iconPath = new vscode.ThemeIcon("zap");
        }
        this.data.push(rootItem);
      }
      rootItem.addChild(taskItem);

      taskItem.iconPath = new vscode.ThemeIcon("circle-filled");
      taskItem.resourceUri = vscode.Uri.from({
        scheme: "devtools-treeview",
        authority: "task",
        path: "/" + spec.name + "/" + spec.state,
      });
    } else {
      this.data.push(taskItem);
    }

    this.fileDecorationProvider.refreshTaskItemDecoration(taskItem.resourceUri);
  }

  public addAllTasksToTree(taskSpecs: TaskSpec[]): void {
    // Keep only default items
    this.data = this.data.filter((item) => item.default);
    taskSpecs.forEach((spec) => {
      // Add only enabled tasks
      if (!(spec.state === "unavailable")) {
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
    let addTestReqsItem = testsRootItem?.children?.find((item) => item.label?.toString().startsWith("Add test prerequisites"));
    if (testsRootItem && !addTestReqsItem) {
      // Add item to add new test requirements
      let addTestReqsItem = new TreeItem("Add test prerequisites");
      addTestReqsItem.tooltip =
        "Add Python tests prerequisites for current app (for instance 'apk add python3-protobuf'). This will be saved in your global configuration.";
      addTestReqsItem.command = {
        // Command that let's user input string saved for each app present in workspace
        command: "addTestsPrerequisites",
        title: "Add test prerequisites",
        arguments: [],
      };

      addTestReqsItem.iconPath = new vscode.ThemeIcon("circle-filled");
      addTestReqsItem.resourceUri = vscode.Uri.from({
        scheme: "devtools-treeview",
        authority: "task",
        path: "/" + testsRootItem.label + "/enabled",
      });

      testsRootItem.addChild(addTestReqsItem);
    } else if (testsRootItem && addTestReqsItem) {
      // Move addTestReqsItem item to the end of the list
      testsRootItem.children?.splice(testsRootItem.children?.indexOf(addTestReqsItem), 1);
    }
  }

  // updateContainerStatus function that takes DevImageStatus as argument to set the "Docker Operations" TreeItem
  public updateContainerLabel(status: DevImageStatus): void {
    const currentApp = getSelectedApp();
    let itemPrefix: string = "Docker Container";
    let itemSuffix: string = "";
    let itemIcon = new vscode.ThemeIcon("vm");
    if (currentApp) {
      let containerItem = this.data.find((item) => item.label && item.label.toString().startsWith("Docker Container"));
      if (containerItem) {
        switch (status) {
          case DevImageStatus.running:
            itemIcon = new vscode.ThemeIcon("vm-active");
            itemSuffix = "running";
            break;
          case DevImageStatus.syncing:
            itemIcon = new vscode.ThemeIcon("vm-connect");
            itemSuffix = "syncing";
            break;
          case DevImageStatus.stopped:
            itemIcon = new vscode.ThemeIcon("vm-outline");
            itemSuffix = "stopped";
            break;
          default:
            itemIcon = new vscode.ThemeIcon("vm-outline");
            itemSuffix = "stopped";
            break;
        }
        containerItem.iconPath = itemIcon;
        containerItem.label = `${itemPrefix} [${itemSuffix}]`;
      }
    }
    this.refresh();
  }

  public updateAppAndTargetLabels(): void {
    const currentApp = getSelectedApp();
    if (currentApp) {
      let selectTargetItem = this.data.find((item) => item.label && item.label.toString().startsWith("Select target"));
      let selectAppItem = this.data.find((item) => item.label && item.label.toString().startsWith("Select app"));
      if (selectAppItem) {
        selectAppItem.label = `Select app [${currentApp.folderName}]`;
      }
      if (selectTargetItem) {
        selectTargetItem.label = `Select target [${this.targetSelector.getSelectedTarget()}]`;
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
    const selectTargetItem = this.data.find((item) => item.label && item.label.toString().startsWith("Select target"));

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
      let selectTarget = new TreeItem("Select target");
      selectTarget.contextValue = "selectTarget";
      selectTarget.setDefault();
      selectTarget.tooltip = "Select device to build for";
      selectTarget.command = {
        command: "selectTarget",
        title: "Select target",
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
    this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
  }
}

export class ViewFileDecorationProvider implements vscode.FileDecorationProvider, vscode.Disposable {
  private treeDataProvider: TreeDataProvider;

  private readonly _onDidChangeFileDecorations: vscode.EventEmitter<vscode.Uri | vscode.Uri[]> = new vscode.EventEmitter<
    vscode.Uri | vscode.Uri[]
  >();
  readonly onDidChangeFileDecorations: vscode.Event<vscode.Uri | vscode.Uri[]> = this._onDidChangeFileDecorations.event;

  async refreshTaskItemDecoration(uri: vscode.Uri | undefined): Promise<void> {
    if (uri) {
      this._onDidChangeFileDecorations.fire(uri);
    }
  }

  private readonly disposable: vscode.Disposable;
  constructor(treeDataProvider: TreeDataProvider) {
    this.treeDataProvider = treeDataProvider;
    this.disposable = vscode.Disposable.from(vscode.window.registerFileDecorationProvider(this));
  }

  dispose(): void {
    this.disposable.dispose();
  }

  provideFileDecoration(uri: vscode.Uri, token: vscode.CancellationToken): vscode.FileDecoration | undefined {
    if (uri.scheme !== "devtools-treeview") {
      return undefined;
    }

    switch (uri.authority) {
      case "task":
        return this.provideTaskItemDecoration(uri, token);
    }

    return undefined;
  }

  provideTaskItemDecoration(uri: vscode.Uri, _token: vscode.CancellationToken): vscode.FileDecoration | undefined {
    const [, name, status] = uri.path.split("/");

    let color = new vscode.ThemeColor("gitDecoration.ignoredResourceForeground");
    let icon = new vscode.ThemeIcon("circle-outline");
    switch (status) {
      case "disabled":
        color = new vscode.ThemeColor("gitDecoration.ignoredResourceForeground");
        icon = new vscode.ThemeIcon("circle-outline");
        break;
      default:
      case "enabled":
        color = new vscode.ThemeColor("list.inactiveSelectionForeground");
        icon = new vscode.ThemeIcon("circle-filled");
        break;
    }

    let treeItem = this.treeDataProvider.getTaskItemByLabel(name);
    if (treeItem) {
      treeItem.iconPath = icon;
    }
    return {
      color: color,
    };
  }
}
