import * as vscode from "vscode";
import { StatusBarManager } from "./statusBar";
import { TaskProvider } from "./taskProvider";
import { TreeDataProvider } from "./treeView";

export type LedgerDevice = "Nano S" | "Nano S Plus" | "Nano X" | "Stax";
const targetsArray: LedgerDevice[] = ["Nano S", "Nano S Plus", "Nano X", "Stax"];
const targetSDKs: Record<string, string> = {
  [targetsArray[0]]: "$NANOS_SDK",
  [targetsArray[1]]: "$NANOSP_SDK",
  [targetsArray[2]]: "$NANOX_SDK",
  [targetsArray[3]]: "$STAX_SDK",
};
const speculosModels: Record<string, string> = {
  [targetsArray[0]]: "nanos",
  [targetsArray[1]]: "nanos2",
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

let selectedTarget = targetsArray[0].toString();
let selectedSDK = targetSDKs[targetsArray[0]];
let selectedSpeculosModel = speculosModels[targetsArray[0]];
let selectedSDKModel = sdkModels[targetsArray[0]];
let selectedTargetId = targetIds[targetsArray[0]];

export function getSelectedTarget() {
  return selectedTarget;
}

export function getSelectedSDK() {
  return selectedSDK;
}

export function getSelectedSpeculosModel() {
  return selectedSpeculosModel;
}

export function getSelectedSDKModel() {
  return selectedSDKModel;
}

export function getSelectedTargetId() {
  return selectedTargetId;
}

export async function showTargetSelectorMenu(
  statusManager: StatusBarManager,
  taskProvider: TaskProvider,
  treeDataProvider: TreeDataProvider
) {
  const result = await vscode.window.showQuickPick(targetsArray, {
    placeHolder: "Please select a target",
    onDidSelectItem: (item) => {
      selectedSDK = targetSDKs[item.toString()];
      selectedTarget = item.toString();
      selectedSpeculosModel = speculosModels[item.toString()];
      selectedSDKModel = sdkModels[item.toString()];
      selectedTargetId = targetIds[item.toString()];
    },
  });
  taskProvider.generateTasks();
  statusManager.updateTargetItem();
  treeDataProvider.updateTargetLabel();
  return result;
}
