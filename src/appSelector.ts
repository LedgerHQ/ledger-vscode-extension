import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as fg from "fast-glob";
import * as toml from "toml";
import { TreeDataProvider } from "./treeView";
import { TaskProvider } from "./taskProvider";
import { ContainerManager } from "./containerManager";
const APP_DETECTION_FILES: string[] = ["Makefile", "ledger_app.toml"];
const C_APP_DETECTION_STRING: string = "include $(BOLOS_SDK)/Makefile.defines";
const C_APP_NAME_MAKEFILE_VAR: string = "APPNAME";
const RUST_APP_MANIFEST_PATH_KEY: string = "manifest-path";
const PYTEST_DETECTION_FILE: string = "conftest.py";

export type AppLanguage = "Rust" | "C";

export interface App {
  appName: string;
  appFolderName: string;
  appFolder: vscode.WorkspaceFolder;
  containerName: string;
  buildDirPath: string;
  language: AppLanguage;
  functionalTestsDir?: string;
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
      const searchPatterns = APP_DETECTION_FILES.map((file) => path.join(folder.uri.fsPath, `**/${file}`).replace(/\\/g, "/"));
      const makefileOrToml = fg.sync(searchPatterns, { onlyFiles: true, deep: 2 });
      let found = false;

      makefileOrToml.forEach((file) => {
        found = false;
        let buildDirPath = path.dirname(file);
        let appName = "unknown";
        let appLanguage: AppLanguage = "C";
        const fileContent = fs.readFileSync(file, "utf-8");
        // C app detection
        if (file.endsWith("Makefile")) {
          if (fileContent.includes(C_APP_DETECTION_STRING)) {
            // Find the app name in the Makefile
            const regex = new RegExp(`${C_APP_NAME_MAKEFILE_VAR}\\s*=\\s*(.*)`);
            const match = fileContent.match(regex);
            if (match) {
              appName = match[1];
            }
            found = true;
          }
          // Rust app detection
        } else {
          const tomlContent = toml.parse(fileContent);
          if (tomlContent["rust-app"]) {
            let cargoTomlPath = tomlContent["rust-app"][RUST_APP_MANIFEST_PATH_KEY];
            if (cargoTomlPath.startsWith("./")) {
              cargoTomlPath = path.join(appFolder.uri.fsPath, cargoTomlPath);
            }
            const cargoTomlContent = toml.parse(fs.readFileSync(cargoTomlPath, "utf-8"));
            buildDirPath = path.dirname(cargoTomlPath);
            appName = cargoTomlContent["package"]["name"];
          }
          appLanguage = "Rust";
          found = true;
        }
        // Add the app to the list
        if (found) {
          // Check if pytest functional tests are present
          let testsDir = undefined;
          const searchPattern = path.join(folder.uri.fsPath, `**/${PYTEST_DETECTION_FILE}`).replace(/\\/g, "/");
          const conftestFile = fg.sync(searchPattern, { onlyFiles: true, deep: 2 })[0];
          if (conftestFile) {
            // Get the tests folder path relative to current app folder
            testsDir = path.relative(appFolder.uri.fsPath, path.dirname(conftestFile));
          }
          appList.push({
            appName: appName,
            appFolderName: appFolderName,
            appFolder: appFolder,
            containerName: containerName,
            buildDirPath: buildDirPath,
            language: appLanguage,
            functionalTestsDir: testsDir,
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
  treeDataProvider.updateAppAndTargetLabels();
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
