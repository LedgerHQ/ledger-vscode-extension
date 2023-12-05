"use strict";

import * as vscode from "vscode";
import { TaskProvider, taskType } from "./taskProvider";
import { TreeDataProvider } from "./treeView";
import { TargetSelector } from "./targetSelector";
import { StatusBarManager } from "./statusBar";
import { ContainerManager, DevImageStatus } from "./containerManager";
import { findAppsInWorkspace, getSelectedApp, setSelectedApp, showAppSelectorMenu, setAppTestsDependencies } from "./appSelector";

console.log("Ledger: Loading extension");

export function activate(context: vscode.ExtensionContext) {
  console.log(`Ledger: activating extension`);

  const appList = findAppsInWorkspace();
  if (appList) {
    setSelectedApp(appList[0]);
  }

  let targetSelector = new TargetSelector();

  let treeProvider = new TreeDataProvider(targetSelector);
  vscode.window.registerTreeDataProvider("mainView", treeProvider);

  let taskProvider = new TaskProvider(treeProvider, targetSelector);
  context.subscriptions.push(vscode.tasks.registerTaskProvider(taskType, taskProvider));

  let statusBarManager = new StatusBarManager(targetSelector.getSelectedTarget());

  let containerManager = new ContainerManager(taskProvider);

  context.subscriptions.push(
    containerManager.onStatusEvent((data) => {
      statusBarManager.updateDevImageItem(data);
      treeProvider.updateContainerLabel(data);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("selectTarget", () => {
      targetSelector.showTargetSelectorMenu(statusBarManager, taskProvider, treeProvider);
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
      showAppSelectorMenu(treeProvider, taskProvider, containerManager, targetSelector);
    })
  );

  vscode.tasks.onDidStartTask((event) => {
    const taskName = event.execution.task.name;
    if (taskName.startsWith("Update Container")) {
      containerManager.triggerStatusEvent(DevImageStatus.syncing);
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
      const currentApp = getSelectedApp();
      if (!currentApp || !appList.includes(currentApp)) {
        setSelectedApp(appList[0]);
      }
      treeProvider.addDefaultTreeItems();
      treeProvider.updateAppAndTargetLabels();
      targetSelector.updateTargetsInfos();
      taskProvider.provideTasks();
      containerManager.manageContainer();
    }
  });

  vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("ledgerDevTools")) {
      taskProvider.generateTasks();
    }
    if (event.affectsConfiguration("ledgerDevTools.defaultDevice")) {
      targetSelector.setSelectedTarget(
        vscode.workspace.getConfiguration("ledgerDevTools").get<string>("defaultDevice", "Nano S")
      );
      taskProvider.generateTasks();
      statusBarManager.updateTargetItem(targetSelector.getSelectedTarget());
      treeProvider.updateAppAndTargetLabels();
    }
  });

  containerManager.manageContainer();

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
