"use strict";

import * as vscode from "vscode";
import { execSync } from "child_process";
import { getSelectedTarget } from "./targetSelector";
import { getSelectedApp } from "./appSelector";

export enum DevImageStatus {
  running = "sync",
  syncing = "sync~spin",
  stopped = "notebook-stop",
}

const imageToolTip = "Click to update image and respawn container.";

export class StatusBarManager {
  private targetItem: vscode.StatusBarItem;
  private devImageItem: vscode.StatusBarItem;

  constructor() {
    this.targetItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    this.targetItem.tooltip = "Click to select another device.";
    this.targetItem.command = "selectTarget";
    this.targetItem.backgroundColor = new vscode.ThemeColor("statusBarItem.prominentBackground");
    this.updateTargetItem();

    this.devImageItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    // Create a Command object with command and arguments
    const runDevImageCommand: vscode.Command = {
      command: "executeTask",
      title: "Execute Task",
      arguments: ["Run dev-tools image"],
    };
    this.devImageItem.command = runDevImageCommand;
    this.updateDevImageItem(DevImageStatus.stopped);

    imageToolTip;
  }

  public updateTargetItem() {
    this.targetItem.text = `$(target) L : ${getSelectedTarget()}`;
    this.targetItem.show();
  }

  public updateDevImageItem(status: DevImageStatus): void {
    const currentApp = getSelectedApp();
    if (currentApp) {
      this.devImageItem.text = `$(${status.toString()}) L : ${currentApp.appName}`;
      let statusText = "[stopped] ";
      switch (status) {
        case DevImageStatus.running:
          this.devImageItem.backgroundColor = new vscode.ThemeColor("statusBarItem.prominentBackground");
          statusText = "[running] ";
          break;
        case DevImageStatus.syncing:
          statusText = "[syncing] ";
          this.devImageItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
          break;
        case DevImageStatus.stopped:
          this.devImageItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
          break;
        default:
          this.devImageItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
          break;
      }
      this.devImageItem.tooltip = statusText + imageToolTip;
      this.devImageItem.show();
    } else {
      this.devImageItem.hide();
    }
  }

  public autoUpdateDevImageItem(): void {
    this.updateDevImageItem(this.getContainerStatus());
  }

  private getContainerStatus(): DevImageStatus {
    try {
      const currentApp = getSelectedApp();
      if (currentApp) {
        const containerName = currentApp.containerName;
        const command = `docker inspect -f '{{ .State.Status }}' ${containerName}`;
        const containerStatus = execSync(command).toString().trim();
        if (containerStatus === "running") {
          return DevImageStatus.running;
        } else if (containerStatus === "starting" || containerStatus === "restarting") {
          return DevImageStatus.syncing;
        } else {
          return DevImageStatus.stopped;
        }
      } else {
        return DevImageStatus.stopped;
      }
    } catch (error: any) {
      return DevImageStatus.stopped;
    }
  }
}
