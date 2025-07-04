"use strict";

import * as vscode from "vscode";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import * as fg from "fast-glob";
import { platform } from "node:process";
import { TargetSelector, specialAllDevice } from "./targetSelector";
import { getSelectedApp, App, AppLanguage } from "./appSelector";
import { TreeDataProvider } from "./treeView";

export const taskType = "L";

// Udev rules (for Linux app loading requirements)
const udevRulesFilePath = "/etc/udev/rules.d/";
const udevRulesUrl = "https://raw.githubusercontent.com/LedgerHQ/udev-rules/master/20-hw1.rules";
let udevRulesDone: boolean = false;

type CustomTaskFunction = () => void;
type ExecBuilder = () => string | [string, CustomTaskFunction];
type TaskTargetLanguage = AppLanguage | "Both";
type BuilderForLanguage = Partial<Record<TaskTargetLanguage, ExecBuilder>>;

type TaskState = "enabled" | "disabled" | "unavailable";
type BehaviorWhenAllTargetsSelected = "enable" | "disable" | "executeForEveryTarget";

export interface ChecksList {
  selected: string;
  values: string[];
}
const validChecks: string[] = ["All", "manifest", "icons", "app_load_params", "makefile", "readme", "scan"];
export const checks: ChecksList = {
  selected: "All",
  values: validChecks,
};

let checkSelectedEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
export const onCheckSelectedEvent: vscode.Event<void> = checkSelectedEmitter.event;

export async function showChecks() {
  let result = undefined;
  result = await vscode.window.showQuickPick(validChecks, {
    placeHolder: "Please select a check to run",
  });
  if (result) {
    checks.selected = result.toString();
    checkSelectedEmitter.fire();
  }
  return result;
}

export interface BuildModeList {
  selected: string;
  values: string[];
}
const validBuildMode: string[] = ["Incremental", "Full"];
export const buildMode: BuildModeList = {
  selected: "Incremental",
  values: validBuildMode,
};

let buildModeSelectedEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
export const onBuildModeSelectedEvent: vscode.Event<void> = buildModeSelectedEmitter.event;

export async function toggleBuildMode() {
  if (buildMode.selected === "Incremental") {
    buildMode.selected = "Full";
  }
  else {
    buildMode.selected = "Incremental";
  }
  buildModeSelectedEmitter.fire();
}

// Cache the Promise to ensure the function is only executed once
let appLoadRequirementsPromise: Promise<string> | null = null;

