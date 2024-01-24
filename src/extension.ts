"use strict";

import * as vscode from "vscode";
import { TaskProvider, taskType } from "./taskProvider";
import { TreeDataProvider } from "./treeView";
import { TargetSelector } from "./targetSelector";
import { StatusBarManager } from "./statusBar";
import { ContainerManager, DevImageStatus } from "./containerManager";
import { findAppsInWorkspace, getSelectedApp, setSelectedApp, showAppSelectorMenu, setAppTestsDependencies } from "./appSelector";

let outputChannel: vscode.OutputChannel;
const appDetectionFiles = ["Cargo.toml", "ledger_app.toml", "Makefile"];

console.log("Ledger: Loading extension");

export function activate(context: vscode.ExtensionContext) {
  console.log(`Ledger: activating extension`);

  outputChannel = vscode.window.createOutputChannel("Ledger DevTools");

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

  // Event listener for container status.
  // This event is fired when the container status changes
  context.subscriptions.push(
    containerManager.onStatusEvent((data) => {
      statusBarManager.updateDevImageItem(data);
      treeProvider.updateContainerLabel(data);
    })
  );

  // Event listener for target selection.
  // This event is fired when the user selects a target in the targetSelector menu
  context.subscriptions.push(
    targetSelector.onTargetSelectedEvent((data) => {
      taskProvider.generateTasks();
      statusBarManager.updateTargetItem(data);
      treeProvider.updateAppAndTargetLabels();
      containerManager.manageContainer();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("selectTarget", () => {
      targetSelector.showTargetSelectorMenu();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("addTestsDependencies", () => {
      setAppTestsDependencies(taskProvider);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("executeTask", (taskName: string) => {
      taskProvider.executeTaskByName(taskName);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("toggleAllTargets", (taskName: string) => {
      targetSelector.toggleAllTargetSelection();
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

  let findAppsAndUpdateExtension = () => {
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
  };

  vscode.workspace.onDidChangeWorkspaceFolders(() => {
    findAppsAndUpdateExtension();
  });

  vscode.workspace.onDidSaveTextDocument((event) => {
    const fileName = event.fileName.split("/").pop();
    if (fileName && appDetectionFiles.includes(fileName)) {
      findAppsAndUpdateExtension();
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

export function pushError(error: string) {
  outputChannel.appendLine("Error : " + error);
  outputChannel.show();
  // Show error message to user
  vscode.window.showErrorMessage("Ledger extension error : " + error);
}

export async function deactivate() {
  console.log(`Ledger: deactivating extension`);
  // DO STUFF
  console.log(`Ledger: extension deactivated`);
}
