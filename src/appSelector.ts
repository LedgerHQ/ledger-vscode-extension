import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as fg from "fast-glob";
import { TreeDataProvider } from "./treeView";
import { TaskProvider } from "./taskProvider";
import { ContainerManager } from "./containerManager";
const APP_DETECTION_FILE: string = "Makefile";
const APP_DETECTION_STRING: string = "include $(BOLOS_SDK)/Makefile.defines";

export interface App {
  appName: string;
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
      const appName = path.basename(appFolder.uri.fsPath);
      const containerName = `${appName}-container`;
      const searchPattern = path.join(folder.uri.fsPath, `**/${APP_DETECTION_FILE}`).replace(/\\/g, "/");
      const makefiles = fg.sync(searchPattern, { onlyFiles: true, deep: 2 });

      makefiles.forEach((makefile) => {
        const buildDirPath = path.dirname(makefile);
        const fileContent = fs.readFileSync(makefile, "utf-8");
        if (fileContent.includes(APP_DETECTION_STRING)) {
          appList.push({ appName: appName, appFolder: appFolder, containerName: containerName, buildDirPath: buildDirPath });
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
  const appNames = appList.map((app) => app.appName);
  const result = await vscode.window.showQuickPick(appNames, {
    placeHolder: "Please select an app",
    onDidSelectItem: (item) => {
      selectedApp = appList.find((app) => app.appName === item);
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
    if (additionalDepsPerApp && additionalDepsPerApp[currentApp.appName]) {
      currentValue = additionalDepsPerApp[currentApp.appName];
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
          if (additionalDepsPerApp && additionalDepsPerApp[currentApp.appName]) {
            additionalDepsPerApp[currentApp.appName] = value;
            conf.update("additionalDepsPerApp", additionalDepsPerApp, vscode.ConfigurationTarget.Global);
            console.log(
              `Ledger: additionalDepsPerApp configuration found (current value: ${additionalDepsPerApp[
                currentApp.appName
              ].toString()}), updating it with ${currentApp.appName}:${value}`
            );
          } else {
            console.log(`Ledger: no additionalDepsPerApp configuration found, creating it with ${currentApp.appName}:${value}`);
            conf.update("additionalDepsPerApp", { [currentApp.appName]: value }, vscode.ConfigurationTarget.Global);
          }
          //   taskProvider.generateTasks();
        }
      });
  }
}
