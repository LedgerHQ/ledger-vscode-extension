"use strict";

import * as vscode from "vscode";
import { TaskProvider } from "./taskProvider";
import { TreeDataProvider } from "./treeView";
import { showTargetSelectorMenu } from "./targetSelector";
import { StatusBarManager, DevImageStatus } from "./statusBar";

console.log("Ledger: Loading extension");

export function activate(context: vscode.ExtensionContext) {
  console.log(`Ledger: activating extension in mode`);

  let treeProvider = new TreeDataProvider();
  vscode.window.registerTreeDataProvider("exampleView", treeProvider);

  let taskProvider = new TaskProvider();
  context.subscriptions.push(vscode.tasks.registerTaskProvider(TaskProvider.taskType, taskProvider));

  let statusBarManager = new StatusBarManager();
  statusBarManager.updateDevImageItem(getContainerStatus());

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

  vscode.tasks.onDidStartTask((event) => {
    const taskName = event.execution.task.name;
    if (taskName.startsWith("Run dev-tools image")) {
      statusBarManager.updateDevImageItem(DevImageStatus.syncing);
    }
  });

  vscode.tasks.onDidEndTask((event) => {
    const taskName = event.execution.task.name;
    if (taskName.startsWith("Run dev-tools image")) {
      statusBarManager.updateDevImageItem(getContainerStatus());
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

import { execSync } from "child_process";

function getContainerStatus(): DevImageStatus {
  try {
    const workspaceName = `${vscode.workspace.workspaceFolders![0].name}`;
    const containerName = `${workspaceName}-container`;
    const command = `docker inspect -f '{{ .State.Status }}' ${containerName}`;
    const containerStatus = execSync(command).toString().trim();
    if (containerStatus === "running") {
      return DevImageStatus.running;
    } else if (containerStatus === "starting" || containerStatus === "restarting") {
      return DevImageStatus.syncing;
    } else {
      return DevImageStatus.stopped;
    }
  } catch (error: any) {
    return DevImageStatus.stopped;
  }
}
