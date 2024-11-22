import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as fg from "fast-glob";
import * as toml from "@ltd/j-toml";
import { platform } from "node:process";
import * as cp from "child_process";
import { TaskProvider } from "./taskProvider";
import { LedgerDevice, TargetSelector } from "./targetSelector";
import { pushError, updateSetting, getSetting } from "./extension";
const APP_DETECTION_FILES: string[] = ["Makefile", "ledger_app.toml"];
const C_APP_DETECTION_STRING: string = "include $(BOLOS_SDK)/Makefile.defines";
const C_APP_NAME_MAKEFILE_VAR: string = "APPNAME";
const C_VARIANT_MAKEFILE_VAR: string = "VARIANTS";
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
export interface VariantList {
  name: string;
  selected: string;
  values: string[];
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
  // If the app has a functional tests directory, the tests list is parsed here
  functionalTestsList?: string[];
  selectedTests?: string[];
  // The new manifest format allows to specify the compatible devices
  compatibleDevices: LedgerDevice[];
  // If the app is a Rust app, the package name is parsed from the Cargo.toml
  packageName?: string;
  // If the app manifest has a tests dependencies (optional) section with use cases, they are parsed here
  testsUseCases?: TestUseCase[];
  selectedTestUseCase?: TestUseCase;
  builtTestDependencies?: boolean;
  // If the app manifest has build use cases (optional) section they are parsed here
  buildUseCases?: BuildUseCase[];
  selectedBuildUseCase?: BuildUseCase;
  // Supported variants
  variants?: VariantList;
}

let appList: App[] = [];
let selectedApp: App | undefined;

let appSelectedEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
export const onAppSelectedEvent: vscode.Event<void> = appSelectedEmitter.event;

let testUseCaseSelected: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
export const onTestUseCaseSelected: vscode.Event<void> = testUseCaseSelected.event;

let useCaseSelectedEmitter: vscode.EventEmitter<string> = new vscode.EventEmitter<string>();
export const onUseCaseSelectedEvent: vscode.Event<string> = useCaseSelectedEmitter.event;

let variantSelectedEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
export const onVariantSelectedEvent: vscode.Event<void> = variantSelectedEmitter.event;

let testsSelectedEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
export const onTestsSelectedEvent: vscode.Event<void> = testsSelectedEmitter.event;

export function getSelectedBuidUseCase(): string {
  if (selectedApp && selectedApp.selectedBuildUseCase) {
    return selectedApp.selectedBuildUseCase.name;
  }
  // No use case defined in manifest, no selection
  return "";
}

export function setBuildUseCase(name: string) {
  if (selectedApp && selectedApp?.buildUseCases) {
    for (let useCase of selectedApp?.buildUseCases) {
      if (useCase.name === name) {
        selectedApp.selectedBuildUseCase = useCase;
        // Save the selected use case in the app repo settings
        updateSetting("selectedUseCase", name, selectedApp.folderUri);
        break;
      }
    }
  }
}

export async function showBuildUseCase() {
  const buildUseCaseNames = selectedApp?.buildUseCases?.map(buildUseCases => buildUseCases.name);
  let result = undefined;
  if (buildUseCaseNames) {
    result = await vscode.window.showQuickPick(buildUseCaseNames, {
      placeHolder: "Please select a use case",
    });
  }
  if (result) {
    setBuildUseCase(result.toString());
    useCaseSelectedEmitter.fire(result.toString());
  }
  return result;
}

export function setVariant(name: string) {
  if (selectedApp && selectedApp?.variants) {
    for (let variant of selectedApp?.variants.values) {
      if (variant === name) {
        selectedApp.variants.selected = variant;
        // Save the selected variant in the app repo settings
        updateSetting("selectedVariant", name, selectedApp.folderUri);
        break;
      }
    }
  }
}

export async function showVariant() {
  if (selectedApp) {
    if (selectedApp.variants) {
      const items: string[] = [];
      for (let variant of selectedApp.variants.values) {
        items.push(variant);
      }
      const result = await vscode.window.showQuickPick(items, {
        placeHolder: "Please select a variant",
      });
      if (result) {
        setVariant(result.toString());
        variantSelectedEmitter.fire();
      }
      return result;
    }
    return "";
  }
}

