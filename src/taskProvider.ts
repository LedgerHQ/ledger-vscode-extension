"use strict";

import * as vscode from "vscode";
import { platform } from "node:process";
import { getSelectedSDK, getSelectedSpeculosModel, getSelectedTargetId } from "./targetSelector";
import { getSelectedApp, App } from "./appSelector";

export const taskType = "L";

// Udev rules (for Linux app loading requirements)
const udevRulesFile = "20-ledger.ledgerblue.rules";
const udevRules = `SUBSYSTEMS=="usb", ATTRS{idVendor}=="2c97", ATTRS{idProduct}=="0006|6000|6001|6002|6003|6004|6005|6006|6007|6008|6009|600a|600b|600c|600d|600e|600f|6010|6011|6012|6013|6014|6015|6016|6017|6018|6019|601a|601b|601c|601d|601e|601f", TAG+="uaccess", TAG+="udev-acl"`;

type ExecBuilder = () => string;

export interface TaskSpec {
  group?: string;
  name: string;
  toolTip?: string;
  builder: ExecBuilder;
  dependsOn?: ExecBuilder;
}

export class TaskProvider implements vscode.TaskProvider {
  private image: string;
  private onboardPin: string;
  private onboardSeed: string;
  private additionalDeps?: string;
  private tasks: vscode.Task[] = [];
  private currentApp?: App;
  private taskSpecs: TaskSpec[] = [
    {
      group: "Docker Container",
      name: "Update Container",
      builder: this.runDevToolsImageExec,
      toolTip: "Update docker container (pull image and restart container)",
    },
    { group: "Docker Container", name: "Open terminal", builder: this.openTerminalExec, toolTip: "Open terminal in container" },
    {
      group: "Build",
      name: "Build",
      builder: this.buildExec,
      toolTip: "Build app in release mode",
      dependsOn: this.appSubmodulesInitExec,
    },
    {
      group: "Build",
      name: "Build [debug]",
      builder: this.buildDebugExec,
      toolTip: "Build app in debug mode",
      dependsOn: this.appSubmodulesInitExec,
    },
    { group: "Build", name: "Clean build files", builder: this.cleanExec, toolTip: "Clean app build files" },
    {
      group: "Functional Tests",
      name: "Run with Speculos",
      builder: this.runInSpeculosExec,
      toolTip: "Run app with Speculos emulator",
    },
    {
      group: "Functional Tests",
      name: "Kill Speculos",
      builder: this.killSpeculosExec,
      toolTip: "Kill Speculos emulator instance",
    },
    {
      group: "Functional Tests",
      name: "Run tests",
      builder: this.functionalTestsExec,
      dependsOn: this.functionalTestsRequirementsExec,
      toolTip: "Run Python functional tests (with Qt display disabled)",
    },
    {
      group: "Functional Tests",
      name: "Run tests (with display)",
      builder: this.functionalTestsDisplayExec,
      dependsOn: this.functionalTestsRequirementsExec,
      toolTip: "Run Python functional tests (with Qt display enabled)",
    },
    {
      group: "Functional Tests",
      name: "Run tests (with display) - on device",
      builder: this.functionalTestsDisplayOnDeviceExec,
      dependsOn: this.functionalTestsRequirementsExec,
      toolTip: "Run Python functional tests (with Qt display enabled) on real device",
    },
    {
      group: "Device Operations",
      name: "Load app on device",
      builder: this.appLoadExec,
      dependsOn: this.appLoadRequirementsExec,
      toolTip: "Load app on a physical device",
    },
    {
      group: "Device Operations",
      name: "Delete app from device",
      builder: this.appDeleteExec,
      dependsOn: this.appLoadRequirementsExec,
      toolTip: "Delete app from a physical device",
    },
    {
      group: "Device Operations",
      name: "Quick device onboarding",
      builder: this.deviceOnboardingExec,
      dependsOn: this.appLoadRequirementsExec,
      toolTip: "Onboard a physical device with a seed and PIN code",
    },
  ];

