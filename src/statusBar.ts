"use strict";

import * as vscode from "vscode";
import { getSelectedApp } from "./appSelector";
import { ContainerManager, DevImageStatus } from "./containerManager";

const imageToolTip = "Click to update image and respawn container.";
const outdatedToolTip = "Container is running but image is outdated. Click to update image and respawn container.";

export class StatusBarManager {
  private buildUseCaseItem: vscode.StatusBarItem;
  private targetItem: vscode.StatusBarItem;
  private devImageItem: vscode.StatusBarItem;

  constructor(target: string, useCase: string) {
    this.targetItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    this.targetItem.tooltip = "Click to select another device.";
    this.targetItem.command = "selectTarget";
    this.targetItem.backgroundColor = new vscode.ThemeColor("statusBarItem.prominentBackground");
    this.updateTargetItem(target);

    this.buildUseCaseItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    if (useCase !== "") {
      this.buildUseCaseItem.tooltip = "Click to select a build use case.";
      this.buildUseCaseItem.command = "buildUseCase";
      this.buildUseCaseItem.backgroundColor = new vscode.ThemeColor("statusBarItem.prominentBackground");
      this.updateBuildUseCaseItem(useCase);
    }

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

  public updateTargetItem(target: string) {
    this.targetItem.text = `$(target) L : ${target}`;
    this.targetItem.show();
  }

  public updateBuildUseCaseItem(useCase: string) {
    this.buildUseCaseItem.text = `$(tools) L : ${useCase}`;
    this.buildUseCaseItem.show();
  }

  private statusIcon(status: DevImageStatus): string {
    switch (status) {
      case DevImageStatus.running: return "sync";
      case DevImageStatus.syncing: return "sync~spin";
      case DevImageStatus.stopped: return "notebook-stop";
    }
  }

  public updateDevImageItem(status: DevImageStatus, imageOutdated: boolean = false): void {
    const currentApp = getSelectedApp();
    if (currentApp) {
      this.devImageItem.text = `$(${this.statusIcon(status)}) L : ${currentApp.folderName}`;
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
      if (imageOutdated) {
        statusText = "[outdated] ";
        this.devImageItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
        this.devImageItem.tooltip = statusText + outdatedToolTip;
      }
      else {
        this.devImageItem.tooltip = statusText + imageToolTip;
      }
      this.devImageItem.show();
    }
    else {
      this.devImageItem.hide();
    }
  }
}
