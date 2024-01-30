import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as fg from "fast-glob";
import * as toml from "@ltd/j-toml";
import { platform } from "node:process";
import * as cp from "child_process";
import { TaskProvider } from "./taskProvider";
import { LedgerDevice, TargetSelector } from "./targetSelector";
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
  name: string;
  folderName: string;
  folderUri: vscode.Uri;
  containerName: string;
  buildDirPath: string;
  language: AppLanguage;
  // If the manifest has a pytest_directory property, it is parsed here
  functionalTestsDir?: string;
  // The new manifest format allows to specify the compatible devices
  compatibleDevices: LedgerDevice[];
  // If the app is a Rust app, the package name is parsed from the Cargo.toml
  packageName?: string;
  // If the manifest has a tests dependencies (optional) section with use cases, they are parsed here
  testsUseCases?: TestUseCase[];
  selectedTestUseCase?: TestUseCase;
  // If the manifest has build use cases (optional) section they are parsed here
  buildUseCases?: BuildUseCase[];
  selectedBuildUseCase?: BuildUseCase;
}

let appList: App[] = [];
let selectedApp: App | undefined;

let appSelectedEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();

export const onAppSelectedEvent: vscode.Event<void> = appSelectedEmitter.event;

let testUseCaseSelected: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();

export const onTestUseCaseSelected: vscode.Event<void> = testUseCaseSelected.event;

