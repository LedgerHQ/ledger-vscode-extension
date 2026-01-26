"use strict";
import * as vscode from "vscode";
import { platform } from "node:process";
import { execSync, ExecSyncOptions } from "child_process";
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

// Helper to get Docker compose service name based on app folder name
export function getComposeServiceName(): string {
  let optionsExecSync: ExecSyncOptions = { stdio: "pipe", encoding: "utf-8" };
  const currentApp = getSelectedApp();
  if (currentApp) {
    const uri = vscode.Uri.parse(currentApp.folderUri.toString());
    optionsExecSync.cwd = uri.fsPath;
  }
  // If platform is windows, set shell to powershell for cp exec.
  if (platform === "win32") {
    let shell: string = "C:\\windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
    optionsExecSync.shell = shell;
  }

  let cleanCmd: string = `docker compose config --services`;
  const output = execSync(cleanCmd, optionsExecSync).toString().trim();
  return output.split("\n")[0];
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

  private checkImageExists(imageName: string): boolean {
    try {
      const command = `docker images -q ${imageName}`;
      const execOptions: ExecSyncOptionsWithStringEncoding = { stdio: "pipe", encoding: "utf-8" };
      const output = execSync(command, execOptions).toString().trim();
      return output.length > 0;
    }
    catch (error: any) {
      console.log(`Ledger: Failed to check image existence: ${error.message}`);
      return false;
    }
  }

  private getDockerImage(): string {
    const conf = vscode.workspace.getConfiguration("ledgerDevTools");
    return conf.get<string>("dockerImage") || "";
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
        const containerName = currentApp.containerName;

        // Check if container exists but is just stopped
        if (this.checkContainerExists(containerName)) {
          console.log(`Ledger: Container ${containerName} exists but is stopped, restarting...`);
          this.triggerStatusEvent(DevImageStatus.syncing);
          try {
            const execOptions: ExecSyncOptionsWithStringEncoding = { stdio: "pipe", encoding: "utf-8" };
            execSync(`docker start ${containerName}`, execOptions);
            console.log(`Ledger: Container ${containerName} restarted successfully`);
            this.triggerStatusEvent(DevImageStatus.running);
          }
          catch (error: any) {
            console.log(`Ledger: Failed to restart container: ${error.message}`);
            this.triggerStatusEvent(DevImageStatus.stopped);
          }
        }
        else {
          // Container doesn't exist, check if image exists to create it
          const imageName = this.getDockerImage();
          if (this.checkImageExists(imageName)) {
            console.log(`Ledger: Container ${containerName} does not exist but image ${imageName} is present. Creating container...`);
            this.triggerStatusEvent(DevImageStatus.syncing);
            await this.taskProvider.executeTaskByName("Create container");
          }
          else {
            console.log(`Ledger: Container ${containerName} and image ${imageName} do not exist. Pulling image and creating container...`);
            this.triggerStatusEvent(DevImageStatus.syncing);
            await this.taskProvider.executeTaskByName("Update container");
          }
        }
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
