"use strict";

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { platform } from "node:process";
import { TargetSelector, specialAllDevice } from "./targetSelector";
import { getSelectedApp, App, AppLanguage } from "./appSelector";
import { TreeDataProvider } from "./treeView";

export const taskType = "L";

// Udev rules (for Linux app loading requirements)
const udevRulesFilePath = "/etc/udev/rules.d/";
const udevRulesFile = "20-ledger.ledgerblue.rules";
const udevRules = `SUBSYSTEMS=="usb", KERNEL=="hidraw*", ATTRS{idVendor}=="2c97", MODE="0666", ATTRS{idProduct}=="0006|6000|6001|6002|6003|6004|6005|6006|6007|6008|6009|600a|600b|600c|600d|600e|600f|6010|6011|6012|6013|6014|6015|6016|6017|6018|6019|601a|601b|601c|601d|601e|601f", TAG+="uaccess", TAG+="udev-acl"`;

type CustomTaskFunction = () => void;
type ExecBuilder = () => string | [string, CustomTaskFunction];
type TaskTargetLanguage = AppLanguage | "Both";
type BuilderForLanguage = Partial<Record<TaskTargetLanguage, ExecBuilder>>;

type TaskState = "enabled" | "disabled" | "unavailable";
type BehaviorWhenAllTargetsSelected = "enable" | "disable" | "executeForEveryTarget";

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
    customFunction: CustomTaskFunction | undefined
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
      name: "Open terminal",
      builders: { ["Both"]: this.openTerminalExec },
      toolTip: "Open terminal in container",
      state: "enabled",
      allSelectedBehavior: "enable",
    },
    {
      group: "Build",
      name: "Build incremental",
      builders: { ["C"]: this.cBuildExec, ["Rust"]: this.rustBuildExec },
      toolTip: "Build app (incremental mode)",
      dependsOn: this.appSubmodulesInitExec,
      state: "enabled",
      allSelectedBehavior: "executeForEveryTarget",
    },
    {
      group: "Build",
      name: "Build full",
      builders: { ["C"]: this.cBuildFullExec },
      toolTip: "Build app (full rebuild)",
      dependsOn: this.appSubmodulesInitExec,
      state: "enabled",
      allSelectedBehavior: "executeForEveryTarget",
    },
    {
      group: "Build",
      name: "Clean the build files",
      builders: { ["C"]: this.cCleanExec, ["Rust"]: this.rustCleanExec },
      toolTip: "Clean the app build files",
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
  ];
  private keyvarEnv: string = process.env.SCP_PRIVKEY as string;

  constructor(treeProvider: TreeDataProvider, targetSelector: TargetSelector) {
    this.treeProvider = treeProvider;
    this.tgtSelector = targetSelector;
    this.appLanguage = "C";
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
    this.generateTasks();
  }

  public generateTasks() {
    this.tasks = [];
    this.containerName = "";
    this.workspacePath = "";
    this.buildDir = "";
    this.functionalTestsDir = undefined;
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
      } else {
        this.additionalReqs = undefined;
      }
      this.functionalTestsDir = this.currentApp.functionalTestsDir;
      this.appName = this.currentApp.name;
      this.appLanguage = this.currentApp.language;
      this.containerName = this.currentApp.containerName;
      this.appFolderUri = this.currentApp.folderUri;
      this.buildDir = this.currentApp.buildDirPath;
      this.workspacePath = this.currentApp.folderUri.path;
      this.packageName = this.currentApp.packageName;
      this.checkDisabledTasks();
      this.pushAllTasks();
      this.treeProvider.addAllTasksToTree(this.taskSpecs);
    }
  }

  public async provideTasks(): Promise<vscode.Task[]> {
    this.generateTasks();
    return this.tasks;
  }

  public async resolveTask(task: vscode.Task): Promise<vscode.Task | undefined> {
    return undefined;
  }

  public getTaskByName(taskName: string) {
    return this.tasks.find((task) => task.name === taskName);
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

    const conf = vscode.workspace.getConfiguration("ledgerDevTools");
    const dockerRunArgs = conf.get<string>("dockerRunArgs");

    if (this.currentApp) {
      // Checks if a container with the name  ${this.containerName} exists, and if it does, it is stopped and removed before a new container is created using the same name and other specified configuration parameters
      if (platform === "linux") {
        // Linux
        exec = `docker ps -a --format '{{.Names}}' | grep -q  ${this.containerName} && (docker container stop  ${this.containerName} && docker container rm  ${this.containerName}) ; docker pull ${this.image} && docker run --user $(id -u):$(id -g) --privileged -e DISPLAY=$DISPLAY -v '/dev/bus/usb:/dev/bus/usb' -v '/tmp/.X11-unix:/tmp/.X11-unix' -v '${this.workspacePath}:/app' ${dockerRunArgs} -t -d --name  ${this.containerName} ${this.image}`;
      } else if (platform === "darwin") {
        // macOS
        exec = `xhost + ; docker ps -a --format '{{.Names}}' | grep -q  ${this.containerName} && (docker container stop  ${this.containerName} && docker container rm  ${this.containerName}) ; docker pull ${this.image} && docker run --user $(id -u):$(id -g) --privileged -e DISPLAY='host.docker.internal:0' -v '/tmp/.X11-unix:/tmp/.X11-unix' -v '${this.workspacePath}:/app' ${dockerRunArgs} -t -d --name  ${this.containerName} ${this.image}`;
      } else {
        // Assume windows
        const winWorkspacePath = this.workspacePath.substring(1); // Remove first '/' from windows workspace path URI. Otherwise it is not valid.
        exec = `if (docker ps -a --format '{{.Names}}' | Select-String -Quiet  ${this.containerName}) { docker container stop  ${this.containerName}; docker container rm  ${this.containerName} }; docker pull ${this.image}; docker run --privileged -e DISPLAY='host.docker.internal:0' -v '${winWorkspacePath}:/app' ${dockerRunArgs} -t -d --name  ${this.containerName} ${this.image}`;
      }
    }

    return exec;
  }

  private cBuildExec(): string {
    let buildOpt: string = "";
    if (this.currentApp) {
        if (this.currentApp.selectedBuildUseCase?.options) {
        // Add build option of the selected the useCase
        buildOpt = this.currentApp.selectedBuildUseCase?.options;
      }

      // Add build option for the selected variant
      if (this.currentApp.variants && this.currentApp.variants.selected) {
        buildOpt += " " + this.currentApp.variants.name + "=" + this.currentApp.variants.selected;
      }
    }


    const exec = `docker exec -it  ${
      this.containerName
    } bash -c 'export BOLOS_SDK=$(echo ${this.tgtSelector.getSelectedSDK()}) && make -C ${this.buildDir} -j ${buildOpt}'`;
    // Builds the app using the make command, inside the docker container.
    return exec;
  }

  private cBuildFullExec(): string {
    let buildOpt: string = "";
    if (this.currentApp) {
        if (this.currentApp.selectedBuildUseCase?.options) {
        // Add build option of the selected the useCase
        buildOpt = this.currentApp.selectedBuildUseCase?.options;
      }

      // Add build option for the selected variant
      if (this.currentApp.variants && this.currentApp.variants.selected) {
        buildOpt += " " + this.currentApp.variants.name + "=" + this.currentApp.variants.selected;
      }
    }

    const exec = `docker exec -it  ${
      this.containerName
    } bash -c 'export BOLOS_SDK=$(echo ${this.tgtSelector.getSelectedSDK()}) && make -C ${this.buildDir} -B -j ${buildOpt}'`;
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
    } else {
      // Execute git command in bash on host, no docker
      exec = `git submodule update --init --recursive`;
    }
    return exec;
  }

  private cCleanExec(): string {
    // Cleans all app build files (for all device models).
    const exec = `docker exec -it  ${this.containerName} bash -c 'make -C ${this.buildDir} clean'`;
    return exec;
  }

  private rustCleanExec(): string {
    // Cleans all app build files (for all device models).
    const exec = `docker exec -it -u 0 ${this.containerName} bash -c 'cd ${this.buildDir} && cargo clean ; rm -rf build'`;
    return exec;
  }

  private openTerminalExec(): string {
    // Get the Selected target SDK to export inside the container
    let sdk: string = this.tgtSelector.getSelectedSDK();
    const exec = `docker exec -it -u 0 -e "BOLOS_SDK=${sdk}" ${this.containerName} bash`;
    return exec;
  }

  private runInSpeculosExec(): string {
    // Runs the app on the speculos emulator for the selected device model, in the docker container.
    const exec = `docker exec -it  ${
      this.containerName
    } bash -c 'speculos --model ${this.tgtSelector.getSelectedSpeculosModel()} build/${this.tgtSelector.getTargetBuildDirName()}/bin/app.elf'`;
    return exec;
  }

  private killSpeculosExec(): string {
    // Kills speculos emulator in the docker container.
    const exec = `docker exec -it  ${this.containerName} bash -c 'pkill -f speculos'`;
    return exec;
  }

  private appLoadRequirementsExec(): string | [string, CustomTaskFunction] {
    let exec = "";
    if (platform === "linux") {
      // Linux
      // Copies the ledger udev rule file to the /etc/udev/rules.d/ directory if it does not exist or if the content needs to be updated, then reloads the rules and triggers udev.
      exec = `if [ ! -f '${udevRulesFilePath}${udevRulesFile}' ] || ! cmp -s '${udevRulesFilePath}${udevRulesFile}' <(echo -n '${udevRules}') ; then echo -n '${udevRules}' > ${udevRulesFile} && sudo mv ${udevRulesFile} ${udevRulesFilePath} && sudo udevadm control --reload-rules && sudo udevadm trigger; fi`;
      const customFunction = () => {
        let showSudoMsg: boolean = false;
        if (fs.existsSync(`${udevRulesFilePath}${udevRulesFile}`)) {
          const filesContent = fs.readFileSync(`${udevRulesFilePath}${udevRulesFile}`, "utf8");
          if (filesContent !== udevRules) {
            showSudoMsg = true;
          }
        } else {
          showSudoMsg = true;
        }
        if (showSudoMsg) {
          vscode.window.showWarningMessage(
            `Udev rules need to be updated for sideloading to be executed properly. Please enter your password in the terminal panel to update ${udevRulesFilePath}${udevRulesFile}.`
          );
        }
      };
      return [exec, customFunction];
    } else if (platform === "darwin") {
      // macOS
      // Checks that virtual env is installed, otherwise installs it. Then installs ledgerblue in a virtualenv.
      exec = `[ -d 'ledger' ] || python3 -m venv ledger && source ledger/bin/activate && python3 -m pip show ledgerblue >/dev/null 2>&1 || python3 -m pip install ledgerblue`;
    } else {
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
      keyconfig = `--rootPrivateKey ${this.keyvarEnv}`;
    }

    if (platform === "linux") {
      // Linux
      // Executes make load in the container to load the app on a physical device.
      const binPath = path.join(this.buildDir, "build", tgtBuildDir, "bin");
      exec = `docker exec -it ${this.containerName} bash -c 'python3 -m ledgerblue.runScript ${keyconfig} --scp --fileName ${binPath}/app.apdu --elfFile ${binPath}/app.elf'`;
    } else if (platform === "darwin") {
      // macOS
      // Side loads the app APDU file using ledgerblue runScript.
      const binPath = path.join(hostBuildDirPath, "build", tgtBuildDir, "bin");
      exec = `source ledger/bin/activate && python3 -m ledgerblue.runScript ${keyconfig} --scp --fileName ${binPath}/app.apdu --elfFile ${binPath}/app.elf`;
    } else {
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
      keyconfig = `--rootPrivateKey ${this.keyvarEnv}`;
    }

    if (platform === "linux") {
      // Linux
      exec = `docker exec -it ${
        this.containerName
      } bash -c 'python3 -m ledgerblue.deleteApp ${keyconfig} --targetId ${this.tgtSelector.getSelectedTargetId()} --appName "${
        this.appName
      }"'`;
    } else if (platform === "darwin") {
      // macOS
      // Delete the app using ledgerblue runScript.
      exec = `source ledger/bin/activate && python3 -m ledgerblue.deleteApp ${keyconfig} --targetId ${this.tgtSelector.getSelectedTargetId()} --appName "${
        this.appName
      }"`;
    } else {
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
    } else if (platform === "darwin") {
      // macOS
      // Side loads the app APDU file using ledgerblue runScript.
      exec = `source ledger/bin/activate && python3 -m ledgerblue.hostOnboard --apdu --id 0 --pin ${this.onboardPin} --prefix \"\" --passphrase \"\" --words \"${this.onboardSeed}\"`;
    } else {
      // Assume windows
      // Side loads the app APDU file using ledgerblue runScript.
      exec = `cmd.exe /C '.\\ledger\\Scripts\\activate.bat && python -m ledgerblue.hostOnboard --apdu --id 0 --pin ${this.onboardPin} --prefix=\"\" --passphrase=\"\" --words \"${this.onboardSeed}\"'`;
    }
    return exec;
  }

  private functionalTestsExec(): string {
    // Runs functional tests inside the docker container (with Qt display disabled).
    const exec = `docker exec -it  ${this.containerName} bash -c 'pytest ${
      this.functionalTestsDir
    } --tb=short -v --device ${this.tgtSelector.getSelectedSpeculosModel()}'`;
    return exec;
  }

  private functionalTestsDisplayExec(): string {
    // Runs functional tests inside the docker container (with Qt display enabled).
    const exec = `docker exec -it  ${this.containerName} bash -c 'pytest ${
      this.functionalTestsDir
    } --tb=short -v --device ${this.tgtSelector.getSelectedSpeculosModel()} --display'`;
    return exec;
  }

  private functionalTestsGoldenRunExec(): string {
    // Runs functional tests inside the docker container (with Qt display disabled and '--golden_run' option).
    const exec = `docker exec -it  ${this.containerName} bash -c 'pytest ${
      this.functionalTestsDir
    } --tb=short -v --device ${this.tgtSelector.getSelectedSpeculosModel()} --golden_run'`;
    return exec;
  }

  private functionalTestsDisplayOnDeviceExec(): string {
    // Runs functional tests inside the docker container (with Qt display enabled) on real device.
    const exec = `docker exec -it ${this.containerName} bash -c 'pytest ${
      this.functionalTestsDir
    } --tb=short -v --device ${this.tgtSelector.getSelectedSpeculosModel()} --display --backend ledgerwallet'`;
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
    const exec = `docker exec -it -u 0  ${this.containerName} bash -c '${addReqsExec} [ -f ${reqFilePath} ] && pip install -r ${reqFilePath}'`;
    return exec;
  }

  private pushAllTasks(): void {
    type DefineExecFunc = (item: TaskSpec) => [string, CustomTaskFunction | undefined];
    let defineExec: DefineExecFunc = (item: TaskSpec) => {
      let dependExec = "";
      let customFunc: CustomTaskFunction | undefined;
      let dependFunc: CustomTaskFunction | undefined;
      if (item.dependsOn) {
        let dependResult = item.dependsOn.call(this);
        if (typeof dependResult === "string") {
          dependExec = dependResult + " ; ";
        } else {
          dependExec = dependResult[0] + " ; ";
          dependFunc = dependResult[1];
        }
      }
      const builderResult = item.builders[this.appLanguage]?.call(this) || item.builders["Both"]?.call(this) || "";
      let languageExec = "";
      if (typeof builderResult === "string") {
        languageExec = builderResult;
      } else {
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

    this.taskSpecs.forEach((item) => {
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
          customFunction
        );
        task.group = vscode.TaskGroup.Build;
        this.tasks.push(task);
      }
    });
  }

  private checkDisabledTasks(): void {
    if (this.currentApp) {
      // Enable tasks that have either a builder for the language of the app or a
      // builder for all languages ("Both").
      this.taskSpecs.forEach((item) => {
        if (item.builders[this.appLanguage] || item.builders["Both"]) {
          item.state = "enabled";
        } else {
          item.state = "unavailable";
        }
      });

      // If functional tests are not available for the app, disable all functional tests tasks
      if (this.currentApp.functionalTestsDir === undefined) {
        this.taskSpecs.forEach((item) => {
          if (item.group === "Functional Tests" && !item.name.includes("emulator")) {
            item.state = "unavailable";
          }
        });
      }

      // If selected target is all and the task behavior is to be disabled when all targets are selected, disable the task
      if (this.tgtSelector.getSelectedTarget() === specialAllDevice) {
        this.taskSpecs.forEach((item) => {
          if (item.allSelectedBehavior === "disable" && item.state === "enabled") {
            item.state = "disabled";
          }
        });
      } else if (this.tgtSelector.getSelectedTarget() === "Nano X" && this.enableNanoxOps === false) {
        this.taskSpecs.forEach((item) => {
          if (item.group === "Device Operations") {
            item.state = "disabled";
          }
        });
      }
    }
  }
}
