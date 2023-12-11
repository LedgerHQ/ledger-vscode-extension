import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as fg from "fast-glob";
import * as toml from "toml";
import { TreeDataProvider } from "./treeView";
import { TaskProvider } from "./taskProvider";
import { ContainerManager } from "./containerManager";
import { TargetSelector, LedgerDevice } from "./targetSelector";
import { pushError } from "./extension";
const APP_DETECTION_FILES: string[] = ["Makefile", "ledger_app.toml"];
const C_APP_DETECTION_STRING: string = "include $(BOLOS_SDK)/Makefile.defines";
const C_APP_NAME_MAKEFILE_VAR: string = "APPNAME";
const PYTEST_DETECTION_FILE: string = "conftest.py";

// Define valid app languages
const validLanguages = ["Rust", "C"] as const;
// Define the AppLanguage type
export type AppLanguage = (typeof validLanguages)[number];

export interface App {
  appName: string;
  appFolderName: string;
  appFolder: vscode.WorkspaceFolder;
  containerName: string;
  buildDirPath: string;
  language: AppLanguage;
  functionalTestsDir?: string;
  // The new manifest format allows to specify the compatible devices
  compatibleDevices: LedgerDevice[];
  // If the app is a Rust app, the package name is parsed from the Cargo.toml
  packageName?: string;
}

let appList: App[] = [];
let selectedApp: App | undefined;

// Define a sorting function to sort glob results so that ledger_app.toml files are first
const sortByLedgerAppToml = (a: string, b: string) => {
  if (a.includes("ledger_app.toml") && !b.includes("ledger_app.toml")) {
    return -1;
  } else if (!a.includes("ledger_app.toml") && b.includes("ledger_app.toml")) {
    return 1;
  }
  return 0;
};