  private buildDir: string;
  private workspacePath: string;
  private containerName: string;
  private appName: string;

  constructor() {
    this.appName = "";
    this.containerName = "";
    this.workspacePath = "";
    this.buildDir = "";
    this.currentApp = getSelectedApp();
    const conf = vscode.workspace.getConfiguration("ledgerDevTools");
    this.image = conf.get<string>("dockerImage") || "";
    this.onboardPin = conf.get<string>("onboardingPin") || "";
    this.onboardSeed = conf.get<string>("onboardingSeed") || "";
    const allDeps = conf.get<Record<string, string>>("additionalDepsPerApp");
    if (this.currentApp && allDeps && allDeps[this.currentApp.appFolderName]) {
      this.additionalDeps = allDeps[this.currentApp.appFolderName];
    }
    this.generateTasks();
  }

  public generateTasks() {
    this.tasks = [];
    this.containerName = "";
    this.workspacePath = "";
    this.buildDir = "";
    const conf = vscode.workspace.getConfiguration("ledgerDevTools");
    this.image = conf.get<string>("dockerImage") || "";
    this.onboardPin = conf.get<string>("onboardingPin") || "";
    this.onboardSeed = conf.get<string>("onboardingSeed") || "";
    this.currentApp = getSelectedApp();
    if (this.currentApp) {
      const allDeps = conf.get<Record<string, string>>("additionalDepsPerApp");
      if (allDeps && allDeps[this.currentApp.appFolderName]) {
        this.additionalDeps = allDeps[this.currentApp.appFolderName];
      } else {
        this.additionalDeps = undefined;
      }
      this.appName = this.currentApp.appName;
      this.containerName = this.currentApp.containerName;
      this.buildDir = this.currentApp.buildDirPath;
      this.workspacePath = this.currentApp.appFolder.uri.path;
      this.pushAllTasks();
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
      vscode.tasks.executeTask(task);
    }
  }

  private runDevToolsImageExec(): string {
    let exec = "";

    if (this.currentApp) {
      // Checks if a container with the name  ${this.containerName} exists, and if it does, it is stopped and removed before a new container is created using the same name and other specified configuration parameters
      if (platform === "linux") {
        // Linux
        exec = `docker ps -a --format '{{.Names}}' | grep -q  ${this.containerName} && (docker container stop  ${this.containerName} && docker container rm  ${this.containerName}) ; docker pull ${this.image} && docker run --user $(id -u):$(id -g) --privileged -e DISPLAY=$DISPLAY -v '/dev/bus/usb:/dev/bus/usb' -v '/tmp/.X11-unix:/tmp/.X11-unix' -v '${this.workspacePath}:/app' -t -d --name  ${this.containerName} ${this.image}`;
      } else if (platform === "darwin") {
        // macOS
        exec = `xhost + ; docker ps -a --format '{{.Names}}' | grep -q  ${this.containerName} && (docker container stop  ${this.containerName} && docker container rm  ${this.containerName}) ; docker pull ${this.image} && docker run --user $(id -u):$(id -g) --privileged -e DISPLAY='host.docker.internal:0' -v '/tmp/.X11-unix:/tmp/.X11-unix' -v '${this.workspacePath}:/app' -t -d --name  ${this.containerName} ${this.image}`;
      } else {
        // Assume windows
        const winWorkspacePath = this.workspacePath.substring(1); // Remove first '/' from windows workspace path URI. Otherwise it is not valid.
        exec = `if (docker ps -a --format '{{.Names}}' | Select-String -Quiet  ${this.containerName}) { docker container stop  ${this.containerName}; docker container rm  ${this.containerName} }; docker pull ${this.image}; docker run --privileged -e DISPLAY='host.docker.internal:0' -v '${winWorkspacePath}:/app' -t -d --name  ${this.containerName} ${this.image}`;
      }
    }

    return exec;
  }

