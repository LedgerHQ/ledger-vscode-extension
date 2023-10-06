"use strict";

import * as vscode from "vscode";
import { TaskProvider, taskType } from "./taskProvider";
import { TreeDataProvider } from "./treeView";
import { showTargetSelectorMenu } from "./targetSelector";
import { StatusBarManager } from "./statusBar";
import { ContainerManager, DevImageStatus } from "./containerManager";
import { findAppsInWorkspace, getSelectedApp, setSelectedApp, showAppSelectorMenu, setAppTestsDependencies } from "./appSelector";

console.log("Ledger: Loading extension");

export function activate(context: vscode.ExtensionContext) {
  console.log(`Ledger: activating extension in mode`);

  const appList = findAppsInWorkspace();
  if (appList) {
    setSelectedApp(appList[0]);
  }

  let taskProvider = new TaskProvider();
  context.subscriptions.push(vscode.tasks.registerTaskProvider(taskType, taskProvider));

  let treeProvider = new TreeDataProvider(taskProvider.getTaskSpecs());
  vscode.window.registerTreeDataProvider("exampleView", treeProvider);

  let statusBarManager = new StatusBarManager();
  let containerManager = new ContainerManager(taskProvider, statusBarManager, treeProvider);
  containerManager.manageContainer();

  context.subscriptions.push(
    vscode.commands.registerCommand("selectTarget", () => {
      showTargetSelectorMenu(statusBarManager, taskProvider, treeProvider);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("addTestsDependencies", () => {
      setAppTestsDependencies(taskProvider);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("executeTask", (taskName: string) => {
      executeTaskByName(taskProvider, taskName);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("showAppList", () => {
      showAppSelectorMenu(treeProvider, taskProvider, containerManager);
    })
  );

  vscode.tasks.onDidStartTask((event) => {
    const taskName = event.execution.task.name;
    if (taskName.startsWith("Update Container")) {
      statusBarManager.updateDevImageItem(DevImageStatus.syncing);
      treeProvider.updateContainerLabel(DevImageStatus.syncing);
    }
    if (taskName.startsWith("Quick device onboarding")) {
      const conf = vscode.workspace.getConfiguration("ledgerDevTools");
      const seedValue = conf.get<string>("onboardingSeed");
      const defaultSeed = conf.inspect<string>("onboardingSeed")?.defaultValue;
      if (seedValue === defaultSeed) {
        vscode.window.showWarningMessage("Do not use default onboarding seed with real funds !");
      }
    }
  });

  vscode.tasks.onDidEndTask((event) => {
    const taskName = event.execution.task.name;
    if (taskName.startsWith("Update Container")) {
      containerManager.checkUpdateRetries();
    }
  });

  vscode.workspace.onDidChangeWorkspaceFolders(() => {
    const appList = findAppsInWorkspace();
    if (appList) {
      if (!getSelectedApp()) {
        setSelectedApp(appList[0]);
      }
      containerManager.manageContainer();
    }
  });

  vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("ledgerDevTools")) {
      taskProvider.generateTasks();
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