export function findAppsInWorkspace(): App[] | undefined {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  appList = [];
  let blacklistedApps: string[] = [];

  if (workspaceFolders) {
    workspaceFolders.forEach((folder) => {
      const appFolder = folder;
      const appFolderName = folder.name;
      const containerName = `${appFolderName}-container`;
      const searchPatterns = APP_DETECTION_FILES.map((file) => path.join(folder.uri.fsPath, `**/${file}`).replace(/\\/g, "/"));
      const makefileOrToml = fg.sync(searchPatterns, { onlyFiles: true, deep: 2 });
      let found = false;

      // Sort the results so that ledger_app.toml files are first
      makefileOrToml.sort(sortByLedgerAppToml);

      makefileOrToml.forEach((file) => {
        found = false;
        let buildDirPath = path.relative(appFolder.uri.fsPath, path.dirname(file));
        buildDirPath = buildDirPath === "" ? "./" : buildDirPath;
        let appName = "unknown";
        let appLanguage: AppLanguage = "C";
        let testsDir = undefined;
        let packageName = undefined;
        let compatibleDevices: LedgerDevice[] = ["Nano S", "Nano S Plus", "Nano X", "Stax"];
        const fileContent = fs.readFileSync(file, "utf-8");

        try {
          // Parse the manifest (either legacy or new format)
          if (file.endsWith("ledger_app.toml")) {
            const tomlContent = toml.parse(fileContent);
            // Legacy rust manifest
            if (tomlContent["rust-app"]) {
              console.log("Ledger: Found legacy rust manifest");
              [buildDirPath, appName, packageName] = parseLegacyRustManifest(tomlContent, appFolder);
              testsDir = findFunctionalTestsWithoutManifest(appFolder);
              compatibleDevices = ["Nano S", "Nano S Plus", "Nano X"];
              appLanguage = "Rust";
              found = true;
              showManifestWarning(appFolderName, true);
            }
            // New manifest
            else {
              console.log("Ledger: Found new manifest");
              [appLanguage, buildDirPath, appName, compatibleDevices, packageName, testsDir] = parseManifest(
                tomlContent,
                appFolder
              );
              found = true;
            }
          } else {
            console.log("Ledger: Found Makefile");
            // Check from appList that an app with the same folder name does not already exist or
            // that the app is not blacklisted (from a previous failed detection)
            const existingApp =
              appList.find((app) => app.appFolderName === appFolderName) || blacklistedApps.includes(appFolderName);

            if (fileContent.includes(C_APP_DETECTION_STRING) && !existingApp) {
              appName = getAppNameFromMakefile(fileContent);
              found = true;
              testsDir = findFunctionalTestsWithoutManifest(appFolder);
              showManifestWarning(appFolderName, false);
            }
          }
        } catch (error) {
          let err = new Error();
          if (!(error instanceof Error)) {
            err.message = String(error);
          } else {
            err = error;
          }
          pushError("App detection failed in " + appFolder.name + ". " + err.message);
          blacklistedApps.push(appFolderName);
        }

        // Add the app to the list
        if (found) {
          // Log all found fields
          console.log(
            `$$$$ Ledger: Found app ${appName} in folder ${appFolderName} with buildDirPath ${buildDirPath} and language ${appLanguage}`
          );

          console.log("$$$$ Container name: " + containerName);
          console.log("$$$$ Tests dir: " + testsDir);
          console.log("$$$$ Package name: " + packageName);

          appList.push({
            appName: appName,
            appFolderName: appFolderName,
            appFolder: appFolder,
            containerName: containerName,
            buildDirPath: buildDirPath,
            language: appLanguage,
            functionalTestsDir: testsDir,
            compatibleDevices: compatibleDevices,
            packageName: packageName,
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
  containerManager: ContainerManager,
  targetSelector: TargetSelector
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
  targetSelector.updateTargetsInfos();
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

// Show warning if a detected app does not have a manifest or has a deprecated manifest.
async function showManifestWarning(appFolderName: string, deprecated: boolean) {
  let message = `App found in ${appFolderName} does not have a manifest.`;
  let fix = "add a manifest to your app.";
  if (deprecated) {
    message = `App found in ${appFolderName} has a deprecated manifest.`;
    fix = "update your manifest to the new format.";
  }

  const openDoc = await vscode.window.showWarningMessage(`${message} Please refer to the documentation to ${fix}`, "Show doc");

  if (openDoc) {
    vscode.commands.executeCommand(
      "vscode.open",
      vscode.Uri.parse("https://github.com/LedgerHQ/ledgered/blob/master/doc/utils/manifest.md")
    );
  }
}

// Convert a manifest device to a LedgerDevice
function manifestDeviceToLedgerDevice(manifestDevice: string): LedgerDevice {
  switch (manifestDevice) {
    case "nanos":
      return "Nano S";
    case "nanox":
      return "Nano X";
    case "nanos+":
      return "Nano S Plus";
    case "stax":
      return "Stax";
    default:
      throw new Error("Invalid device in manifest : " + manifestDevice);
  }
}

// Get the app name from the Makefile (for C apps)
function getAppNameFromMakefile(content: string): string {
  let appName: string;
  // Find the app name in the Makefile
  const regex = new RegExp(`${C_APP_NAME_MAKEFILE_VAR}\\s*=\\s*(.*)`);
  const match = content.match(regex);
  if (match) {
    appName = match[1];
  } else {
    throw new Error("No app name found in Makefile");
  }
  return appName;
}

// Type guard function to check if a string is a valid app language
function isValidLanguage(value: string): AppLanguage {
  if (!validLanguages.includes(value as AppLanguage)) {
    throw new Error(`Invalid language: ${value} in manifest`);
  }
  return value as AppLanguage;
}

// Parse Cargo.toml and return app name and package name
function parseCargoToml(cargoTomlPath: string): [string, string] {
  const cargoTomlContent = toml.parse(fs.readFileSync(cargoTomlPath, "utf-8"));
  let packageName = getNestedProperty(cargoTomlContent, "package.name");
  let appName = getNestedProperty(cargoTomlContent, "package.metadata.ledger.name");
  return [appName, packageName];
}

// Check if pytest functional tests are present for an app without manifest
// or if the manifest does not specify the pytest directory (legacy manifest)
function findFunctionalTestsWithoutManifest(appFolder: any): string | undefined {
  // Check if pytest functional tests are present
  let testsDir = undefined;
  const searchPattern = path.join(appFolder.uri.fsPath, `**/${PYTEST_DETECTION_FILE}`).replace(/\\/g, "/");
  const conftestFile = fg.sync(searchPattern, { onlyFiles: true, deep: 2 })[0];
  if (conftestFile) {
    // Get the tests folder path relative to current app folder
    testsDir = path.relative(appFolder.uri.fsPath, path.dirname(conftestFile));
  }
  return testsDir;
}

// Get a nested property from a toml object, throw an error if not found
function getNestedProperty(obj: any, path: string): string {
  const value = path.split(".").reduce((acc, key) => acc?.[key], obj);
  if (value === undefined) {
    throw new Error(`Wrong manifest format. Property "${path}" not found`);
  }
  return value;
}

// Parse manifest. Returns app language, build dir path, app name, devices, package name (for rust app), functional tests dir path (if any)
function parseManifest(tomlContent: any, appFolder: any): [AppLanguage, string, string, LedgerDevice[], string?, string?] {
  // Check that the manifest is valid
  getNestedProperty(tomlContent, "app");

  // Parse app language
  const language = getNestedProperty(tomlContent, "app.sdk");
  const appLanguage = isValidLanguage(language);

  // Parse build dir path
  let buildDirPath = getNestedProperty(tomlContent, "app.build_directory");

  // Parse compatible devices
  const compatibleDevicesStr: string = getNestedProperty(tomlContent, "app.devices");
  const compatibleDevices: LedgerDevice[] = compatibleDevicesStr
    .toString()
    .split(",")
    .map((device: string) => manifestDeviceToLedgerDevice(device));

  // Check if pytest functional tests are present
  let functionalTestsDir = undefined;
  if (tomlContent["tests"] && tomlContent["tests"]["pytest_directory"]) {
    functionalTestsDir = tomlContent["tests"]["pytest_directory"];
    console.log("Functional tests dir: " + functionalTestsDir);
  }

  // If C app, parse app name from Makefile
  let appName = "unknown";
  let packageName: string | undefined;

  // Get the build dir path on the host to search for the Makefile or Cargo.toml
  let hostBuildDirPath = buildDirPath;
  if (buildDirPath.startsWith("./")) {
    hostBuildDirPath = path.join(appFolder.uri.fsPath, buildDirPath);
  }

  if (appLanguage === "C") {
    // Search for Makefile in build dir
    const searchPattern = path.join(hostBuildDirPath, `**/Makefile`).replace(/\\/g, "/");
    const makefile = fg.sync(searchPattern, { onlyFiles: true, deep: 0 })[0];
    if (!makefile) {
      throw new Error("No Makefile found in build directory");
    }
    const makefileContent = fs.readFileSync(makefile, "utf-8");
    appName = getAppNameFromMakefile(makefileContent);
  }
  // If Rust app, parse app name and package name from Cargo.toml
  else {
    [appName, packageName] = parseCargoToml(path.join(hostBuildDirPath, "Cargo.toml"));
  }
  return [appLanguage, buildDirPath, appName, compatibleDevices, packageName, functionalTestsDir];
}

// Parse legacy rust manifest and return build dir path, app name and package name
function parseLegacyRustManifest(tomlContent: any, appFolder: any): [string, string, string] {
  getNestedProperty(tomlContent, "rust-app");
  let cargoTomlPath = getNestedProperty(tomlContent, "rust-app.manifest-path");
  const buildDirPath = path.dirname(cargoTomlPath);
  if (cargoTomlPath.startsWith("./")) {
    cargoTomlPath = path.join(appFolder.uri.fsPath, cargoTomlPath);
  }
  let [appName, packageName] = parseCargoToml(cargoTomlPath);
  return [buildDirPath, appName, packageName];
}
