"use strict";
import * as vscode from "vscode";
import { platform } from "node:process";
import { execSync } from "child_process";
import { getSelectedApp } from "./appSelector";
import { TaskProvider } from "./taskProvider";
import { ExecSyncOptionsWithStringEncoding } from "child_process";

// Helper to get Docker user option based on configuration
export function getDockerUserOpt(): string {
  const conf = vscode.workspace.getConfiguration("ledgerDevTools");
  if (conf.get<boolean>("openContainerAsRoot") === true || platform === "win32") {
    return `--user 0`;
  }
  // On Linux/macOS, get the actual user and group IDs
  try {
    const uid = execSync("id -u", { encoding: "utf-8" }).trim();
    const gid = execSync("id -g", { encoding: "utf-8" }).trim();
    return `--user ${uid}:${gid}`;
  }
  catch (error) {
    // Fallback if id command fails
    return `--user 1000:1000`;
  }
}

export enum DevImageStatus {
  running = "sync",
  syncing = "sync~spin",
  stopped = "notebook-stop",
}

export class ContainerManager {
  private taskProvider: TaskProvider;
  private nbUpdate: number = 0;
  private statusEmitter: vscode.EventEmitter<DevImageStatus> = new vscode.EventEmitter<DevImageStatus>();

  constructor(taskProvider: TaskProvider) {
    this.taskProvider = taskProvider;
    this.nbUpdate = 0;
  }

  public readonly onStatusEvent: vscode.Event<DevImageStatus> = this.statusEmitter.event;

  public triggerStatusEvent(data: DevImageStatus) {
    this.statusEmitter.fire(data);
  }

  private checkContainerExists(containerName: string): boolean {
    const command = `docker ps -a --filter "name=${containerName}" --format "{{.Names}}"`;
    const execOptions: ExecSyncOptionsWithStringEncoding = { stdio: "pipe", encoding: "utf-8" };
    const output = execSync(command, execOptions).toString();
    return output.includes(containerName);
  }

  public getContainerStatus(): DevImageStatus {
    const currentApp = getSelectedApp();
    try {
      if (currentApp) {
        const containerName = currentApp.containerName;

        if (this.checkContainerExists(containerName)) {
          const command = `docker inspect -f "{{ .State.Status }}" ${containerName}`;
          const containerStatus = execSync(command).toString().trim();
          console.log(`Ledger: Container ${containerName} status is ${containerStatus}`);

          if (containerStatus === "running") {
            return DevImageStatus.running;
          }
          if (containerStatus === "starting" || containerStatus === "restarting") {
            return DevImageStatus.syncing;
          }
        }
      }
      return DevImageStatus.stopped;
    }
    catch (error: any) {
      console.log(`Docker error : ${error.message}`);
      return DevImageStatus.stopped;
    }
  }

  public isContainerReady(): boolean {
    const status = this.getContainerStatus();
    this.triggerStatusEvent(status);
    return status === DevImageStatus.running || status === DevImageStatus.syncing;
  }

  public async manageContainer(): Promise<void> {
    if (this.isContainerReady() === false) {
      const currentApp = getSelectedApp();
      if (currentApp) {
        this.triggerStatusEvent(DevImageStatus.stopped);
        await this.taskProvider.executeTaskByName("Update container");
      }
    }
  }

  public checkUpdateRetries(): void {
    if (this.isContainerReady() === true) {
      this.nbUpdate = 0;
      return;
    }

    const conf = vscode.workspace.getConfiguration("ledgerDevTools");
    const maxRetries = conf.get<number>("containerUpdateRetries") || 5;

    console.log(`Container Updates Retries: ${this.nbUpdate} / ${maxRetries}`);
    if (this.nbUpdate++ < maxRetries) {
      console.log(`Retrying...`);
      this.manageContainer();
      return;
    }
    console.log(`Container cannot be updated!`);
    vscode.window.showWarningMessage("Container cannot be updated!");
    this.triggerStatusEvent(DevImageStatus.stopped);
    this.nbUpdate = 0;
  }
}
