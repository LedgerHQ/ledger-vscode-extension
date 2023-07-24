"use strict";
import { execSync } from "child_process";
import { getSelectedApp } from "./appSelector";
import { TaskProvider } from "./taskProvider";
import { StatusBarManager } from "./statusBar";
import { TreeDataProvider } from "./treeView";

export enum DevImageStatus {
  running = "sync",
  syncing = "sync~spin",
  stopped = "notebook-stop",
}

export class ContainerManager {
  private statusBarManager: StatusBarManager;
  private taskProvider: TaskProvider;
  private treeProvider: TreeDataProvider;

  constructor(taskProvider: TaskProvider, statusBarManager: StatusBarManager, treeProvider: TreeDataProvider) {
    this.statusBarManager = statusBarManager;
    this.taskProvider = taskProvider;
    this.treeProvider = treeProvider;
    this.manageContainer();
  }

  manageContainer(): void {
    const currentApp = getSelectedApp();
    try {
      if (currentApp) {
        const containerName = currentApp.containerName;
        const command = `docker inspect -f '{{ .State.Status }}' ${containerName}`;
        const containerStatus = execSync(command).toString().trim();
        if (containerStatus === "running") {
          this.statusBarManager.updateDevImageItem(DevImageStatus.running);
          this.treeProvider.updateContainerLabel(DevImageStatus.running);
        } else if (containerStatus === "starting" || containerStatus === "restarting") {
          this.statusBarManager.updateDevImageItem(DevImageStatus.syncing);
          this.treeProvider.updateContainerLabel(DevImageStatus.syncing);
        } else {
          this.statusBarManager.updateDevImageItem(DevImageStatus.stopped);
          this.treeProvider.updateContainerLabel(DevImageStatus.stopped);
          this.taskProvider.executeTaskByName("Update Container");
        }
      } else {
        this.statusBarManager.updateDevImageItem(DevImageStatus.stopped);
        this.treeProvider.updateContainerLabel(DevImageStatus.stopped);
      }
    } catch (error: any) {
      this.statusBarManager.updateDevImageItem(DevImageStatus.stopped);
      this.treeProvider.updateContainerLabel(DevImageStatus.stopped);
      if (currentApp) {
        console.log(`Ledger: Container ${currentApp.containerName} not found, respawning it.`);
        this.taskProvider.executeTaskByName("Update Container");
      }
    }
  }
}
