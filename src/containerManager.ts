"use strict";
import * as vscode from "vscode";
import { execSync } from "child_process";
import { getSelectedApp } from "./appSelector";
import { TaskProvider } from "./taskProvider";
import { StatusBarManager } from "./statusBar";
import { TreeDataProvider } from "./treeView";
import { ExecSyncOptionsWithStringEncoding } from "child_process";

export enum DevImageStatus {
  running = "sync",
  syncing = "sync~spin",
  stopped = "notebook-stop",
}

export class ContainerManager {
  private statusBarManager: StatusBarManager;
  private taskProvider: TaskProvider;
  private treeProvider: TreeDataProvider;
  private nbUpdate: number = 0;

  constructor(taskProvider: TaskProvider, statusBarManager: StatusBarManager, treeProvider: TreeDataProvider) {
    this.statusBarManager = statusBarManager;
    this.taskProvider = taskProvider;
    this.treeProvider = treeProvider;
    this.nbUpdate = 0
  }

  private checkContainerExists(containerName: string): boolean {
    const command = `docker ps -a --filter "name=${containerName}" --format "{{.Names}}"`;
    const execOptions: ExecSyncOptionsWithStringEncoding = { stdio: "pipe", encoding: "utf-8" };
    const output = execSync(command, execOptions).toString();
    return output.includes(containerName);
  }

  private isContainerReady(): boolean {
    const currentApp = getSelectedApp();
    try {
      if (currentApp) {
        const containerName = currentApp.containerName;

        if (this.checkContainerExists(containerName)) {
          const command = `docker inspect -f "{{ .State.Status }}" ${containerName}`;
          const containerStatus = execSync(command).toString().trim();
          console.log(`Ledger: Container ${containerName} status is ${containerStatus}`);

          if (containerStatus === "running") {
            this.statusBarManager.updateDevImageItem(DevImageStatus.running);
            this.treeProvider.updateContainerLabel(DevImageStatus.running);
            const conf = vscode.workspace.getConfiguration("ledgerDevTools");
            if (conf.get<boolean>("keepContainerTerminal") == false) {
                  vscode.window.activeTerminal?.hide()
            }
            return true;
          }
          if (containerStatus === "starting" || containerStatus === "restarting") {
            this.statusBarManager.updateDevImageItem(DevImageStatus.syncing);
            this.treeProvider.updateContainerLabel(DevImageStatus.syncing);
            return true;
          }
        }
      }
      return false;

    } catch (error: any) {
      console.log(`Docker error : ${error.message}`);
      return false;
    }
  }

  manageContainer(): void {
    if (this.isContainerReady() == false) {
      const currentApp = getSelectedApp();
      if (currentApp) {
        this.statusBarManager.updateDevImageItem(DevImageStatus.stopped);
        this.treeProvider.updateContainerLabel(DevImageStatus.stopped);
        console.log(`Ledger: Container ${currentApp.containerName} not found, respawning it.`);
        this.taskProvider.executeTaskByName("Update Container");
      }
    }
  }

  checkUpdateRetries(): void {
    if (this.isContainerReady() == true) {
      this.nbUpdate = 0
      return;
    }

    const conf = vscode.workspace.getConfiguration("ledgerDevTools");
    const maxRetries = conf.get<number>("containerUpdateRetries") || 5;

    console.log(`Container Updates Retries: ${this.nbUpdate} / ${maxRetries}`);
    if (this.nbUpdate++ < maxRetries) {
      console.log(`Retrying...`);
      this.manageContainer();
      return
    }
    console.log(`Container cannot be updated!`);
    vscode.window.showWarningMessage("Container cannot be updated!");
    this.statusBarManager.updateDevImageItem(DevImageStatus.stopped);
    this.treeProvider.updateContainerLabel(DevImageStatus.stopped);
    this.nbUpdate = 0
  }
}