  private buildDebugExec(): string {
    // Builds the app with debug mode enabled using the make command, inside the docker container.
    const exec = `docker exec -it  ${
      this.containerName
    } bash -c 'export BOLOS_SDK=$(echo ${getSelectedSDK()}) && make -j DEBUG=1'`;
    return exec;
  }

  private buildExec(): string {
    const exec = `docker exec -it  ${this.containerName} bash -c 'export BOLOS_SDK=$(echo ${getSelectedSDK()}) && make -j'`;
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

  private cleanExec(): string {
    // Cleans all app build files (for all device models).
    const exec = `docker exec -it  ${this.containerName} bash -c 'make clean'`;
    return exec;
  }

  private openTerminalExec(): string {
    const exec = `docker exec -it -u 0 ${this.containerName} bash`;
    return exec;
  }

  private runInSpeculosExec(): string {
    // Runs the app on the speculos emulator for the selected device model, in the docker container.
    const exec = `docker exec -it  ${
      this.containerName
    } bash -c 'speculos --model ${getSelectedSpeculosModel()} build/${getSelectedSpeculosModel()}/bin/app.elf'`;
    return exec;
  }

  private killSpeculosExec(): string {
    // Kills speculos emulator in the docker container.
    const exec = `docker exec -it  ${this.containerName} bash -c 'pkill -f speculos'`;
    return exec;
  }

  private appLoadRequirementsExec(): string {
    let exec = "";
    if (platform === "linux") {
      // Linux
      // Copies the ledger udev rule file to the /etc/udev/rules.d/ directory if it does not exist, then reloads the rules and triggers udev.
      exec = `if [ ! -f '/etc/udev/rules.d/${udevRulesFile}' ]; then echo '${udevRules}' > ${udevRulesFile} && sudo mv ${udevRulesFile} /etc/udev/rules.d/ && sudo udevadm control --reload-rules && sudo udevadm trigger; fi`;
    } else if (platform === "darwin") {
      // macOS
      // Checks that virtual env is installed, otherwise installs it. Then installs ledgerblue in a virtualenv.
      exec = `[ -n '$VIRTUAL_ENV' ] || if ! python3 -m virtualenv --version >/dev/null 2>&1; then python3 -m pip install virtualenv; fi && [ -d 'ledger' ] || python3 -m virtualenv ledger && source ledger/bin/activate && python3 -m pip show ledgerblue >/dev/null 2>&1 || python3 -m pip install ledgerblue`;
    } else {
      // Assume windows
      // Checks that virtual env is installed, otherwise installs it. Then installs ledgerblue in a virtualenv.
      exec = `cmd.exe /C 'if not exist ledger (python -m pip install virtualenv && python -m venv ledger && call ledger\\Scripts\\activate.bat && python -m pip install ledgerblue)'`;
    }
    return exec;
  }

  private appLoadExec(): string {
    let exec = "";
    if (platform === "linux") {
      // Linux
      // Executes make load in the container to load the app on a physical device.
      exec = `docker exec -it  ${this.containerName} bash -c 'export BOLOS_SDK=$(echo ${getSelectedSDK()}) && make load'`;
    } else if (platform === "darwin") {
      // macOS
      // Side loads the app APDU file using ledgerblue runScript.
      exec = `source ledger/bin/activate && python3 -m ledgerblue.runScript --scp --fileName ${this.buildDir}/bin/app.apdu --elfFile ${this.buildDir}/bin/app.elf`;
    } else {
      // Assume windows
      // Side loads the app APDU file using ledgerblue runScript.
      exec = `cmd.exe /C '.\\ledger\\Scripts\\activate.bat && python -m ledgerblue.runScript --scp --fileName ${this.buildDir}/bin/app.apdu --elfFile ${this.buildDir}/bin/app.elf'`;
    }
    return exec;
  }

  private appDeleteExec(): string {
    let exec = "";
    if (platform === "linux") {
      // Linux
      exec = `docker exec -it  ${this.containerName} bash -c 'export BOLOS_SDK=$(echo ${getSelectedSDK()}) && make delete'`;
    } else if (platform === "darwin") {
      // macOS
      // Delete the app using ledgerblue runScript.
      exec = `source ledger/bin/activate && python3 -m ledgerblue.deleteApp --targetId ${getSelectedTargetId()} --appName ${
        this.appName
      }`;
    } else {
      // Assume windows
      exec = `cmd.exe /C '.\\ledger\\Scripts\\activate.bat && python -m ledgerblue.deleteApp --targetId ${getSelectedTargetId()} --appName ${
        this.appName
      }'`;
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
      } bash -c 'export BOLOS_SDK=$(echo ${getSelectedSDK()}) && python3 -m ledgerblue.hostOnboard --apdu --id 0 --pin ${
        this.onboardPin
      } --prefix \"\" --passphrase \"\" --words \"${this.onboardSeed}\"'`;
    } else if (platform === "darwin") {
      // macOS
      // Side loads the app APDU file using ledgerblue runScript.
      exec = `source ledger/bin/activate && python3 -m ledgerblue.hostOnboard --apdu --id 0 --pin ${this.onboardPin} --prefix \"\" --passphrase \"\" --words \"${this.onboardSeed}\"`;
    } else {
      // Assume windows
      // Side loads the app APDU file using ledgerblue runScript.
      exec = `cmd.exe /C '.\\ledger\\Scripts\\activate.bat && python -m ledgerblue.hostOnboard --apdu --id 0 --pin ${this.onboardPin} --prefix \"\" --passphrase \"\" --words \"${this.onboardSeed}\"'`;
    }
    return exec;
  }

  private functionalTestsExec(): string {
    // Runs functional tests inside the docker container (with Qt display disabled).
    const exec = `docker exec -it  ${
      this.containerName
    } bash -c 'pytest tests/ --tb=short -v --device ${getSelectedSpeculosModel()}'`;
    return exec;
  }

  private functionalTestsDisplayExec(): string {
    // Runs functional tests inside the docker container (with Qt display enabled).
    const exec = `docker exec -it  ${
      this.containerName
    } bash -c 'pytest tests/ --tb=short -v --device ${getSelectedSpeculosModel()} --display'`;
    return exec;
  }

  private functionalTestsDisplayOnDeviceExec(): string {
    // Runs functional tests inside the docker container (with Qt display enabled) on real device.
    const exec = `docker exec -it ${
      this.containerName
    } bash -c 'pytest tests/ --tb=short -v --device ${getSelectedSpeculosModel()} --display --backend ledgerwallet'`;
    return exec;
  }

  private functionalTestsRequirementsExec(): string {
    // Use additionalDepsPerApp configuration to install additional dependencies for current app.
    let addDepsExec = "";
    if (this.additionalDeps) {
      addDepsExec = `${this.additionalDeps} &&`;
      console.log(`Ledger: Installing additional dependencies : ${addDepsExec}`);
    }
    const exec = `docker exec -it -u 0  ${this.containerName} bash -c '${addDepsExec} pip install -r tests/requirements.txt'`;
    return exec;
  }

  getTaskSpecs(): TaskSpec[] {
    return this.taskSpecs;
  }

  private pushAllTasks(): void {
    this.taskSpecs.forEach((item) => {
      if (this.currentApp) {
        let dependExec = "";
        if (item.dependsOn) {
          dependExec = item.dependsOn.call(this) + ";";
        }
        const exec = dependExec + item.builder.call(this);
        const task = new vscode.Task(
          { type: taskType, task: item.name },
          this.currentApp.appFolder,
          item.name,
          taskType,
          new vscode.ShellExecution(exec)
        );
        task.group = vscode.TaskGroup.Build;
        this.tasks.push(task);
      }
    });
  }
}
