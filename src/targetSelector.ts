import * as vscode from "vscode";
import { StatusBarManager } from "./statusBar";
import { TaskProvider } from "./taskProvider";
import { TreeDataProvider } from "./treeView";
import { getSelectedApp } from "./appSelector";

type LedgerDevice = "Nano S" | "Nano S Plus" | "Nano X" | "Stax";
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

const conf = vscode.workspace.getConfiguration("ledgerDevTools");
let selectedTarget = conf.get<string>("defaultDevice", "Nano S");
let selectedSDK: string = "";
let selectedSpeculosModel: string = "";
let selectedSDKModel: string = "";
let selectedTargetId: string = "";

export function getSelectedTarget() {
  const currentApp = getSelectedApp();
  if (currentApp && currentApp.language === "Rust") {
    if (selectedTarget === "Stax") {
      // Fallback on Nano X, because Stax not yet supported
      selectedTarget = "Nano X";
      vscode.window.showWarningMessage("Rust App detected. Fallback to Nano X...");
    }
  }
  return selectedTarget;
}

export function getSelectedSDK() {
  selectedSDK = targetSDKs[selectedTarget];
  return selectedSDK;
}

export function getSelectedSpeculosModel() {
  selectedSpeculosModel = speculosModels[selectedTarget];
  return selectedSpeculosModel;
}

export function getSelectedSDKModel() {
  selectedSDKModel = sdkModels[selectedTarget];
  return selectedSDKModel;
}

export function getSelectedTargetId() {
  selectedTargetId = targetIds[selectedTarget];
  return selectedTargetId;
}

export async function showTargetSelectorMenu(
  statusManager: StatusBarManager,
  taskProvider: TaskProvider,
  treeDataProvider: TreeDataProvider
) {
  const currentApp = getSelectedApp();
  let targetsArray = cTargetsArray;
  let sdkModelsArray = sdkModels;
  if (currentApp && currentApp.language === "Rust") {
    targetsArray = rustTargetsArray;
    sdkModelsArray = rustSDKModels;
  }
  const result = await vscode.window.showQuickPick(targetsArray, {
    placeHolder: "Please select a target",
    onDidSelectItem: (item) => {
      selectedSDK = targetSDKs[item.toString()];
      selectedTarget = item.toString();
      selectedSpeculosModel = speculosModels[item.toString()];
      selectedSDKModel = sdkModelsArray[item.toString()];
      selectedTargetId = targetIds[item.toString()];
    },
  });
  taskProvider.generateTasks();
  statusManager.updateTargetItem();
  treeDataProvider.updateAppAndTargetLabels();
  return result;
}
