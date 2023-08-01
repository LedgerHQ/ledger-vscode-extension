import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as fg from "fast-glob";
import { TreeDataProvider } from "./treeView";
import { TaskProvider } from "./taskProvider";
import { ContainerManager } from "./containerManager";
const APP_DETECTION_FILE: string = "Makefile";
const APP_DETECTION_STRING: string = "include $(BOLOS_SDK)/Makefile.defines";
const APP_NAME_MAKEFILE_VAR: string = "APPNAME";

export interface App {
  appName: string;
  appFolderName: string;
  appFolder: vscode.WorkspaceFolder;
  containerName: string;
  buildDirPath: string;
}

let appList: App[] = [];
let selectedApp: App | undefined;

export function findAppsInWorkspace(): App[] | undefined {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  appList = [];

  if (workspaceFolders) {
    workspaceFolders.forEach((folder) => {
      const appFolder = folder;
      const appFolderName = path.basename(appFolder.uri.fsPath);
      const containerName = `${appFolderName}-container`;
      const searchPattern = path.join(folder.uri.fsPath, `**/${APP_DETECTION_FILE}`).replace(/\\/g, "/");
      const makefiles = fg.sync(searchPattern, { onlyFiles: true, deep: 2 });

      makefiles.forEach((makefile) => {
        const buildDirPath = path.dirname(makefile);
        const fileContent = fs.readFileSync(makefile, "utf-8");
        if (fileContent.includes(APP_DETECTION_STRING)) {
          // Find the app name in the Makefile
          const regex = new RegExp(`${APP_NAME_MAKEFILE_VAR}\\s*=\\s*(.*)`);
          const match = fileContent.match(regex);
          let appName = "unknown";
          if (match) {
            appName = match[1];
          }
          // Add the app to the list
          appList.push({
            appName: appName,
            appFolderName: appFolderName,
            appFolder: appFolder,
            containerName: containerName,
            buildDirPath: buildDirPath,
          });
        }
      });
    });
  }

  return appList;
}

export async function showAppSelectorMenu(
  treeDataProvider: TreeDataProvider,
  taskProvider: TaskProvider,
  containerManager: ContainerManager
) {
  const appFolderNames = appList.map((app) => app.appFolderName);
  const result = await vscode.window.showQuickPick(appFolderNames, {
    placeHolder: "Please select an app",
    onDidSelectItem: (item) => {
      selectedApp = appList.find((app) => app.appFolderName === item);
    },
  });
  taskProvider.generateTasks();
  containerManager.manageContainer();
  treeDataProvider.updateTargetLabel();
  return result;
}

export function getSelectedApp() {
  return selectedApp;
}

export function setSelectedApp(app: App) {
  selectedApp = app;
}

export function getAppList() {
  return appList;
}

export function setAppTestsDependencies(taskProvider: TaskProvider) {
  const currentApp = getSelectedApp();
  const conf = vscode.workspace.getConfiguration("ledgerDevTools");
  let currentValue = "";
  const additionalDepsPerApp = conf.get<Record<string, string>>("additionalDepsPerApp");
  if (currentApp) {
    if (additionalDepsPerApp && additionalDepsPerApp[currentApp.appFolderName]) {
      currentValue = additionalDepsPerApp[currentApp.appFolderName];
    }
    // Let user input string in a popup and save it in the additionalDepsPerApp configuration
    vscode.window
      .showInputBox({
        prompt: "Please enter additional test dependencies for this app",
        value: currentValue,
        ignoreFocusOut: true,
      })
      .then((value) => {
        if (value) {
          const conf = vscode.workspace.getConfiguration("ledgerDevTools");
          const additionalDepsPerApp = conf.get<Record<string, string>>("additionalDepsPerApp");
          // Account for the fact that maybe the app is not yet in the configuration
          if (additionalDepsPerApp && additionalDepsPerApp[currentApp.appFolderName]) {
            additionalDepsPerApp[currentApp.appFolderName] = value;
            conf.update("additionalDepsPerApp", additionalDepsPerApp, vscode.ConfigurationTarget.Global);
            console.log(
              `Ledger: additionalDepsPerApp configuration found (current value: ${additionalDepsPerApp[
                currentApp.appFolderName
              ].toString()}), updating it with ${currentApp.appFolderName}:${value}`
            );
          } else {
            console.log(
              `Ledger: no additionalDepsPerApp configuration found, creating it with ${currentApp.appFolderName}:${value}`
            );
            conf.update("additionalDepsPerApp", { [currentApp.appFolderName]: value }, vscode.ConfigurationTarget.Global);
          }
        }
      });
  }
}