function detectAppType(appFolder: vscode.Uri): [AppType?, string?] {
  const searchPatterns = APP_DETECTION_FILES.map(file => path.join(appFolder.fsPath, `**/${file}`).replace(/\\/g, "/"));
  const makefileOrToml = fg.sync(searchPatterns, { onlyFiles: true, deep: 2 });

  let appTypeAndFile: [AppType?, string?] = [undefined, undefined];

  if (makefileOrToml.length > 0) {
    const manifest = makefileOrToml.find(file => file.endsWith("ledger_app.toml"));
    if (manifest) {
      const fileContent = fs.readFileSync(manifest, "utf-8");
      const tomlContent = toml.parse(fileContent);
      if (tomlContent["rust-app"]) {
        appTypeAndFile = ["legacyManifest", manifest];
      }
      else {
        appTypeAndFile = ["manifest", manifest];
      }
    }
    else {
      for (let file of makefileOrToml) {
        const fileContent = fs.readFileSync(file, "utf-8");
        if (fileContent.includes(C_APP_DETECTION_STRING)) {
          appTypeAndFile = ["makefile", file];
          break;
        }
      }
    }
  }
  return appTypeAndFile;
}

export function findAppInFolder(folderUri: vscode.Uri): App | undefined {
  let app: App | undefined = undefined;

  const appFolderUri = folderUri;
  const folderStr = folderUri.toString(true);
  const appFolderName = path.basename(folderStr);
  const containerName = `${appFolderName}-container`;

  let appName = "unknown";
  let appLanguage: AppLanguage = "C";
  let testsDir = undefined;
  let packageName = undefined;
  let compatibleDevices: LedgerDevice[] = ["Nano S", "Nano S Plus", "Nano X", "Stax", "Flex"];
  let testsUseCases = undefined;
  let buildUseCases = undefined;
  let variants = undefined;
  let buildDirPath = "./";
  let found = true;

  try {
    let [appType, appFile] = detectAppType(folderUri);

    let fileContent = "";
    if (appFile) {
      fileContent = fs.readFileSync(appFile || "", "utf-8");
    }

    buildDirPath = path.relative(folderUri.fsPath, path.dirname(appFile || ""));
    buildDirPath = buildDirPath === "" ? "./" : buildDirPath;

    switch (appType) {
      case "manifest": {
        console.log("Found manifest in " + appFolderName);
        let tomlContent = toml.parse(fileContent);
        [appLanguage, buildDirPath, compatibleDevices, testsDir, testsUseCases, buildUseCases] = parseManifest(tomlContent);
        if (appLanguage === "C") {
          appName = getAppName(folderUri.fsPath);
        }
        else {
          let hostBuildDirPath = buildDirPath.startsWith("./") ? path.join(appFolderUri.fsPath, buildDirPath) : buildDirPath;
          [appName, packageName] = parseCargoToml(path.join(hostBuildDirPath, "Cargo.toml"));
        }
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
        appName = getAppName(folderUri.fsPath);
        testsDir = findFunctionalTestsWithoutManifest(appFolderUri);
        showManifestWarning(appFolderName, false);
        break;
      }
      default:
        found = false;
        break;
    }
  }
  catch (error) {
    let err = new Error();
    if (!(error instanceof Error)) {
      err.message = String(error);
    }
    else {
      err = error;
    }
    pushError("App detection failed in " + appFolderName + ". " + err.message);
    found = false;
  }

  // Add the app to the list
  if (found) {
    if (appLanguage === "C") {
      variants = getAppVariants(folderUri.fsPath, appName, appFolderUri);
      if (variants.values.length > 1) {
        vscode.commands.executeCommand("setContext", "ledgerDevTools.showSelectVariant", true);
      }
      else {
        vscode.commands.executeCommand("setContext", "ledgerDevTools.showSelectVariant", false);
      }
    }
    else {
      vscode.commands.executeCommand("setContext", "ledgerDevTools.showSelectVariant", false);
    }
    // Log all found fields
    console.log(
      `Found app '${appName}' in folder '${appFolderName}' with buildDirPath '${buildDirPath}' and language '${appLanguage}'`,
    );

    // Retrieve last use case name from settings
    let selectedBuildUseCase = getAppUseCases(buildUseCases, folderUri);

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
      builtTestDependencies: false,
      buildUseCases: buildUseCases,
      selectedBuildUseCase: selectedBuildUseCase,
      variants: variants,
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
  const appFolderNames = appList.map(app => app.folderName);
  const result = await vscode.window.showQuickPick(appFolderNames, {
    placeHolder: "Please select an app",
  });
  if (result) {
    setSelectedApp(appList.find(app => app.folderName === result));
    appSelectedEmitter.fire();
  }
  getAndBuildAppTestsDependencies(targetSelector);
  return result;
}

export async function showTestsSelectorMenu() {
  if (selectedApp && selectedApp.functionalTestsList) {
    // Get previously selected items (if not undefined and length not 0) or default to full list
    let selectedItems: string[]
      = selectedApp.selectedTests && selectedApp.selectedTests.length > 0
        ? selectedApp.selectedTests
        : selectedApp.functionalTestsList || [];

    console.log(`Selected tests: ${selectedItems}`);
    const qp = vscode.window.createQuickPick();
    qp.canSelectMany = true;
    const quickPickItems = selectedApp.functionalTestsList.map(test => ({
      label: test,
    }));
    qp.items = quickPickItems;
    // Pre-select items by finding matching QuickPickItems
    qp.selectedItems = quickPickItems.filter(item => selectedItems.includes(item.label));
    qp.placeholder = "Please select the functional tests to run";
    // Set up event handlers before showing the QuickPick
    qp.onDidAccept(() => {
      if (selectedApp) {
        selectedApp.selectedTests = undefined;
        if (qp.selectedItems.length !== selectedApp.functionalTestsList!.length) {
          selectedApp.selectedTests = qp.selectedItems.map(item => item.label);
        }
        console.log(`Selected tests on accept: ${selectedApp.selectedTests}`);
        testsSelectedEmitter.fire();
      }
      qp.dispose();
    });
    qp.onDidChangeSelection((items) => {
      if (selectedApp) {
        selectedApp.selectedTests = undefined;
        if (qp.selectedItems.length !== selectedApp.functionalTestsList!.length) {
          selectedApp.selectedTests = items.map(item => item.label);
        }
        testsSelectedEmitter.fire();
        console.log(`Selected tests changed: ${selectedApp.selectedTests}`);
      }
    });
    qp.show();
  }
}

export async function showTestUseCaseSelectorMenu(targetSelector: TargetSelector) {
  const testUseCaseNames = selectedApp?.testsUseCases?.map(testUseCase => testUseCase.name);
  let result: string | undefined = undefined;
  if (testUseCaseNames) {
    result = await vscode.window.showQuickPick(testUseCaseNames, {
      placeHolder: "Please select a test use case",
    });
    if (result) {
      selectedApp!.selectedTestUseCase = selectedApp!.testsUseCases?.find(testUseCase => testUseCase.name === result);
      testUseCaseSelected.fire();
    }
  }
  getAndBuildAppTestsDependencies(targetSelector, true);
  return result;
}

export function getSelectedApp() {
  return selectedApp;
}

export function setSelectedApp(app: App | undefined) {
  selectedApp = app;
  if (app) {
    vscode.commands.executeCommand("setContext", "ledgerDevTools.showSelectTests", false);
    if (app.testsUseCases) {
      vscode.commands.executeCommand("setContext", "ledgerDevTools.showRebuildTestUseCaseDeps", true);
      if (app.testsUseCases.length > 1) {
        vscode.commands.executeCommand("setContext", "ledgerDevTools.showSelectTestUseCase", true);
      }
      else {
        vscode.commands.executeCommand("setContext", "ledgerDevTools.showSelectTestUseCase", false);
      }
    }
    else {
      vscode.commands.executeCommand("setContext", "ledgerDevTools.showRebuildTestUseCaseDeps", false);
      vscode.commands.executeCommand("setContext", "ledgerDevTools.showSelectTestUseCase", false);
    }
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
              ].toString()}), updating it with ${currentApp.folderName}:${value}`,
            );
          }
          else {
            console.log(
              `Ledger: no additionalReqsPerApp configuration found, creating it with ${currentApp.folderName}:${value}`,
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
      vscode.Uri.parse("https://github.com/LedgerHQ/ledgered/blob/master/doc/manifest.md"),
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
        case "flex":
          return "Flex";
        default:
          throw new Error("Invalid device in manifest : " + device);
      }
    });
}

// Get the app name (for C apps)
function getAppName(appdir: string): string {
  let optionsExecSync: cp.ExecSyncOptions = { stdio: "pipe", encoding: "utf-8" };
  // If platform is windows, set shell to powershell for cp exec.
  if (platform === "win32") {
    let shell: string = "C:\\windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
    optionsExecSync.shell = shell;
  }

  const conf = vscode.workspace.getConfiguration("ledgerDevTools");
  const image = conf.get<string>("dockerImage") || "";

  // BOLOS_SDK value doesn't impact the APPNAME
  let cleanCmd: string = `docker run --rm -v '${appdir}:/app' ${image} bash -c "BOLOS_SDK=/opt/stax-secure-sdk make listinfo | grep ${C_APP_NAME_MAKEFILE_VAR}| cut -d'=' -f2"`;
  return cp.execSync(cleanCmd, optionsExecSync).toString().trim();
}

// Get the app build use cases
function getAppUseCases(buildUseCases: BuildUseCase[] | undefined, folderUri: vscode.Uri): BuildUseCase | undefined {
  // Retrieve last selected use case name from settings
  let selectedBuildUseCase: BuildUseCase | undefined = undefined;
  if (buildUseCases) {
    const lastUseCase = getSetting("selectedUseCase", folderUri);
    if (lastUseCase) {
      selectedBuildUseCase = buildUseCases.find(useCase => useCase.name === lastUseCase);
    }
    if (selectedBuildUseCase === undefined) {
      selectedBuildUseCase = buildUseCases[0];
      updateSetting("selectedUseCase", selectedBuildUseCase.name, folderUri);
    }
  }
  return selectedBuildUseCase;
}

// Get the app variants (for C apps)
function getAppVariants(appdir: string, appName: string, folderUri: vscode.Uri): VariantList {
  let optionsExecSync: cp.ExecSyncOptions = { stdio: "pipe", encoding: "utf-8" };
  // If platform is windows, set shell to powershell for cp exec.
  if (platform === "win32") {
    let shell: string = "C:\\windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
    optionsExecSync.shell = shell;
  }

  let variants: VariantList = {
    name: "",
    selected: "",
    values: [],
  };
  // Retrieve the last selected variant from settings
  variants.selected = getSetting("selectedVariant", folderUri);

  const conf = vscode.workspace.getConfiguration("ledgerDevTools", folderUri);
  const image = conf.get<string>("dockerImage") || "";

  // BOLOS_SDK value doesn't impact the APPNAME
  let cleanCmd: string = `docker run --rm -v '${appdir}:/app' ${image} bash -c "BOLOS_SDK=/opt/stax-secure-sdk make listvariants | grep ${C_VARIANT_MAKEFILE_VAR} | cut -d' ' -f2-"`;
  let result = cp.execSync(cleanCmd, optionsExecSync).toString().trim().split(" ");
  // Variant name is the 2nd word, and the values are following from the 3rd word
  variants.name = result[0];
  variants.values = result.slice(1);

  if (variants.selected === "") {
    // Try to guess the default variant, using the APPNAME
    const selected = result.find(elt => elt.toLowerCase() === appName.toLowerCase());
    if (selected) {
      variants.selected = selected;
    }
    else {
      // Variant not found: Init with 1st element in the list
      variants.selected = result[1];
    }
    updateSetting("selectedVariant", variants.selected, folderUri);
  }

  return variants;
}

// Get pytest tests list
export function getAppTestsList(targetSelector: TargetSelector) {
  let testsList: string[] = [];
  if (
    selectedApp
    && selectedApp.functionalTestsDir
    && selectedApp.containerName
    && targetSelector.getSelectedTarget() !== "All"
  ) {
    vscode.commands.executeCommand("setContext", "ledgerDevTools.showSelectTests", false);
    selectedApp.functionalTestsList = [];
    selectedApp.selectedTests = [];
    let device = targetSelector.getSelectedSpeculosModel();
    let optionsExec: cp.ExecOptions = { cwd: selectedApp!.folderUri.fsPath, windowsHide: true };
    // If platform is windows, set shell to powershell for cp exec.
    if (platform === "win32") {
      let shell: string = "C:\\windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
      optionsExec.shell = shell;
    }
    // Find the tests list with pytest :
    // * Get the device option from pytest help (either --model or --device)
    // * If the device option is found, run pytest with --collect-only and the device option
    // * If the device option is not found, run pytest with --collect-only
    let getTestsListCmd = "docker";
    let getTestsListArgs = [
      "exec", "-u", "0", selectedApp!.containerName, "bash", "-c",
      `cd ${selectedApp.functionalTestsDir} &&
        pip install -r requirements.txt > /dev/null 2>&1 &&
        clear &&
        device_option=$(pytest --help |
            awk "/[C|c]ustom options/,/^$/" |
            grep -E -- "--model|--device" |
            head -n 1 |
            tr " =" "\n" |
            grep -v "^$" |
            head -n 1
        );
        if [ -n "$device_option" ]; then
            pytest --collect-only -q "$device_option" ${device}
        else
            pytest --collect-only -q
        fi`,
    ];
    // Executing the command with a callback
    cp.execFile(getTestsListCmd, getTestsListArgs, optionsExec, (error, stdout, stderr) => {
      if (error) {
        pushError(`Error while getting tests list: ${error.message}`);
        return;
      }
      else {
        stdout.split("\n").forEach((line: string) => {
          if (line.includes("::")) {
            let parts = line.split("::");
            if (parts.length > 0) {
              let testName = parts[parts.length - 1].split("[")[0];
              if (testName !== undefined && testName !== "") {
                testsList.push(testName);
              }
            }
          }
        });
        if (testsList.length > 1) {
          selectedApp!.functionalTestsList = testsList;
          vscode.commands.executeCommand("setContext", "ledgerDevTools.showSelectTests", true);
        }
      }
    });
  }
  else {
    vscode.commands.executeCommand("setContext", "ledgerDevTools.showSelectTests", false);
  }
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
  let debugFlagFound: Boolean = false;
  let debugNameFound: Boolean = false;

  buildUseCases = [];
  // Add a default 'release' use case, to build in release mode, without any flag
  let buildUseCase: BuildUseCase = {
    name: "release",
    options: "",
  };
  buildUseCases.push(buildUseCase);

  // Parse 'use_cases' section from manifest to retrieve the configuration
  if (useCasesSection) {
    const useCases = Object.keys(useCasesSection);
    for (let useCase of useCases) {
      let buildUseCase: BuildUseCase = {
        name: useCase,
        options: getPropertyOrThrow(useCasesSection, useCase),
      };
      if (buildUseCase.options === "DEBUG=1") {
        // A debug use case already exists
        debugFlagFound = true;
      }
      if (buildUseCase.name === "debug") {
        // A use case with name 'debug' already exists
        debugNameFound = true;
      }
      buildUseCases.push(buildUseCase);
      console.log(`Found build use_case '${useCase}' with options ${JSON.stringify(buildUseCase.options)}`);
    }
  }

  // Add a default 'debug' use case if not found in the manifest
  if (debugFlagFound === false) {
    let buildUseCase: BuildUseCase = {
      name: "debug",
      options: "DEBUG=1",
    };
    if (debugNameFound === true) {
      buildUseCase.name = "debug_default";
    }
    buildUseCases.push(buildUseCase);
  }
  return buildUseCases;
}

export function getAndBuildAppTestsDependencies(targetSelector: TargetSelector, clean: boolean = false) {
  const testDepDir = ".test_dependencies";
  let optionsExec: cp.ExecOptions = { cwd: selectedApp!.folderUri.fsPath, windowsHide: true };
  let optionsExecSync: cp.ExecSyncOptions = { cwd: selectedApp!.folderUri.fsPath, stdio: "inherit", windowsHide: true };
  // If platform is windows, set shell to powershell for cp exec.
  if (platform === "win32") {
    let shell = "C:\\windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
    optionsExec.shell = shell;
    optionsExecSync.shell = shell;
  }
  // If the app has a functional tests directory and test use cases defined in the manifest with dependencies, clone the dependencies and build them.
  if (selectedApp && selectedApp.selectedTestUseCase && selectedApp.functionalTestsDir) {
    const testDepDirPath = path.posix.join(selectedApp.functionalTestsDir, testDepDir);
    // Clean the test dependencies folder if it exists and the clean flag is set
    if (clean) {
      let cleanCmd = `docker exec ${
        selectedApp!.containerName
      } bash -c "if [ -d '${testDepDirPath}' ]; then rm -rf ${testDepDirPath}; fi"`;
      try {
        vscode.commands.executeCommand("setContext", "ledgerDevTools.showRebuildTestUseCaseDeps", false);
        vscode.commands.executeCommand("setContext", "ledgerDevTools.showrebuildTestUseCaseDepsSpin", true);
        cp.execSync(cleanCmd, optionsExecSync);
      }
      catch (error) {
        pushError(`Clean of test dependencies failed. ${error}`);
      }
      selectedApp.builtTestDependencies = false;
    }

    if (!selectedApp.builtTestDependencies) {
      // First, clone the test dependencies.
      selectedApp.selectedTestUseCase.dependencies.forEach((dep) => {
        let depFolderName = path.basename(dep.gitRepoUrl, ".git") + "-" + dep.useCase;
        let depFolderPath = path.posix.join(testDepDirPath, depFolderName);
        let gitCloneCommand = `git clone ${dep.gitRepoUrl} --branch ${dep.gitRepoRef} ${depFolderPath}`;
        let execGitCloneCommand = `docker exec ${
          selectedApp!.containerName
        } bash -c "if [ ! -d '${depFolderPath}' ]; then ${gitCloneCommand}; fi"`;

        try {
          cp.execSync(execGitCloneCommand, optionsExecSync);
        }
        catch (error) {
          pushError(`Git clone of test dependency ${depFolderName} failed. ${error}`);
        }

        // Then, if the dependency is detected as an app, build it.
        let depApp = findAppInFolder(vscode.Uri.parse(path.join(selectedApp!.folderUri.fsPath, depFolderPath)));
        if (depApp) {
          let depAppBuildUseCase = depApp.buildUseCases?.find(useCase => useCase.name === dep.useCase);
          if (depAppBuildUseCase) {
            if (depApp.language === "C") {
              console.log(`Ledger: building C app ${depApp.name} in ${depFolderPath}`);

              // Execute git command in cmd.exe on host, no docker
              let submodulesCommand = `cd ${depFolderPath} && git submodule update --init --recursive;`;
              if (platform === "win32") {
                // Adapt the command for windows
                submodulesCommand = `cd ${path.join(depFolderPath)} ; cmd.exe /c "git submodule update --init --recursive";`;
              }
              // Build the app for all supported targets
              let buildCommand = "";
              let target = targetSelector.getSelectedTarget();
              targetSelector.getTargetsArray().forEach((target) => {
                targetSelector.setSelectedTarget(target);
                buildCommand += `export BOLOS_SDK=$(echo ${targetSelector.getSelectedSDK()}) && make -C ${path.posix.join(
                  depFolderPath,
                  depApp!.buildDirPath,
                )} -j ${depAppBuildUseCase!.options} ; `;
              });
              targetSelector.setSelectedTarget(target);

              let execBuildCommand = `${submodulesCommand} docker exec ${selectedApp!.containerName} bash -c '${buildCommand}'`;

              vscode.commands.executeCommand("setContext", "ledgerDevTools.showRebuildTestUseCaseDeps", false);
              vscode.commands.executeCommand("setContext", "ledgerDevTools.showrebuildTestUseCaseDepsSpin", true);

              // Executing the command with a callback
              cp.exec(execBuildCommand, optionsExec, (error, stdout, stderr) => {
                if (error) {
                  pushError(`Build of test use case ${dep.useCase} dependency ${depApp!.folderName} failed. ${error}`);
                  return;
                }
                else {
                  selectedApp!.builtTestDependencies = true;
                  vscode.window.showInformationMessage(
                    `Build of test dependency ${depApp!.folderName} for all supported targets succeeded.`,
                  );
                }
                vscode.commands.executeCommand("setContext", "ledgerDevTools.showRebuildTestUseCaseDeps", true);
                vscode.commands.executeCommand("setContext", "ledgerDevTools.showrebuildTestUseCaseDepsSpin", false);
              });
            }
          }
          else {
            pushError(`Build use case ${dep.useCase} not found in ${depApp.folderName} manifest. Cannot build test dependency.`);
          }
        }
      });
    }
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
