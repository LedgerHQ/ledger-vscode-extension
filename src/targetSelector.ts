import * as vscode from "vscode";
import { getSelectedApp } from "./appSelector";
import { updateSetting, getSetting } from "./extension";

// Define valid devices
const devices = ["Nano S", "Nano S Plus", "Nano X", "Stax", "Flex"] as const;

export const specialAllDevice = "All";

type SpecialAllDevice = typeof specialAllDevice;

// Define the LedgerDevice type
export type LedgerDevice = (typeof devices)[number];

const targetsArray: LedgerDevice[] = ["Nano S", "Nano S Plus", "Nano X", "Stax", "Flex"];

const targetSDKs: Record<string, string> = {
  [targetsArray[0]]: "$NANOS_SDK",
  [targetsArray[1]]: "$NANOSP_SDK",
  [targetsArray[2]]: "$NANOX_SDK",
  [targetsArray[3]]: "$STAX_SDK",
  [targetsArray[4]]: "$FLEX_SDK",
};
const speculosModels: Record<string, string> = {
  [targetsArray[0]]: "nanos",
  [targetsArray[1]]: "nanosp",
  [targetsArray[2]]: "nanox",
  [targetsArray[3]]: "stax",
  [targetsArray[4]]: "flex",
};
const sdkModels: Record<string, string> = {
  [targetsArray[0]]: "nanos",
  [targetsArray[1]]: "nanos2",
  [targetsArray[2]]: "nanox",
  [targetsArray[3]]: "stax",
  [targetsArray[4]]: "flex",
};

const targetIds: Record<string, string> = {
  [targetsArray[0]]: "0x31100004", // ST31
  [targetsArray[1]]: "0x33100004", // ST33K1M5
  [targetsArray[2]]: "0x33000004", // ST33
  [targetsArray[3]]: "0x33200004", // ST33K1M5
  [targetsArray[4]]: "0x33300004", // ST33K1M5
};

export class TargetSelector {
  private selectedTarget: string = "";
  private selectedSDK: string = "";
  private selectedSpeculosModel: string = "";
  private selectedSDKModel: string = "";
  private selectedTargetId: string = "";
  private targetsArray: (LedgerDevice | SpecialAllDevice)[] = [];
  private sdkModelsArray: Record<string, string> = {};
  private targetSelectedEmitter: vscode.EventEmitter<string> = new vscode.EventEmitter<string>();
  private prevSelectedApp: string = "";

  constructor() {
    const selectedApp = getSelectedApp();
    if (selectedApp === undefined) {
      return;
    }

    const dev = getSetting("selectedDevice", selectedApp.folderUri, "defaultDevice") as string;
    if (dev) {
      this.updateTargetsInfos();
      this.setSelectedTarget(dev);
    }
  }

  // Type guard function to check if a string is a valid device
  private isValidDevice(value: string): value is LedgerDevice {
    return devices.includes(value as LedgerDevice) || value === specialAllDevice;
  }

  public setSelectedTarget(target: string) {
    // Check if target string is one of those defined by the LedgerDevice type
    if (!this.isValidDevice(target)) {
      throw new Error(`Invalid device: ${target}`);
    }

    this.selectedTarget = target;

    // Save the selected device in the app repo settings, if we have not selected "All"
    const currentApp = getSelectedApp();
    if (currentApp && this.prevSelectedApp === "") {
      updateSetting("selectedDevice", target, currentApp?.folderUri);
    }

    if (!(this.selectedTarget === specialAllDevice)) {
      if (currentApp && !currentApp.compatibleDevices.includes(this.selectedTarget as LedgerDevice)) {
        // Fallback to compatible device
        this.selectedTarget = currentApp.compatibleDevices[0];
        vscode.window.showWarningMessage(
          `Incompatible device set for current app. Fallback to compatible device (${this.selectedTarget})`,
        );
      }

      this.selectedSDK = targetSDKs[this.selectedTarget];
      this.selectedSpeculosModel = speculosModels[this.selectedTarget];
      this.selectedSDKModel = this.sdkModelsArray[this.selectedTarget];
      this.selectedTargetId = targetIds[this.selectedTarget];
      vscode.commands.executeCommand("setContext", "ledgerDevTools.contextAllTargets", true);
    }
    else {
      vscode.commands.executeCommand("setContext", "ledgerDevTools.contextAllTargets", false);
    }
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
        this.sdkModelsArray[target]
          = target === "Nano S Plus" && currentApp.language === "rust" ? "nanosplus" : sdkModels[target];
      });

      if (this.targetsArray.length > 1) {
        vscode.commands.executeCommand("setContext", "ledgerDevTools.showToggleAllTargets", true);
      }
      else {
        vscode.commands.executeCommand("setContext", "ledgerDevTools.showToggleAllTargets", false);
      }
    }
  }

  public readonly onTargetSelectedEvent: vscode.Event<string> = this.targetSelectedEmitter.event;

  private triggerTargetSelectedEvent(data: string) {
    this.targetSelectedEmitter.fire(data);
  }

  public toggleAllTargetSelection() {
    if (this.selectedTarget === specialAllDevice) {
      this.setSelectedTarget(this.prevSelectedApp);
      this.prevSelectedApp = "";
    }
    else {
      this.prevSelectedApp = this.selectedTarget;
      this.setSelectedTarget(specialAllDevice);
    }
    this.triggerTargetSelectedEvent(this.selectedTarget);
  }

  public async showTargetSelectorMenu() {
    const result = await vscode.window.showQuickPick(this.targetsArray, {
      placeHolder: "Please select a target",
    });
    if (result) {
      this.setSelectedTarget(result.toString());
      this.triggerTargetSelectedEvent(result.toString());
    }
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

  public getTargetsArray() {
    return this.targetsArray;
  }
}
