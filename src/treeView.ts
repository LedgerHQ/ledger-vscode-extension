import * as vscode from "vscode";
import { getSelectedTarget } from "./targetSelector";
import { getSelectedApp } from "./appSelector";
import { TaskSpec } from "./taskProvider";

export class TreeDataProvider implements vscode.TreeDataProvider<TreeItem> {
  data: TreeItem[];

  constructor(taskSpecs: TaskSpec[]) {
    this.data = [];

    let selectTarget = new TreeItem("Select build target");
    selectTarget.command = {
      command: "selectTarget",
      title: "Select build target",
      arguments: [],
    };
    this.data.push(selectTarget);

    let selectApp = new TreeItem("Select app");
    selectApp.command = {
      command: "showAppList",
      title: "Select app",
      arguments: [],
    };
    this.data.push(selectApp);

    this.addAllTasksToTree(taskSpecs);
    this.updateTargetLabel();
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
    taskItem.command = {
      command: "executeTask",
      title: spec.name,
      arguments: [spec.name],
    };
    if (spec.group) {
      let rootItem = this.data.find((item) => item.label === spec.group);
      if (!rootItem) {
        rootItem = new TreeItem(spec.group);
        this.data.push(rootItem);
      }
      rootItem.addChild(taskItem);
    } else {
      this.data.push(taskItem);
    }
  }

  private addAllTasksToTree(taskSpecs: TaskSpec[]): void {
    taskSpecs.forEach((spec) => {
      this.addTaskToTree(spec);
    });
  }

  private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<
    TreeItem | undefined | null | void
  >();

  readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  updateTargetLabel(): void {
    const currentApp = getSelectedApp();
    let buildItem = this.data.find((item) => item.label && item.label.toString().startsWith("Build"));
    if (currentApp) {
      if (buildItem) {
        buildItem.label = `Build [${currentApp.appName} for ${getSelectedTarget()}]`;
      }
    } else {
      if (buildItem) {
        buildItem.label = `Build [! NO APP SELECTED !]`;
      }
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

  addChild(child: TreeItem) {
    if (!this.children) {
      this.children = [];
    }
    this.children.push(child);
    super.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
  }
}
