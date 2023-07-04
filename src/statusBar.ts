"use strict";

import * as vscode from "vscode";
import { getSelectedTarget } from "./targetSelector";

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
    this.targetItem.text = `$(target) ${getSelectedTarget()}`;
    this.targetItem.tooltip = "Click to select another device.";
    this.targetItem.command = "selectTarget";
    this.targetItem.backgroundColor = new vscode.ThemeColor("statusBarItem.prominentBackground");
    this.targetItem.show();

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
    this.targetItem.text = `$(target) ${getSelectedTarget()}`;
    this.targetItem.show();
  }

  public updateDevImageItem(status: DevImageStatus): void {
    const workspaceName = `${vscode.workspace.workspaceFolders![0].name}`;
    const containerName = `${workspaceName}-container`;
    this.devImageItem.text = `$(${status.toString()}) ${containerName}`;
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
  }
}
