"use strict";

import * as vscode from "vscode";

import { window } from 'vscode';

import { TaskProvider } from "./taskProvider";

console.log("Ledger: Loading extension");


export function activate(context: vscode.ExtensionContext) {
  console.log(`Ledger: activating extension in mode`);

  context.subscriptions.push(
    vscode.tasks.registerTaskProvider(TaskProvider.TaskType, new TaskProvider())
  );

  vscode.window.registerTreeDataProvider('exampleView', new TreeDataProvider());

  console.log(`Ledger: extension activated`);
  return 0;
}

export async function deactivate() {
  console.log(`Ledger: deactivating extension`);
  // DO STUFF
  console.log(`Ledger: extension deactivated`);
}

class TreeDataProvider implements vscode.TreeDataProvider<TreeItem> {
    onDidChangeTreeData?: vscode.Event<TreeItem|null|undefined>|undefined;
  
    data: TreeItem[];
  
    constructor() {
      this.data = [new TreeItem('Tasks', [
        new TreeItem(
            'Build', [new TreeItem('Build app'), new TreeItem('Build app [debug]'), new TreeItem('Clean build files')])
        ])];
    }
  
    getTreeItem(element: TreeItem): vscode.TreeItem|Thenable<vscode.TreeItem> {
      return element;
    }
  
    getChildren(element?: TreeItem|undefined): vscode.ProviderResult<TreeItem[]> {
      if (element === undefined) {
        return this.data;
      }
      return element.children;
    }
  }
  
  class TreeItem extends vscode.TreeItem {
    children: TreeItem[]|undefined;
  
    constructor(label: string, children?: TreeItem[]) {
      super(
          label,
          children === undefined ? vscode.TreeItemCollapsibleState.None :
                                   vscode.TreeItemCollapsibleState.Expanded);
      this.children = children;
    }
  }
  