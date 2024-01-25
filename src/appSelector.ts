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

type AppType = "manifest" | "legacyManifest" | "makefile";

// Define valid app languages
const validLanguages = ["Rust", "C"] as const;
// Define the AppLanguage type
export type AppLanguage = (typeof validLanguages)[number];

export interface TestDependency {
  gitRepoUrl: string;
  gitRepoRef: string;
  useCase: string;
}
export interface TestUseCase {
  name: string;
  dependencies: TestDependency[];
}
export interface BuildUseCase {
  name: string;
  options: string;
}

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
  testUseCases?: TestUseCase[];
  buildUseCases?: BuildUseCase[];
}

let appList: App[] = [];
let selectedApp: App | undefined;

function detectAppType(appFolder: vscode.WorkspaceFolder): [AppType?, string?] {
  const searchPatterns = APP_DETECTION_FILES.map((file) => path.join(appFolder.uri.fsPath, `**/${file}`).replace(/\\/g, "/"));
  const makefileOrToml = fg.sync(searchPatterns, { onlyFiles: true, deep: 2 });

  let appTypeAndFile: [AppType?, string?] = [undefined, undefined];

  if (makefileOrToml.length > 0) {
    const manifest = makefileOrToml.find((file) => file.endsWith("ledger_app.toml"));
    if (manifest) {
      const fileContent = fs.readFileSync(manifest, "utf-8");
      const tomlContent = toml.parse(fileContent);
      if (tomlContent["rust-app"]) {
        appTypeAndFile = ["legacyManifest", manifest];
      } else {
        appTypeAndFile = ["manifest", manifest];
      }
    } else {
      const makefile = makefileOrToml.find((file) => file.endsWith("Makefile"));
      if (makefile) {
        const fileContent = fs.readFileSync(makefile, "utf-8");
        if (fileContent.includes(C_APP_DETECTION_STRING)) {
          appTypeAndFile = ["makefile", makefile];
        }
      }
    }
  }
  return appTypeAndFile;
}

export function findAppInFolder(folder: vscode.WorkspaceFolder): App | undefined {
  let app: App | undefined = undefined;

  const appFolder = folder;
  const appFolderName = folder.name;
  const containerName = `${appFolderName}-container`;

  let appName = "unknown";
  let appLanguage: AppLanguage = "C";
  let testsDir = undefined;
  let packageName = undefined;
  let compatibleDevices: LedgerDevice[] = ["Nano S", "Nano S Plus", "Nano X", "Stax"];

  let found = true;

  let [appType, appFile] = detectAppType(appFolder);
  const fileContent = fs.readFileSync(appFile || "", "utf-8");

  let buildDirPath = path.relative(appFolder.uri.fsPath, path.dirname(appFile || ""));
  buildDirPath = buildDirPath === "" ? "./" : buildDirPath;

  try {
    switch (appType) {
      case "manifest": {
        console.log("Found manifest in " + appFolderName);
        let tomlContent = toml.parse(fileContent);
        [appLanguage, buildDirPath, compatibleDevices, testsDir] = parseManifest(tomlContent);
        [appName, packageName] = findAdditionalInfo(appLanguage, buildDirPath, appFolder);
        break;
      }
      case "legacyManifest": {
        console.log("Found deprecated rust manifest in " + appFolderName);
        let tomlContent = toml.parse(fileContent);
        [buildDirPath, appName, packageName] = parseLegacyRustManifest(tomlContent, appFolder);
        testsDir = findFunctionalTestsWithoutManifest(appFolder);
        compatibleDevices = ["Nano S", "Nano S Plus", "Nano X"];
        appLanguage = "Rust";
        showManifestWarning(appFolderName, true);
        break;
      }
      case "makefile": {
        appName = getAppNameFromMakefile(fileContent);
        testsDir = findFunctionalTestsWithoutManifest(appFolder);
        showManifestWarning(appFolderName, false);
        break;
      }
      default:
        found = false;
        break;
    }
  } catch (error) {
    let err = new Error();
    if (!(error instanceof Error)) {
      err.message = String(error);
    } else {
      err = error;
    }
    pushError("App detection failed in " + appFolder.name + ". " + err.message);
  }

  // Add the app to the list
  if (found) {
    // Log all found fields
    console.log(`Found app ${appName} in folder ${appFolderName} with buildDirPath ${buildDirPath} and language ${appLanguage}`);
    app = {
      appName: appName,
      appFolderName: appFolderName,
      appFolder: appFolder,
      containerName: containerName,
      buildDirPath: buildDirPath,
      language: appLanguage,
      functionalTestsDir: testsDir,
      compatibleDevices: compatibleDevices,
      packageName: packageName,
    };
  }

  return app;
}