// Fetch the udev rules file from the URL and write it to a temporary file
async function fetchUdevRules(): Promise<string> {
  const response = await fetch(udevRulesUrl);
  const udevRulesFile = path.basename(udevRulesUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch udev rules: ${response.statusText}`);
  }
  const tempFilePath = path.join(os.tmpdir(), udevRulesFile);
  const rulesContent = await response.text();

  // Write the content to a temporary file
  fs.writeFileSync(tempFilePath, rulesContent, { encoding: "utf8" });

  return tempFilePath; // Return the path to the temporary file
}

export interface TaskSpec {
  group?: string;
  name: string;
  toolTip?: string;
  builders: BuilderForLanguage;
  dependsOn?: ExecBuilder;
  state: TaskState;
  allSelectedBehavior: BehaviorWhenAllTargetsSelected;
}

class MyTask extends vscode.Task {
  public customFunction: CustomTaskFunction | undefined;
  constructor(
    definition: vscode.TaskDefinition,
    scope: vscode.TaskScope,
    name: string,
    source: string,
    execution: vscode.ShellExecution,
    customFunction: CustomTaskFunction | undefined,
  ) {
    super(definition, scope, name, source, execution);
    this.customFunction = customFunction;
  }
}

export class TaskProvider implements vscode.TaskProvider {
  private treeProvider: TreeDataProvider;
  private tgtSelector: TargetSelector;
  private image: string;
  private onboardPin: string;
  private onboardSeed: string;
  private scpConfig: boolean;
  private enableNanoxOps: boolean;
  private additionalReqs?: string;
  private buildDir: string;
  private workspacePath: string;
  private containerName: string;
  private appFolderUri?: vscode.Uri;
  private appName: string;
  private appLanguage: AppLanguage;
  private functionalTestsDir?: string;
  private packageName?: string;
  private tasks: MyTask[] = [];
  private currentApp?: App;
  private dockerRunArgs: string = "";
  private selectedTests?: string[];
  private taskSpecs: TaskSpec[] = [
    {
      group: "Docker Container",
      name: "Update container",
      builders: { ["Both"]: this.runDevToolsImageExec },
      toolTip: "Update docker container (pull image and restart container)",
      state: "enabled",
      allSelectedBehavior: "enable",
    },
    {
      group: "Docker Container",
      name: "Open default terminal",
      builders: { ["Both"]: this.openDefaultTerminalExec },
      toolTip: "Open terminal in container with default configuration",
      state: "enabled",
      allSelectedBehavior: "enable",
    },
    {
      group: "Docker Container",
      name: "Open compose terminal",
      builders: { ["Both"]: this.openComposeTerminalExec },
      toolTip: "Open terminal in container with 'docker-compose.yml' configuration",
      state: "disabled",
      allSelectedBehavior: "disable",
    },
    {
      group: "Build",
      name: "Build app",
      builders: { ["c"]: this.cBuildExec, ["rust"]: this.rustBuildExec },
      toolTip: "Build app",
      dependsOn: this.appSubmodulesInitExec,
      state: "enabled",
      allSelectedBehavior: "executeForEveryTarget",
    },
    {
      group: "Build",
      name: "Clean the target build files",
      builders: { ["c"]: this.cCleanTargetExec },
      toolTip: "Clean the app build files for the selected target",
      state: "enabled",
      allSelectedBehavior: "disable",
    },
    {
      group: "Build",
      name: "Clean all the build files",
      builders: { ["c"]: this.cCleanAllExec, ["rust"]: this.rustCleanAllExec },
      toolTip: "Clean the app build files for all targets",
      state: "enabled",
      allSelectedBehavior: "enable",
    },
    {
      group: "Functional Tests",
      name: "Run with emulator",
      builders: { ["Both"]: this.runInSpeculosExec },
      toolTip: "Run app with emulator (Speculos)",
      state: "enabled",
      allSelectedBehavior: "disable",
    },
    {
      group: "Functional Tests",
      name: "Kill emulator",
      builders: { ["Both"]: this.killSpeculosExec },
      toolTip: "Kill emulator (Speculos) instance",
      state: "enabled",
      allSelectedBehavior: "disable",
    },
    {
      group: "Functional Tests",
      name: "Run tests",
      builders: { ["Both"]: this.functionalTestsExec },
      dependsOn: this.functionalTestsRequirementsExec,
      toolTip: "Run Python functional tests (with Qt display disabled)",
      state: "enabled",
      allSelectedBehavior: "executeForEveryTarget",
    },
    {
      group: "Functional Tests",
      name: "Run tests with display",
      builders: { ["Both"]: this.functionalTestsDisplayExec },
      dependsOn: this.functionalTestsRequirementsExec,
      toolTip: "Run Python functional tests (with Qt display enabled)",
      state: "enabled",
      allSelectedBehavior: "executeForEveryTarget",
    },
    {
      group: "Functional Tests",
      name: "Run tests with display - on device",
      builders: { ["Both"]: this.functionalTestsDisplayOnDeviceExec },
      dependsOn: this.functionalTestsRequirementsExec,
      toolTip: "Run Python functional tests (with Qt display enabled) on real device",
      state: "enabled",
      allSelectedBehavior: "disable",
    },
    {
      group: "Functional Tests",
      name: "Generate golden snapshots",
      builders: { ["Both"]: this.functionalTestsGoldenRunExec },
      dependsOn: this.functionalTestsRequirementsExec,
      toolTip:
        "Run Python functional tests with '--golden_run' option to generate golden snapshots. They are used during tests runs to check what should be displayed on the device screen",
      state: "enabled",
      allSelectedBehavior: "executeForEveryTarget",
    },
    {
      group: "Fuzzing",
      name: "Build fuzzer",
      builders: { ["Both"]: this.runBuildFuzzingExec },
      toolTip: "Builds fuzzer localted in fuzzing folder.",
      state: "enabled",
      allSelectedBehavior: "disable",
    },
    {
      group: "Fuzzing",
      name: "Run fuzzer",
      builders: { ["Both"]: this.runFuzzingExec },
      toolTip: "Runs selected harness using 4 cores.",
      state: "disabled",
      allSelectedBehavior: "disable",
    },
    {
      group: "Fuzzing",
      name: "Run crash",
      builders: { ["Both"]: this.runFuzzingCrash },
      toolTip: "Runs selected crash on selected harness.",
      state: "disabled",
      allSelectedBehavior: "disable",
    },
    {
      group: "Device Operations",
      name: "Load app on device",
      builders: { ["Both"]: this.appLoadExec },
      dependsOn: this.appLoadRequirementsExec,
      toolTip: "Load app on a physical device",
      state: "enabled",
      allSelectedBehavior: "disable",
    },
    {
      group: "Device Operations",
      name: "Delete app from device",
      builders: { ["Both"]: this.appDeleteExec },
      dependsOn: this.appLoadRequirementsExec,
      toolTip: "Delete app from a physical device",
      state: "enabled",
      allSelectedBehavior: "disable",
    },
    {
      group: "Device Operations",
      name: "Quick initial device setup",
      builders: { ["Both"]: this.deviceOnboardingExec },
      dependsOn: this.appLoadRequirementsExec,
      toolTip: "Automatic initial device setup with pre-defined test seed and PIN",
      state: "enabled",
      allSelectedBehavior: "disable",
    },
    {
      name: "Run Guideline Enforcer",
      builders: { ["Both"]: this.runGuidelineEnforcer },
      toolTip:
        "Run Guideline Enforcer checks. These checks are also run in the app's repository CI and must pass before the app can be deployed.",
      state: "enabled",
      allSelectedBehavior: "enable",
    },
  ];

  constructor(treeProvider: TreeDataProvider, targetSelector: TargetSelector) {
    this.treeProvider = treeProvider;
    this.tgtSelector = targetSelector;
    this.appLanguage = "c";
    this.appName = "";
    this.containerName = "";
    this.workspacePath = "";
    this.buildDir = "";
    this.currentApp = getSelectedApp();
    const conf = vscode.workspace.getConfiguration("ledgerDevTools");
    this.image = conf.get<string>("dockerImage") || "";
    this.onboardPin = conf.get<string>("onboardingPin") || "";
    this.onboardSeed = conf.get<string>("onboardingSeed") || "";
    this.scpConfig = conf.get<boolean>("userScpPrivateKey") || false;
    this.enableNanoxOps = conf.get<boolean>("enableDeviceOpsForNanoX") || false;
    const configReqs = conf.get<Record<string, string>>("additionalReqsPerApp");
    if (this.currentApp && configReqs && configReqs[this.currentApp.folderName]) {
      this.additionalReqs = configReqs[this.currentApp.folderName];
    }
  }

  private resetVars() {
    this.containerName = "";
    this.workspacePath = "";
    this.buildDir = "";
    this.functionalTestsDir = undefined;
    this.selectedTests = undefined;
    this.packageName = undefined;
    const conf = vscode.workspace.getConfiguration("ledgerDevTools");
    this.image = conf.get<string>("dockerImage") || "";
    this.onboardPin = conf.get<string>("onboardingPin") || "";
    this.onboardSeed = conf.get<string>("onboardingSeed") || "";
    this.scpConfig = conf.get<boolean>("userScpPrivateKey") || false;
    this.enableNanoxOps = conf.get<boolean>("enableDeviceOpsForNanoX") || false;
    this.currentApp = getSelectedApp();
    if (this.currentApp) {
      const configReqs = conf.get<Record<string, string>>("additionalReqsPerApp");
      if (configReqs && configReqs[this.currentApp.folderName]) {
        this.additionalReqs = configReqs[this.currentApp.folderName];
      }
      else {
        this.additionalReqs = undefined;
      }
      this.functionalTestsDir = this.currentApp.functionalTestsDir;

      if (this.functionalTestsDir && this.currentApp.functionalTestsList && this.currentApp.functionalTestsList.length > 0) {
        this.selectedTests
          = this.currentApp.selectedTests && this.currentApp.selectedTests.length > 0 ? this.currentApp.selectedTests : undefined;
        console.log(`Task provider selected tests after reset: ${this.selectedTests}`);
      }

      this.appName = this.currentApp.name;
      this.appLanguage = this.currentApp.language;
      this.containerName = this.currentApp.containerName;
      this.appFolderUri = this.currentApp.folderUri;
      this.buildDir = this.currentApp.buildDirPath;
      this.workspacePath = this.currentApp.folderUri.path;
      this.packageName = this.currentApp.packageName;

      const appConf = vscode.workspace.getConfiguration("ledgerDevTools", this.appFolderUri);
      this.dockerRunArgs = appConf.get<string>("dockerRunArgs") || "";
    }
  }

  public generateTasks() {
    this.tasks = [];
    this.resetVars();
    this.checkDisabledTasks(this.taskSpecs);
    this.pushTasks(this.taskSpecs);
    this.treeProvider.addAllTasksToTree(this.taskSpecs);
  }

  public regenerateSubset(taskNames: string[]) {
    if (!this.currentApp) {
      return;
    }
    // Reset provider vars
    this.resetVars();
    // Keep track of existing tasks that aren't being regenerated
    const preservedTasks = this.tasks.filter(task => !taskNames.includes(task.name));
    // Clear only the tasks we want to regenerate
    this.tasks = preservedTasks;
    // Only process specs for the tasks we want to regenerate
    const specsToRegenerate = this.taskSpecs.filter(spec => taskNames.includes(spec.name));
    // Check disabled state for the subset
    this.checkDisabledTasks(specsToRegenerate);
    // Push only the regenerated tasks
    this.pushTasks(specsToRegenerate);
    // Update tree view with all tasks
    this.treeProvider.addAllTasksToTree(this.taskSpecs);
  }

  public async provideTasks(): Promise<vscode.Task[]> {
    this.generateTasks();
    return this.tasks;
  }

  public async resolveTask(task: vscode.Task): Promise<vscode.Task | undefined> {
    return undefined;
  }

  public getTaskByName(taskName: string) {
    return this.tasks.find(task => task.name === taskName);
  }

  public executeTaskByName(taskName: string) {
    const task = this.getTaskByName(taskName);
    if (task) {
      if (task.customFunction) {
        task.customFunction();
      }
      vscode.tasks.executeTask(task);
    }
  }

  private runDevToolsImageExec(): string {
    let exec = "";
    let BOLOS_SDK = "/home/gustavojs/fuzz/ledger-secure-sdk"; // WHILE WAITING FOR SDK's PR

    if (this.currentApp) {
      // Checks if a container with the name ${this.containerName} exists, and if it does, it is stopped and removed before a new container is created using the same name and other specified configuration parameters
      if (platform === "linux") {
        // Linux
        exec = `xhost + ; docker ps -a --format '{{.Names}}' | grep -q ${this.containerName} && (docker container stop ${this.containerName} && docker container rm ${this.containerName}) ; docker pull ${this.image} && docker run --user $(id -u):$(id -g) --privileged -e DISPLAY=$DISPLAY -v '/dev/bus/usb:/dev/bus/usb' -v '/tmp/.X11-unix:/tmp/.X11-unix' -v '${BOLOS_SDK}:/ledger-secure-sdk' -v '${this.workspacePath}:/app' ${this.dockerRunArgs} -t -d --name ${this.containerName} ${this.image}`;
      }
      else if (platform === "darwin") {
        // macOS
        exec = `xhost + ; docker ps -a --format '{{.Names}}' | grep -q ${this.containerName} && (docker container stop ${this.containerName} && docker container rm ${this.containerName}) ; docker pull ${this.image} && docker run --user $(id -u):$(id -g) --privileged -e DISPLAY='host.docker.internal:0' -v '/tmp/.X11-unix:/tmp/.X11-unix' -v '${this.workspacePath}:/app' ${this.dockerRunArgs} -t -d --name ${this.containerName} ${this.image}`;
      }
      else {
        // Assume windows
        const winWorkspacePath = this.workspacePath.substring(1); // Remove first '/' from windows workspace path URI. Otherwise it is not valid.
        exec = `if (docker ps -a --format '{{.Names}}' | Select-String -Quiet ${this.containerName}) { docker container stop ${this.containerName}; docker container rm ${this.containerName} }; docker pull ${this.image}; docker run --privileged -e DISPLAY='host.docker.internal:0' -v '${winWorkspacePath}:/app' ${this.dockerRunArgs} -t -d --name ${this.containerName} ${this.image}`;
      }
    }

    return exec;
  }

  private runBuildFuzzingExec(): string {
    let exec = "";
    let targetDevice = this.tgtSelector.getSelectedTarget().toLowerCase().replace(/\s/g, "");

    let buildFuzzingScript = `/ledger-secure-sdk/fuzzing/local_run.sh --build=1 --TARGET_DEVICE=${targetDevice} --BOLOS_SDK=/ledger-secure-sdk --run-fuzzer=0 --compute-coverage=0`;

    if (this.currentApp) {
      exec = `docker exec -iu root -it ${this.containerName} bash -c 'apt-get update && apt-get install -y bear libclang-rt-dev && make clean' && docker exec -it ${
        this.containerName
      } bash -c 'cd ${this.currentApp.fuzzingDirPath} && ${buildFuzzingScript}'`;
    }
    else {
      vscode.window.showWarningMessage("No app found, check if the container is running.");
      return `echo 'No app found, check if the container is running.'`;
    }
    return exec;
  }

  private runFuzzingExec(): string {
    this.currentApp = getSelectedApp();
    const target = this.tgtSelector.getSelectedTarget()?.toLowerCase().replace(/\s/g, "");

    if (this.currentApp) {
      if (!this.currentApp.fuzzingHarness) {
        // vscode.window.showWarningMessage("runFuzzingExec - No harness selected.");
        return `echo 'runFuzzingExec - No harness selected'`;
      }

      const runFuzzingScript = `/ledger-secure-sdk/fuzzing/local_run.sh --build=0 --re-generate-macros=0 --TARGET_DEVICE=${target} --fuzzer=build/${this.currentApp.fuzzingHarness} --BOLOS_SDK=/ledger-secure-sdk --j=4 --run-fuzzer=1 --compute-coverage=0`;

      return `docker exec -it ${this.containerName} bash -c 'cd ${this.currentApp.fuzzingDirPath} && ${runFuzzingScript}'`;
    }
    else {
      vscode.window.showWarningMessage(`No app selected`);
      return `echo 'No app selected'`;
    }
  }

  private runFuzzingCrash(): string {
    this.currentApp = getSelectedApp();
    const target = this.tgtSelector.getSelectedTarget()?.toLowerCase().replace(/\s/g, "");

    if (this.currentApp) {
      if (!this.currentApp.fuzzingHarness) {
        // vscode.window.showWarningMessage("runFuzzingCrash - No harness selected.");
        return `echo 'runFuzzingCrash - No harness selected'`;
      }
      if (!this.currentApp.fuzzingCrash) {
        // vscode.window.showWarningMessage("No crash selected.");
        return `echo 'No crash selected'`;
      }

      const runFuzzingCrashScript = `/ledger-secure-sdk/fuzzing/local_run.sh --TARGET_DEVICE=${target} --fuzzer=build/${this.currentApp.fuzzingHarness} --BOLOS_SDK=/ledger-secure-sdk --run-crash=${this.currentApp.fuzzingCrash}`;

      return `docker exec -it ${this.containerName} bash -c 'cd ${this.currentApp.fuzzingDirPath} && ${runFuzzingCrashScript}'`;
    }
    else {
      vscode.window.showWarningMessage(`No app selected`);
      return `echo 'No app selected'`;
    }
  }

  private cBuildExec(): string {
    let buildOpt: string = "";
    if (this.currentApp) {
      if (this.currentApp.selectedBuildUseCase?.name) {
        // Handle Default cases
        switch (this.currentApp.selectedBuildUseCase.name) {
          case "release":
            // Default release use-case requires no options
            break;
          case "debug":
            // Check if this use-case name is defined in the manifest
            if ((this.currentApp.buildUseCases) && ("debug" in this.currentApp.buildUseCases)) {
              buildOpt = this.currentApp.selectedBuildUseCase.name;
            }
            else {
            // Default debug use-case
              buildOpt = "DEBUG=1";
            }
            break;
          default:
            // For other use cases, just use the name as the build option
            buildOpt = this.currentApp.selectedBuildUseCase.name;
        }
      }

      // Add build option for the selected variant
      if (this.currentApp.variants && this.currentApp.variants.selected) {
        buildOpt += " " + this.currentApp.variants.name + "=" + this.currentApp.variants.selected;
      }
    }

    // Retrieve the selected build mode, if any
    if (buildMode.selected === "Full") {
      buildOpt += " -B";
    }

    const exec = `docker exec -it ${
      this.containerName
    } bash -c 'export BOLOS_SDK=$(echo ${this.tgtSelector.getSelectedSDK()}) && make -C ${this.buildDir} -j ${buildOpt}'`;
    // Builds the app using the make command, inside the docker container.
    return exec;
  }

  private rustBuildExec(): string {
    const tgtBuildDir = this.tgtSelector.getTargetBuildDirName();
    const exec = `docker exec -it -u 0 ${this.containerName} bash -c 'cd ${
      this.buildDir
    } && cargo ledger build ${this.tgtSelector.getSelectedSDKModel()} -- -Zunstable-options --out-dir build/${tgtBuildDir}/bin && mv build/${tgtBuildDir}/bin/${
      this.packageName
    } build/${tgtBuildDir}/bin/app.elf && mv build/${tgtBuildDir}/bin/${
      this.packageName
    }.apdu build/${tgtBuildDir}/bin/app.apdu'`;
    // Builds the app in release mode using the make command, inside the docker container.
    return exec;
  }

  private appSubmodulesInitExec(): string {
    let exec = "";
    // Init app git submodules (if any).
    if (platform === "win32") {
      // Execute git command in cmd.exe on host, no docker
      exec = `cmd.exe /C git submodule update --init --recursive`;
    }
    else {
      // Execute git command in bash on host, no docker
      exec = `git submodule update --init --recursive`;
    }
    return exec;
  }

  private cCleanTargetExec(): string {
    // Cleans all app build files (for the selected device model).
    const exec = `docker exec -it ${this.containerName} bash -c 'export BOLOS_SDK=$(echo ${this.tgtSelector.getSelectedSDK()}) && make -C ${this.buildDir} clean_target'`;
    return exec;
  }

  private cCleanAllExec(): string {
    // Cleans all app build files (for all device models).
    const exec = `docker exec -it ${this.containerName} bash -c 'make -C ${this.buildDir} clean'`;
    return exec;
  }

  private rustCleanAllExec(): string {
    // Cleans all app build files (for all device models).
    const exec = `docker exec -it -u 0 ${this.containerName} bash -c 'cd ${this.buildDir} && cargo clean ; rm -rf build'`;
    return exec;
  }

  private openDefaultTerminalExec(): string {
    let userOpt: string = "";
    // Get settings to open terminal as root or not
    const conf = vscode.workspace.getConfiguration("ledgerDevTools");
    if (conf.get<boolean>("openContainerAsRoot") === true) {
      userOpt = `-u 0`;
    }
    const exec = `docker exec -it ${userOpt} ${
      this.containerName
    } bash -c 'export BOLOS_SDK=${this.tgtSelector.getSelectedSDK()} && bash'`;
    return exec;
  }

  private openComposeTerminalExec(): string {
    let userOpt: string = "";
    // Get settings to open terminal as root or not
    const conf = vscode.workspace.getConfiguration("ledgerDevTools");
    if (conf.get<boolean>("openContainerAsRoot") === true) {
      userOpt = `-u 0`;
    }
    const serviceName = this.treeProvider.getComposeServiceName();
    const exec = `docker compose run --rm --remove-orphans ${userOpt} ${serviceName}`;
    return exec;
  }

  private runInSpeculosExec(): string {
    // Runs the app on the speculos emulator for the selected device model, in the docker container.
    const exec = `docker exec -it ${
      this.containerName
    } bash -c 'speculos --model ${this.tgtSelector.getSelectedSpeculosModel()} build/${this.tgtSelector.getTargetBuildDirName()}/bin/app.elf'`;
    return exec;
  }

  private killSpeculosExec(): string {
    // Kills speculos emulator in the docker container.
    const exec = `docker exec -it ${this.containerName} bash -c 'pkill -f speculos'`;
    return exec;
  }

  private setUdevRulesLinux(tempFilePath: string) {
    // Dedicated function to set the udev rules on Linux
    const udevRulesFile = path.basename(udevRulesUrl);
    let setUdevRules: boolean = false;
    if (fs.existsSync(`${udevRulesFilePath}${udevRulesFile}`)) {
      const existingContent = fs.readFileSync(`${udevRulesFilePath}${udevRulesFile}`, "utf8");
      const newContent = fs.readFileSync(tempFilePath, "utf8");
      // Compare the existing content with the new content
      if (existingContent !== newContent) {
        setUdevRules = true;
      }
      else {
        console.log("Ledger: udev rules are up to date");
      }
    }
    else {
      console.log("Ledger: No rules detected");
      setUdevRules = true;
    }
    if (setUdevRules) {
      // Show the warning message
      const warningMessage = vscode.window.showWarningMessage(
        `Udev rules need to be updated for sideloading to be executed properly. Please enter your password in the terminal panel to update ${udevRulesFilePath}${udevRulesFile}.`,
      );

      // Add a marker to indicate when the command finishes
      const markerFilePath = path.join(os.tmpdir(), "udev_rules_update_done.marker");
      const execCommand = `sudo mv ${tempFilePath} ${udevRulesFilePath} && sudo udevadm control --reload-rules && sudo udevadm trigger && echo "done" > ${markerFilePath}`;

      // Check if any terminal exists
      let terminal: vscode.Terminal;
      if (vscode.window.terminals.length > 0) {
        // Reuse the first existing terminal
        terminal = vscode.window.terminals[0];
      }
      else {
        // Create a new terminal if none exist
        terminal = vscode.window.createTerminal("Update Udev Rules");
      }
      // Send the command (requesting the sudo password) to the terminal
      terminal.show();
      terminal.sendText(execCommand);

      // Simulate dismissing the warning message after a delay
      setTimeout(() => {
        warningMessage.then(() => {
          // No action needed, this ensures the message is dismissed
        });
      }, 10000);

      // Poll for the marker file and close the terminal when the command is done
      const checkInterval = setInterval(() => {
        if (fs.existsSync(markerFilePath)) {
          clearInterval(checkInterval); // Stop polling
          fs.unlinkSync(markerFilePath); // Clean up the marker file
          terminal.dispose(); // Close the terminal
        }
      }, 1000); // Check every second
    }
  }

  private appLoadRequirementsExec(): string {
    let exec = "";
    if (platform === "linux") {
      // Linux

      // If the Promise already exists, return it
      if (appLoadRequirementsPromise) {
        return "";
      }

      // Create a new Promise and cache it
      appLoadRequirementsPromise = new Promise((resolve, reject) => {
        if (udevRulesDone) {
          resolve(""); // If rules are already applied, resolve immediately
          return;
        }

        udevRulesDone = true;
        fetchUdevRules().then((tempFilePath) => {
          this.setUdevRulesLinux(tempFilePath); // Call the function to set udev rules
          resolve(""); // Resolve the Promise after execution
        }).catch((error) => {
          console.error("Error fetching udev rules:", error);
          reject(error); // Reject the Promise on error
        });
      });
    }
    else if (platform === "darwin") {
      // macOS
      // Checks that virtual env is installed, otherwise installs it. Then installs ledgerblue in a virtualenv.
      exec = `[ -d 'ledger' ] || python3 -m venv ledger && source ledger/bin/activate && python3 -m pip show ledgerblue >/dev/null 2>&1 || python3 -m pip install ledgerblue`;
    }
    else {
      // Assume windows
      // Checks that virtual env is installed, otherwise installs it. Then installs ledgerblue in a virtualenv.
      exec = `cmd.exe /C 'if not exist ledger (python -m pip install virtualenv && python -m venv ledger && call ledger\\Scripts\\activate.bat && python -m pip install ledgerblue)'`;
    }
    return exec;
  }

  private appLoadExec(): string {
    let exec = "";
    let keyconfig = "";
    const hostBuildDirPath = path.join(this.appFolderUri!.fsPath, this.buildDir);
    const tgtBuildDir = this.tgtSelector.getTargetBuildDirName();

    if (this.scpConfig === true) {
      const keyvarEnv: string = process.env.SCP_PRIVKEY as string;
      keyconfig = `--rootPrivateKey ${keyvarEnv}`;
    }

    if (platform === "linux") {
      // Linux
      // Executes make load in the container to load the app on a physical device.
      const binPath = path.join(this.buildDir, "build", tgtBuildDir, "bin");
      exec = `docker exec -it ${this.containerName} bash -c 'python3 -m ledgerblue.runScript ${keyconfig} --scp --fileName ${binPath}/app.apdu --elfFile ${binPath}/app.elf'`;
    }
    else if (platform === "darwin") {
      // macOS
      // Side loads the app APDU file using ledgerblue runScript.
      const binPath = path.join(hostBuildDirPath, "build", tgtBuildDir, "bin");
      exec = `source ledger/bin/activate && python3 -m ledgerblue.runScript ${keyconfig} --scp --fileName ${binPath}/app.apdu --elfFile ${binPath}/app.elf`;
    }
    else {
      // Assume windows
      // Side loads the app APDU file using ledgerblue runScript.
      const binPath = path.join(hostBuildDirPath, "build", tgtBuildDir, "bin").replace(/\\/g, "/");
      exec = `cmd.exe /C '.\\ledger\\Scripts\\activate.bat && python -m ledgerblue.runScript ${keyconfig} --scp --fileName ${binPath}/app.apdu --elfFile ${binPath}/app.elf'`;
    }
    return exec;
  }

  private appDeleteExec(): string {
    let exec = "";
    let keyconfig = "";

    if (this.scpConfig === true) {
      const keyvarEnv: string = process.env.SCP_PRIVKEY as string;
      keyconfig = `--rootPrivateKey ${keyvarEnv}`;
    }

    if (platform === "linux") {
      // Linux
      exec = `docker exec -it ${
        this.containerName
      } bash -c 'python3 -m ledgerblue.deleteApp ${keyconfig} --targetId ${this.tgtSelector.getSelectedTargetId()} --appName "${
        this.appName
      }"'`;
    }
    else if (platform === "darwin") {
      // macOS
      // Delete the app using ledgerblue runScript.
      exec = `source ledger/bin/activate && python3 -m ledgerblue.deleteApp ${keyconfig} --targetId ${this.tgtSelector.getSelectedTargetId()} --appName "${
        this.appName
      }"`;
    }
    else {
      // Assume windows
      exec = `cmd.exe /C '.\\ledger\\Scripts\\activate.bat && python -m ledgerblue.deleteApp ${keyconfig} --targetId ${this.tgtSelector.getSelectedTargetId()} --appName "${
        this.appName
      }"'`;
    }
    return exec;
  }

  private deviceOnboardingExec(): string {
    let exec = "";
    if (platform === "linux") {
      // Linux
      // Executes make load in the container to load the app on a physical device.
      exec = `docker exec -it ${
        this.containerName
      } bash -c 'export BOLOS_SDK=$(echo ${this.tgtSelector.getSelectedSDK()}) && python3 -m ledgerblue.hostOnboard --apdu --id 0 --pin ${
        this.onboardPin
      } --prefix \"\" --passphrase \"\" --words \"${this.onboardSeed}\"'`;
    }
    else if (platform === "darwin") {
      // macOS
      // Side loads the app APDU file using ledgerblue runScript.
      exec = `source ledger/bin/activate && python3 -m ledgerblue.hostOnboard --apdu --id 0 --pin ${this.onboardPin} --prefix \"\" --passphrase \"\" --words \"${this.onboardSeed}\"`;
    }
    else {
      // Assume windows
      // Side loads the app APDU file using ledgerblue runScript.
      exec = `cmd.exe /C '.\\ledger\\Scripts\\activate.bat && python -m ledgerblue.hostOnboard --apdu --id 0 --pin ${this.onboardPin} --prefix=\"\" --passphrase=\"\" --words \\\"${this.onboardSeed}\\\"'`;
    }
    return exec;
  }

  private getSelectedTests(): [string, string] {
    let execQuotes = `"`;
    if (platform === "win32") {
      execQuotes = `\\\"`;
    }
    let testsSelection = "";
    if (this.selectedTests) {
      testsSelection = "-k \'";
      // Create list with "or" separator for pytest selection (the last 'or' is not needed)
      for (let i = 0; i < this.selectedTests.length - 1; i++) {
        testsSelection += this.selectedTests[i] + " or ";
      }
      testsSelection += this.selectedTests[this.selectedTests.length - 1] + "\'";
    }
    return [testsSelection, execQuotes];
  }

  private functionalTestsExec(): string {
    let [testsSelection, execQuotes] = this.getSelectedTests();
    // Runs functional tests inside the docker container (with Qt display disabled).
    const exec = `docker exec -it ${this.containerName} bash -c ${execQuotes}pytest ${
      this.functionalTestsDir
    } --tb=short -v --device ${this.tgtSelector.getSelectedSpeculosModel()} ${testsSelection}${execQuotes}`;
    return exec;
  }

  private functionalTestsDisplayExec(): string {
    let [testsSelection, execQuotes] = this.getSelectedTests();
    // Runs functional tests inside the docker container (with Qt display enabled).
    const exec = `docker exec -it ${this.containerName} bash -c ${execQuotes}pytest ${
      this.functionalTestsDir
    } --tb=short -v --device ${this.tgtSelector.getSelectedSpeculosModel()} --display ${testsSelection}${execQuotes}`;
    return exec;
  }

  private functionalTestsGoldenRunExec(): string {
    let [testsSelection, execQuotes] = this.getSelectedTests();
    // Runs functional tests inside the docker container (with Qt display disabled and '--golden_run' option).
    const exec = `docker exec -it ${this.containerName} bash -c ${execQuotes}pytest ${
      this.functionalTestsDir
    } --tb=short -v --device ${this.tgtSelector.getSelectedSpeculosModel()} --golden_run ${testsSelection}${execQuotes}`;
    return exec;
  }

  private functionalTestsDisplayOnDeviceExec(): string {
    let [testsSelection, execQuotes] = this.getSelectedTests();
    // Runs functional tests inside the docker container (with Qt display enabled) on real device.
    const exec = `docker exec -it ${this.containerName} bash -c ${execQuotes}pytest ${
      this.functionalTestsDir
    } --tb=short -v --device ${this.tgtSelector.getSelectedSpeculosModel()} --display --backend ledgerwallet ${testsSelection}${execQuotes}`;
    return exec;
  }

  private runGuidelineEnforcer(): string {
    let userOpt: string = "";
    // Get settings to open terminal as root or not
    const conf = vscode.workspace.getConfiguration("ledgerDevTools");
    if (conf.get<boolean>("openContainerAsRoot") === true) {
      userOpt = `-u 0`;
    }
    let checkOpt: string = "";
    // Retrieve the selected check, if any
    if (checks.selected !== "All") {
      checkOpt = `-c ${checks.selected}`;
    }

    if (this.tgtSelector.getSelectedTarget() !== specialAllDevice) {
      if (checkOpt) {
        checkOpt += " ";
      }
      checkOpt += `-t ${this.tgtSelector.getSelectedSDKModel()}`;
    }
    // Runs checks inside the docker container.
    const exec = `docker exec -it ${userOpt} ${
      this.containerName
    } bash -c 'export BOLOS_SDK=${this.tgtSelector.getSelectedSDK()} && /opt/enforcer.sh ${checkOpt}'`;
    return exec;
  }

  private functionalTestsRequirementsExec(): string {
    // Use additionalReqsPerApp configuration to install additional dependencies for current app.
    let addReqsExec = "";
    if (this.additionalReqs) {
      addReqsExec = `${this.additionalReqs} &&`;
      console.log(`Ledger: Installing additional dependencies : ${addReqsExec}`);
    }
    const reqFilePath = this.functionalTestsDir + "/requirements.txt";
    const exec = `docker exec -it -u 0 ${this.containerName} bash -c '${addReqsExec} [ -f ${reqFilePath} ] && pip install --break-system-packages -r ${reqFilePath}'`;
    return exec;
  }

  private pushTasks(specs: TaskSpec[]): void {
    type DefineExecFunc = (item: TaskSpec) => [string, CustomTaskFunction | undefined];
    let defineExec: DefineExecFunc = (item: TaskSpec) => {
      let dependExec = "";
      let customFunc: CustomTaskFunction | undefined;
      let dependFunc: CustomTaskFunction | undefined;
      if (item.dependsOn) {
        let dependResult = item.dependsOn.call(this);
        // Check if the result is not empty
        if (dependResult) {
          if (typeof dependResult === "string") {
            dependExec = dependResult + " ; ";
          }
          else {
            dependExec = dependResult[0] + " ; ";
            dependFunc = dependResult[1];
          }
        }
      }
      const builderResult = item.builders[this.appLanguage]?.call(this) || item.builders["Both"]?.call(this) || "";
      let languageExec = "";
      if (typeof builderResult === "string") {
        languageExec = builderResult;
      }
      else {
        languageExec = builderResult[0];
        customFunc = builderResult[1];
      }

      let func: CustomTaskFunction | undefined;
      if (dependFunc || customFunc) {
        func = () => {
          if (dependFunc) {
            dependFunc();
          }
          if (customFunc) {
            customFunc();
          }
        };
      }
      const exec = dependExec + languageExec;
      return [exec, func];
    };

    specs.forEach((item) => {
      if (this.currentApp && item.state === "enabled") {
        console.log("Pushing task: " + item.name + " for app: " + this.currentApp.name);
        let exec = "";
        let customFunction: CustomTaskFunction | undefined;
        let defineResult = defineExec(item);
        exec = defineResult[0];
        customFunction = defineResult[1];
        // If the selected target is all and the task behavior is to be executed for all targets,
        // define the exec for all targets of the app
        if (this.tgtSelector.getSelectedTarget() === specialAllDevice && item.allSelectedBehavior === "executeForEveryTarget") {
          exec = "";
          this.tgtSelector.getTargetsArray().forEach((target) => {
            this.tgtSelector.setSelectedTarget(target);
            exec += defineExec(item)[0] + " ; ";
          });
          this.tgtSelector.setSelectedTarget(specialAllDevice);
          customFunction = undefined;
        }

        const task = new MyTask(
          { type: taskType, task: item.name },
          vscode.TaskScope.Workspace,
          item.name,
          taskType,
          new vscode.ShellExecution(exec),
          customFunction,
        );
        task.group = vscode.TaskGroup.Build;
        this.tasks.push(task);
      }
    });
  }

  private checkDisabledTasks(specs: TaskSpec[]): void {
    if (this.currentApp) {
      specs.forEach((item) => {
        // Reset state before checking
        if (item.builders[this.appLanguage] || item.builders["Both"]) {
          item.state = "enabled";
        }
        else {
          item.state = "unavailable";
        }

        // Check functional tests availability
        if (
          this.currentApp!.functionalTestsDir === undefined
          && item.group === "Functional Tests"
          && !item.name.includes("emulator")
        ) {
          item.state = "unavailable";
        }

        // Check docker-compose.yml availability
        if (item.name === "Open compose terminal") {
          const dockerComposeFile: string = "docker-compose.yml";
          const appDir = this.currentApp!.folderUri.fsPath;
          const searchPatterns = path.join(appDir, `**/${dockerComposeFile}`).replace(/\\/g, "/");
          const dockerCompose = fg.sync(searchPatterns, { onlyFiles: true, deep: 2 });
          // check if docker-compose.yml file is found
          if (dockerCompose.length > 0) {
            console.log("Ledger: docker-compose.yml found");
          }
          else {
            console.log("Ledger: docker-compose.yml not found");
            item.state = "unavailable";
          }
        }

        // Check target selection conditions
        if (this.tgtSelector.getSelectedTarget() === specialAllDevice) {
          if (item.allSelectedBehavior === "disable" && item.state === "enabled") {
            item.state = "disabled";
          }
        }
        else if (
          this.tgtSelector.getSelectedTarget() === "Nano X"
          && this.enableNanoxOps === false
          && item.group === "Device Operations"
        ) {
          item.state = "disabled";
        }
      });
    }
  }
}
