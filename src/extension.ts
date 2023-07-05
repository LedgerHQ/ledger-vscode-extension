"use strict";

import * as vscode from "vscode";
import { TaskProvider, taskType } from "./taskProvider";
import { TreeDataProvider } from "./treeView";
import { showTargetSelectorMenu } from "./targetSelector";
import { StatusBarManager, DevImageStatus } from "./statusBar";
import { findAppsInWorkspace, getSelectedApp, setSelectedApp, showAppSelectorMenu } from "./appSelector";

console.log("Ledger: Loading extension");

export function activate(context: vscode.ExtensionContext) {
  console.log(`Ledger: activating extension in mode`);

  const appList = findAppsInWorkspace();
  if (appList) {
    setSelectedApp(appList[0]);
  }

  let taskProvider = new TaskProvider();
  context.subscriptions.push(vscode.tasks.registerTaskProvider(taskType, taskProvider));

  let statusBarManager = new StatusBarManager();
  statusBarManager.autoUpdateDevImageItem();

  let treeProvider = new TreeDataProvider();
  vscode.window.registerTreeDataProvider("exampleView", treeProvider);

  context.subscriptions.push(
    vscode.commands.registerCommand("selectTarget", () => {
      showTargetSelectorMenu(statusBarManager, taskProvider, treeProvider);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("executeTask", (taskName: string) => {
      executeTaskByName(taskProvider, taskName);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("showAppList", () => {
      showAppSelectorMenu(statusBarManager, treeProvider, taskProvider);
    })
  );

  vscode.tasks.onDidStartTask((event) => {
    const taskName = event.execution.task.name;
    if (taskName.startsWith("Run dev-tools image")) {
      statusBarManager.updateDevImageItem(DevImageStatus.syncing);
    }
  });

  vscode.tasks.onDidEndTask((event) => {
    const taskName = event.execution.task.name;
    if (taskName.startsWith("Run dev-tools image")) {
      statusBarManager.autoUpdateDevImageItem();
    }
  });

  vscode.workspace.onDidChangeWorkspaceFolders(() => {
    const appList = findAppsInWorkspace();
    if (appList) {
      if (!getSelectedApp()) {
        setSelectedApp(appList[0]);
      }
    }
  });

  console.log(`Ledger: extension activated`);
  return 0;
}

export async function deactivate() {
  console.log(`Ledger: deactivating extension`);
  // DO STUFF
  console.log(`Ledger: extension deactivated`);
}

function executeTaskByName(taskProvider: TaskProvider, taskName: string) {
  const task = taskProvider.getTaskByName(taskName);
  if (task) {
    vscode.tasks.executeTask(task);
  }
}