export function findAppsInWorkspace(): App[] | undefined {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  appList = [];

  if (workspaceFolders) {
    workspaceFolders.forEach((folder) => {
      const app = findAppInFolder(folder);
      if (app) {
        appList.push(app);
      }
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

export function setAppTestsPrerequisites(taskProvider: TaskProvider) {
  const currentApp = getSelectedApp();
  const conf = vscode.workspace.getConfiguration("ledgerDevTools");
  let currentValue = "";
  const additionalReqsPerApp = conf.get<Record<string, string>>("additionalReqsPerApp");
  if (currentApp) {
    if (additionalReqsPerApp && additionalReqsPerApp[currentApp.appFolderName]) {
      currentValue = additionalReqsPerApp[currentApp.appFolderName];
    }
    // Let user input string in a popup and save it in the additionalReqsPerApp configuration
    vscode.window
      .showInputBox({
        prompt: "Please enter additional test dependencies for this app",
        value: currentValue,
        ignoreFocusOut: true,
      })
      .then((value) => {
        if (value) {
          const conf = vscode.workspace.getConfiguration("ledgerDevTools");
          const additionalReqsPerApp = conf.get<Record<string, string>>("additionalReqsPerApp");
          // Account for the fact that maybe the app is not yet in the configuration
          if (additionalReqsPerApp && additionalReqsPerApp[currentApp.appFolderName]) {
            additionalReqsPerApp[currentApp.appFolderName] = value;
            conf.update("additionalReqsPerApp", additionalReqsPerApp, vscode.ConfigurationTarget.Global);
            console.log(
              `Ledger: additionalReqsPerApp configuration found (current value: ${additionalReqsPerApp[
                currentApp.appFolderName
              ].toString()}), updating it with ${currentApp.appFolderName}:${value}`
            );
          } else {
            console.log(
              `Ledger: no additionalReqsPerApp configuration found, creating it with ${currentApp.appFolderName}:${value}`
            );
            conf.update("additionalReqsPerApp", { [currentApp.appFolderName]: value }, vscode.ConfigurationTarget.Global);
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
function manifestDevicesToLedgerDevices(manifestDevices: string): LedgerDevice[] {
  return manifestDevices
    .toString()
    .split(",")
    .map((device: string) => {
      switch (device) {
        case "nanos":
          return "Nano S";
        case "nanox":
          return "Nano X";
        case "nanos+":
          return "Nano S Plus";
        case "stax":
          return "Stax";
        default:
          throw new Error("Invalid device in manifest : " + device);
      }
    });
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
  let packageName = getPropertyOrThrow(cargoTomlContent, "package.name");
  let appName = getPropertyOrThrow(cargoTomlContent, "package.metadata.ledger.name");
  return [appName, packageName];
}

// Check if pytest functional tests are present for an app without manifest
// or if the manifest does not specify the pytest directory (legacy manifest)
function findFunctionalTestsWithoutManifest(appFolder: vscode.WorkspaceFolder): string | undefined {
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

// Get a nested property from a toml object, return undefined if not found
function getProperty(obj: any, objectPath: string): string | undefined {
  return objectPath.split(".").reduce((acc, key) => acc?.[key], obj);
}

// Get a nested property from a toml object, throw an error if not found
function getPropertyOrThrow(obj: any, path: string): string {
  const value = getProperty(obj, path);
  if (value === undefined) {
    throw new Error(`Wrong manifest format. Mandatory property "${path}" not found`);
  }
  return value;
}

// Parse manifest. Returns app language, build dir path, app name, devices, package name (for rust app), functional tests dir path (if any)
function parseManifest(tomlContent: any): [AppLanguage, string, LedgerDevice[], string?] {
  // Parse app language
  const appLanguage = isValidLanguage(getPropertyOrThrow(tomlContent, "app.sdk"));

  // Parse build dir path
  let buildDirPath = getPropertyOrThrow(tomlContent, "app.build_directory");

  // Parse compatible devices
  const compatibleDevices: LedgerDevice[] = manifestDevicesToLedgerDevices(getPropertyOrThrow(tomlContent, "app.devices"));

  // Check if pytest functional tests are present
  let functionalTestsDir = getProperty(tomlContent, "tests.pytest_directory");

  return [appLanguage, buildDirPath, compatibleDevices, functionalTestsDir];
}

// Find app name and package name from build dir path, in Makefile for C apps or Cargo.toml for Rust apps
function findAdditionalInfo(
  appLanguage: AppLanguage,
  buildDirPath: string,
  appFolder: vscode.WorkspaceFolder
): [string, string?] {
  let appName: string;
  let packageName: string | undefined;

  // Get the build dir path on the host to search for the Makefile or Cargo.toml
  let hostBuildDirPath = buildDirPath.startsWith("./") ? path.join(appFolder.uri.fsPath, buildDirPath) : buildDirPath;

  // If C app, parse app name from Makefile
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
  return [appName, packageName];
}

// Parse legacy rust manifest and return build dir path, app name and package name
function parseLegacyRustManifest(tomlContent: any, appFolder: any): [string, string, string] {
  let cargoTomlPath = getPropertyOrThrow(tomlContent, "rust-app.manifest-path");
  const buildDirPath = path.dirname(cargoTomlPath);
  if (cargoTomlPath.startsWith("./")) {
    cargoTomlPath = path.join(appFolder.uri.fsPath, cargoTomlPath);
  }
  let [appName, packageName] = parseCargoToml(cargoTomlPath);
  return [buildDirPath, appName, packageName];
}
