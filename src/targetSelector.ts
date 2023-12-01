import * as vscode from "vscode";
import { StatusBarManager } from "./statusBar";
import { TaskProvider } from "./taskProvider";
import { TreeDataProvider } from "./treeView";
import { getSelectedApp } from "./appSelector";

// Define valid devices
const devices = ["Nano S", "Nano S Plus", "Nano X", "Stax"] as const;

// Define the LedgerDevice type
export type LedgerDevice = (typeof devices)[number];

const cTargetsArray: LedgerDevice[] = ["Nano S", "Nano S Plus", "Nano X", "Stax"];
const rustTargetsArray: LedgerDevice[] = ["Nano S", "Nano S Plus", "Nano X"];

const targetSDKs: Record<string, string> = {
  [cTargetsArray[0]]: "$NANOS_SDK",
  [cTargetsArray[1]]: "$NANOSP_SDK",
  [cTargetsArray[2]]: "$NANOX_SDK",
  [cTargetsArray[3]]: "$STAX_SDK",
};
const speculosModels: Record<string, string> = {
  [cTargetsArray[0]]: "nanos",
  [cTargetsArray[1]]: "nanosp",
  [cTargetsArray[2]]: "nanox",
  [cTargetsArray[3]]: "stax",
};
const sdkModels: Record<string, string> = {
  [cTargetsArray[0]]: "nanos",
  [cTargetsArray[1]]: "nanos2",
  [cTargetsArray[2]]: "nanox",
  [cTargetsArray[3]]: "stax",
};

const targetIds: Record<string, string> = {
  [cTargetsArray[0]]: "0x31100004", // ST31
  [cTargetsArray[1]]: "0x33100004", // ST33K1M5
  [cTargetsArray[2]]: "0x33000004", // ST33
  [cTargetsArray[3]]: "0x33200004", // ST33K1M5
};

const rustSDKModels: Record<string, string> = {
  [rustTargetsArray[0]]: "nanos",
  [rustTargetsArray[1]]: "nanosplus",
  [rustTargetsArray[2]]: "nanox",
};

export class TargetSelector {
  private selectedTarget: string = "";
  private selectedSDK: string = "";
  private selectedSpeculosModel: string = "";
  private selectedSDKModel: string = "";
  private selectedTargetId: string = "";
  private targetsArray: LedgerDevice[];
  private sdkModelsArray: Record<string, string>;

  constructor() {
    const conf = vscode.workspace.getConfiguration("ledgerDevTools");
    const currentApp = getSelectedApp();
    this.targetsArray = cTargetsArray;
    this.sdkModelsArray = sdkModels;
    if (currentApp && currentApp.language === "Rust") {
      this.targetsArray = rustTargetsArray;
      this.sdkModelsArray = rustSDKModels;
    }
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
    if (currentApp && currentApp.language === "Rust") {
      if (this.selectedTarget === "Stax") {
        // Fallback on Nano X, because Stax not yet supported
        this.selectedTarget = "Nano X";
        vscode.window.showWarningMessage("Rust App detected. Fallback to Nano X...");
      }
    }

    this.selectedSDK = targetSDKs[this.selectedTarget];
    this.selectedSpeculosModel = speculosModels[this.selectedTarget];
    this.selectedSDKModel = this.sdkModelsArray[this.selectedTarget];
    this.selectedTargetId = targetIds[this.selectedTarget];
  }

  // Function that updates the targets infos based on the app language
  public updateTargetsInfos() {
    const currentApp = getSelectedApp();
    this.targetsArray = cTargetsArray;
    this.sdkModelsArray = sdkModels;
    if (currentApp && currentApp.language === "Rust") {
      this.targetsArray = rustTargetsArray;
      this.sdkModelsArray = rustSDKModels;
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

  public getSelectedTargetId() {
    return this.selectedTargetId;
  }
}
