import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as fg from "fast-glob";
import { StatusBarManager } from "./statusBar";
import { TreeDataProvider } from "./treeView";
import { TaskProvider } from "./taskProvider";
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
      const searchPattern = path.join(folder.uri.fsPath, `**/${APP_DETECTION_FILE}`).replace(/\\/g,'/');
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
  statusManager: StatusBarManager,
  treeDataProvider: TreeDataProvider,
  taskProvider: TaskProvider
) {
  const appNames = appList.map((app) => app.appName);
  const result = await vscode.window.showQuickPick(appNames, {
    placeHolder: "Please select an app",
    onDidSelectItem: (item) => {
      selectedApp = appList.find((app) => app.appName === item);
    },
  });
  taskProvider.generateTasks();
  statusManager.autoUpdateDevImageItem();
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