function detectAppType(appFolder: vscode.Uri): [AppType?, string?] {
  const searchPatterns = APP_DETECTION_FILES.map((file) => path.join(appFolder.fsPath, `**/${file}`).replace(/\\/g, "/"));
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

export function findAppInFolder(folderUri: vscode.Uri): App | undefined {
  let app: App | undefined = undefined;

  const appFolderUri = folderUri;
  const appFolderName = path.basename(folderUri.toString());
  const containerName = `${appFolderName}-container`;

  let appName = "unknown";
  let appLanguage: AppLanguage = "C";
  let testsDir = undefined;
  let packageName = undefined;
  let compatibleDevices: LedgerDevice[] = ["Nano S", "Nano S Plus", "Nano X", "Stax"];
  let testsUseCases = undefined;
  let buildUseCases = undefined;

  let found = true;

  let [appType, appFile] = detectAppType(folderUri);
  const fileContent = fs.readFileSync(appFile || "", "utf-8");

  let buildDirPath = path.relative(folderUri.fsPath, path.dirname(appFile || ""));
  buildDirPath = buildDirPath === "" ? "./" : buildDirPath;

  try {
    switch (appType) {
      case "manifest": {
        console.log("Found manifest in " + appFolderName);
        let tomlContent = toml.parse(fileContent);
        [appLanguage, buildDirPath, compatibleDevices, testsDir, testsUseCases, buildUseCases] = parseManifest(tomlContent);
        [appName, packageName] = findAdditionalInfo(appLanguage, buildDirPath, appFolderUri);
        break;
      }
      case "legacyManifest": {
        console.log("Found deprecated rust manifest in " + appFolderName);
        let tomlContent = toml.parse(fileContent);
        [buildDirPath, appName, packageName] = parseLegacyRustManifest(tomlContent, appFolderUri);
        testsDir = findFunctionalTestsWithoutManifest(appFolderUri);
        compatibleDevices = ["Nano S", "Nano S Plus", "Nano X"];
        appLanguage = "Rust";
        showManifestWarning(appFolderName, true);
        break;
      }
      case "makefile": {
        appName = getAppNameFromMakefile(fileContent);
        testsDir = findFunctionalTestsWithoutManifest(appFolderUri);
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
    pushError("App detection failed in " + appFolderName + ". " + err.message);
    found = false;
  }

  // Add the app to the list
  if (found) {
    // Log all found fields
    console.log(`Found app ${appName} in folder ${appFolderName} with buildDirPath ${buildDirPath} and language ${appLanguage}`);
    app = {
      name: appName,
      folderName: appFolderName,
      folderUri: appFolderUri,
      containerName: containerName,
      buildDirPath: buildDirPath,
      language: appLanguage,
      functionalTestsDir: testsDir,
      compatibleDevices: compatibleDevices,
      packageName: packageName,
      testsUseCases: testsUseCases,
      selectedTestUseCase: testsUseCases ? testsUseCases[0] : undefined,
      buildUseCases: buildUseCases,
      selectedBuildUseCase: buildUseCases ? buildUseCases[0] : undefined,
    };
  }

  return app;
}

export function findAppsInWorkspace(): App[] | undefined {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  appList = [];

  if (workspaceFolders) {
    workspaceFolders.forEach((folder) => {
      const app = findAppInFolder(folder.uri);
      if (app) {
        appList.push(app);
      }
    });
  }

  return appList;
}

export async function showAppSelectorMenu(targetSelector: TargetSelector) {
  const appFolderNames = appList.map((app) => app.folderName);
  const result = await vscode.window.showQuickPick(appFolderNames, {
    placeHolder: "Please select an app",
    onDidSelectItem: (item) => {
      setSelectedApp(appList.find((app) => app.folderName === item));
      testUseCaseSelected.fire();
    },
  });
  getAndBuildAppTestsDependencies(targetSelector);
  return result;
}

export async function showTestUseCaseSelectorMenu(targetSelector: TargetSelector) {
  const testUseCaseNames = selectedApp?.testsUseCases?.map((testUseCase) => testUseCase.name);
  let result = undefined;
  if (testUseCaseNames) {
    result = await vscode.window.showQuickPick(testUseCaseNames, {
      placeHolder: "Please select a test use case",
      onDidSelectItem: (item) => {
        selectedApp!.selectedTestUseCase = selectedApp!.testsUseCases?.find((testUseCase) => testUseCase.name === item);
        appSelectedEmitter.fire();
      },
    });
  }
  getAndBuildAppTestsDependencies(targetSelector);
  return result;
}

export function getSelectedApp() {
  return selectedApp;
}

export function setSelectedApp(app: App | undefined) {
  selectedApp = app;
  if (app && app.testsUseCases && app.testsUseCases.length > 1) {
    vscode.commands.executeCommand("setContext", "ledgerDevTools.showSelectTestUseCase", true);
  } else {
    vscode.commands.executeCommand("setContext", "ledgerDevTools.showSelectTestUseCase", false);
  }
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
    if (additionalReqsPerApp && additionalReqsPerApp[currentApp.folderName]) {
      currentValue = additionalReqsPerApp[currentApp.folderName];
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
          if (additionalReqsPerApp && additionalReqsPerApp[currentApp.folderName]) {
            additionalReqsPerApp[currentApp.folderName] = value;
            conf.update("additionalReqsPerApp", additionalReqsPerApp, vscode.ConfigurationTarget.Global);
            console.log(
              `Ledger: additionalReqsPerApp configuration found (current value: ${additionalReqsPerApp[
                currentApp.folderName
              ].toString()}), updating it with ${currentApp.folderName}:${value}`
            );
          } else {
            console.log(
              `Ledger: no additionalReqsPerApp configuration found, creating it with ${currentApp.folderName}:${value}`
            );
            conf.update("additionalReqsPerApp", { [currentApp.folderName]: value }, vscode.ConfigurationTarget.Global);
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
function findFunctionalTestsWithoutManifest(appFolderUri: vscode.Uri): string | undefined {
  // Check if pytest functional tests are present
  let testsDir = undefined;
  const searchPattern = path.join(appFolderUri.fsPath, `**/${PYTEST_DETECTION_FILE}`).replace(/\\/g, "/");
  const conftestFile = fg.sync(searchPattern, { onlyFiles: true, deep: 2 })[0];
  if (conftestFile) {
    // Get the tests folder path relative to current app folder
    testsDir = path.relative(appFolderUri.fsPath, path.dirname(conftestFile));
  }
  return testsDir;
}

// Get a nested property from a toml object, return undefined if not found
function getProperty(obj: any, objectPath: string): string | undefined {
  return objectPath.split(".").reduce((acc, key) => acc?.[key], obj);
}

// Get a nested property from a toml object, throw an error if not found
function getPropertyOrThrow(obj: any, path: string): string | any {
  const value = getProperty(obj, path);
  if (value === undefined) {
    throw new Error(`Wrong manifest format. Mandatory property "${path}" not found in "${JSON.stringify(obj)}"`);
  }
  return value;
}

function parseTestsUsesCasesFromManifest(tomlContent: any): TestUseCase[] | undefined {
  let dependenciesSection = getProperty(tomlContent, "tests.dependencies");
  let testUseCases: TestUseCase[] | undefined = undefined;
  if (dependenciesSection) {
    testUseCases = [];
    const useCases = Object.keys(dependenciesSection);
    for (let useCase of useCases) {
      let testUseCase: TestUseCase = {
        name: useCase,
        dependencies: [],
      };
      let useCaseDependencies = getPropertyOrThrow(dependenciesSection, useCase);
      useCaseDependencies.forEach((dependency: any) => {
        testUseCase.dependencies.push({
          gitRepoUrl: getPropertyOrThrow(dependency, "url"),
          gitRepoRef: getPropertyOrThrow(dependency, "ref"),
          useCase: getPropertyOrThrow(dependency, "use_case"),
        });
      });
      testUseCases.push(testUseCase);
      console.log(`Found test use case ${useCase} with dependencies ${JSON.stringify(testUseCase.dependencies)}`);
    }
  }
  return testUseCases;
}

function parseBuildUseCasesFromManifest(tomlContent: any): BuildUseCase[] | undefined {
  let useCasesSection = getProperty(tomlContent, "use_cases");
  let buildUseCases: BuildUseCase[] | undefined = undefined;
  if (useCasesSection) {
    console.log(`Found use_cases section in manifest`);
    buildUseCases = [];
    const useCases = Object.keys(useCasesSection);
    for (let useCase of useCases) {
      let buildUseCase: BuildUseCase = {
        name: useCase,
        options: getPropertyOrThrow(useCasesSection, useCase),
      };
      buildUseCases.push(buildUseCase);
      console.log(`Found build use case ${useCase} with options ${JSON.stringify(buildUseCase.options)}`);
    }
  }
  return buildUseCases;
}

export function getAndBuildAppTestsDependencies(targetSelector: TargetSelector) {
  if (selectedApp && selectedApp.selectedTestUseCase && selectedApp.functionalTestsDir) {
    selectedApp.selectedTestUseCase.dependencies.forEach((dep) => {
      let depFolderName = path.basename(dep.gitRepoUrl, ".git") + "-" + dep.useCase;
      let depFolderPath = path.join(selectedApp!.functionalTestsDir!, ".test_dependencies", depFolderName);
      let gitCloneCommand = `git clone ${dep.gitRepoUrl} --branch ${dep.gitRepoRef} ${depFolderPath}`;
      let execGitCloneCommand = `docker exec -t ${
        selectedApp!.containerName
      } bash -c 'if [ ! -d '${depFolderPath}' ]; then ${gitCloneCommand}; fi'`;

      try {
        cp.execSync(execGitCloneCommand, { stdio: "inherit" });
      } catch (error) {
        pushError(`Git clone of test dependency ${depFolderName} failed. ${error}`);
      }

      let depApp = findAppInFolder(vscode.Uri.parse(path.join(selectedApp!.folderUri.fsPath, depFolderPath)));
      if (depApp) {
        let depAppBuildUseCase = depApp.buildUseCases?.find((useCase) => useCase.name === dep.useCase);
        if (depAppBuildUseCase) {
          if (depApp.language === "C") {
            console.log(`Ledger: building C app ${depApp.name} in ${depFolderPath}`);

            let submodulesCommand = `cd ${depFolderPath} && git submodule update --init --recursive;`;
            if (platform === "win32") {
              // Execute git command in cmd.exe on host, no docker
              submodulesCommand = `cd ${depFolderPath} && cmd.exe /c "git submodule update --init --recursive";`;
            }

            let buildCommand = `export BOLOS_SDK=$(echo ${targetSelector.getSelectedSDK()}) && make -C ${path.join(
              depFolderPath,
              depApp.buildDirPath
            )} -j ${depAppBuildUseCase.options}`;

            let execBuildCommand = `${submodulesCommand} docker exec -t ${selectedApp!.containerName} bash -c '${buildCommand}'`;

            try {
              cp.execSync(execBuildCommand, { stdio: "inherit" });
            } catch (error) {
              pushError(`Build of test use case ${dep.useCase} dependency ${depApp.folderName} failed. ${error}`);
            }

            vscode.window.showInformationMessage(
              `Build of test dependency ${depApp.folderName} for target ${targetSelector.getSelectedTarget()} succeeded.`
            );
          }
        } else {
          pushError(`Build use case ${dep.useCase} not found in ${depApp.folderName} manifest. Cannot build test dependency.`);
        }
      }
    });
  }
}

// Parse manifest. Returns app language, build dir path, app name, devices, package name (for rust app), functional tests dir path (if any)
function parseManifest(tomlContent: any): [AppLanguage, string, LedgerDevice[], string?, TestUseCase[]?, BuildUseCase[]?] {
  // Parse app language
  const appLanguage = isValidLanguage(getPropertyOrThrow(tomlContent, "app.sdk"));

  // Parse build dir path
  let buildDirPath = getPropertyOrThrow(tomlContent, "app.build_directory");

  // Parse compatible devices
  const compatibleDevices: LedgerDevice[] = manifestDevicesToLedgerDevices(getPropertyOrThrow(tomlContent, "app.devices"));

  // Check if pytest functional tests are present
  let functionalTestsDir = getProperty(tomlContent, "tests.pytest_directory");

  // Parse test dependencies, if any.
  let testUseCases = parseTestsUsesCasesFromManifest(tomlContent);

  // Parse build use cases, if any.
  let buildUseCases = parseBuildUseCasesFromManifest(tomlContent);

  return [appLanguage, buildDirPath, compatibleDevices, functionalTestsDir, testUseCases, buildUseCases];
}

// Find app name and package name from build dir path, in Makefile for C apps or Cargo.toml for Rust apps
function findAdditionalInfo(appLanguage: AppLanguage, buildDirPath: string, appFolder: vscode.Uri): [string, string?] {
  let appName: string;
  let packageName: string | undefined;

  // Get the build dir path on the host to search for the Makefile or Cargo.toml
  let hostBuildDirPath = buildDirPath.startsWith("./") ? path.join(appFolder.fsPath, buildDirPath) : buildDirPath;

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
function parseLegacyRustManifest(tomlContent: any, appFolderUri: vscode.Uri): [string, string, string] {
  let cargoTomlPath = getPropertyOrThrow(tomlContent, "rust-app.manifest-path");
  const buildDirPath = path.dirname(cargoTomlPath);
  if (cargoTomlPath.startsWith("./")) {
    cargoTomlPath = path.join(appFolderUri.fsPath, cargoTomlPath);
  }
  let [appName, packageName] = parseCargoToml(cargoTomlPath);
  return [buildDirPath, appName, packageName];
}
