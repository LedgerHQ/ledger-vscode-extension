"use strict";

import * as vscode from "vscode";
import { getSelectedTarget } from "./targetSelector";
import { getSelectedApp } from "./appSelector";
import { ContainerManager, DevImageStatus } from "./containerManager";

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
      arguments: ["Update Container"],
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
}
