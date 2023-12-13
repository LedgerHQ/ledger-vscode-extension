import * as vscode from "vscode";
import { StatusBarManager } from "./statusBar";
import { TaskProvider } from "./taskProvider";
import { TreeDataProvider } from "./treeView";
import { getSelectedApp } from "./appSelector";

// Define valid devices
const devices = ["Nano S", "Nano S Plus", "Nano X", "Stax"] as const;

// Define the LedgerDevice type
export type LedgerDevice = (typeof devices)[number];

const targetsArray: LedgerDevice[] = ["Nano S", "Nano S Plus", "Nano X", "Stax"];

const targetSDKs: Record<string, string> = {
  [targetsArray[0]]: "$NANOS_SDK",
  [targetsArray[1]]: "$NANOSP_SDK",
  [targetsArray[2]]: "$NANOX_SDK",
  [targetsArray[3]]: "$STAX_SDK",
};
const speculosModels: Record<string, string> = {
  [targetsArray[0]]: "nanos",
  [targetsArray[1]]: "nanosp",
  [targetsArray[2]]: "nanox",
  [targetsArray[3]]: "stax",
};
const sdkModels: Record<string, string> = {
  [targetsArray[0]]: "nanos",
  [targetsArray[1]]: "nanos2",
  [targetsArray[2]]: "nanox",
  [targetsArray[3]]: "stax",
};

const targetIds: Record<string, string> = {
  [targetsArray[0]]: "0x31100004", // ST31
  [targetsArray[1]]: "0x33100004", // ST33K1M5
  [targetsArray[2]]: "0x33000004", // ST33
  [targetsArray[3]]: "0x33200004", // ST33K1M5
};

export class TargetSelector {
  private selectedTarget: string = "";
  private selectedSDK: string = "";
  private selectedSpeculosModel: string = "";
  private selectedSDKModel: string = "";
  private selectedTargetId: string = "";
  private targetsArray: LedgerDevice[] = [];
  private sdkModelsArray: Record<string, string> = {};

  constructor() {
    const conf = vscode.workspace.getConfiguration("ledgerDevTools");
    this.updateTargetsInfos();
    this.setSelectedTarget(conf.get<string>("defaultDevice", "Nano S"));
  }

  // Type guard function to check if a string is a valid device
  private isValidDevice(value: string): value is LedgerDevice {
    return devices.includes(value as LedgerDevice);
  }

  public setSelectedTarget(target: string) {
    // Check if target string is one of those defined by the LedgerDevice type
    if (!this.isValidDevice(target)) {
      throw new Error(`Invalid device: ${target}`);
    }

    this.selectedTarget = target;

    const currentApp = getSelectedApp();
    if (currentApp && !currentApp.compatibleDevices.includes(this.selectedTarget as LedgerDevice)) {
      // Fallback to compatible device
      this.selectedTarget = currentApp.compatibleDevices[0];
      vscode.window.showWarningMessage(
        `Incompatible device set for current app. Fallback to compatible device (${this.selectedTarget})`
      );
    }

    this.selectedSDK = targetSDKs[this.selectedTarget];
    this.selectedSpeculosModel = speculosModels[this.selectedTarget];
    this.selectedSDKModel = this.sdkModelsArray[this.selectedTarget];
    this.selectedTargetId = targetIds[this.selectedTarget];
  }

  // Function that updates the targets infos based on the app language
  public updateTargetsInfos() {
    const currentApp = getSelectedApp();
    this.targetsArray = [];
    this.sdkModelsArray = {};
    if (currentApp) {
      this.targetsArray = currentApp.compatibleDevices;
      // Define sdkModelsArray based on the targetsArray
      this.targetsArray.forEach((target) => {
        this.sdkModelsArray[target] =
          target === "Nano S Plus" && currentApp.language === "Rust" ? "nanosplus" : sdkModels[target];
      });
    }
  }

  public async showTargetSelectorMenu(
    statusManager: StatusBarManager,
    taskProvider: TaskProvider,
    treeDataProvider: TreeDataProvider
  ) {
    const result = await vscode.window.showQuickPick(this.targetsArray, {
      placeHolder: "Please select a target",
      onDidSelectItem: (item) => {
        this.setSelectedTarget(item.toString());
      },
    });
    taskProvider.generateTasks();
    statusManager.updateTargetItem(this.getSelectedTarget());
    treeDataProvider.updateAppAndTargetLabels();
    return result;
  }

  public getSelectedTarget() {
    return this.selectedTarget;
  }

  public getSelectedSDK() {
    return this.selectedSDK;
  }

  public getSelectedSpeculosModel() {
    return this.selectedSpeculosModel;
  }

  public getSelectedSDKModel() {
    return this.selectedSDKModel;
  }

  public getTargetBuildDirName() {
    return sdkModels[this.selectedTarget];
  }

  public getSelectedTargetId() {
    return this.selectedTargetId;
  }
}
