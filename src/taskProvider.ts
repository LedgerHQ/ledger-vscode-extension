"use strict";

import * as vscode from "vscode";
import { platform } from "node:process";
import { getSelectedSDK, getSelectedSpeculosModel } from "./targetSelector";

// Access the configuration object
const conf = vscode.workspace.getConfiguration("ledgerDevTools");

// Access individual settings
const buildDir = conf.get<string>("buildDirRelativePath");
const image = conf.get<string>("dockerImage");
const workspaceName = `${vscode.workspace.workspaceFolders![0].name}`;
const workspacePath = `${vscode.workspace.workspaceFolders![0].uri.path}`;
const containerName = `${workspaceName}-container`;

// Udev rules (for Linux app loading requirements)
const udevRulesFile = "20-ledger.ledgerblue.rules";
const udevRules = `SUBSYSTEMS=="usb", ATTRS{idVendor}=="2c97", ATTRS{idProduct}=="0006|6000|6001|6002|6003|6004|6005|6006|6007|6008|6009|600a|600b|600c|600d|600e|600f|6010|6011|6012|6013|6014|6015|6016|6017|6018|6019|601a|601b|601c|601d|601e|601f", TAG+="uaccess", TAG+="udev-acl"`;

export class TaskProvider implements vscode.TaskProvider {
  // Referenced in package.json::taskDefinitions
  static taskType = "ledger";

  private tasks: vscode.Task[] = [];

  constructor() {
    this.generateTasks();
  }

  public generateTasks() {
    const wsFolders = vscode.workspace.workspaceFolders;
    if (!wsFolders || !wsFolders[0]) {
      vscode.window.showErrorMessage("no workspace open...");
      return;
    }

    this.tasks = [];

    const runDevTools = runDevToolsImageTask(wsFolders[0]);
    runDevTools.group = vscode.TaskGroup.Build;
    this.tasks.push(runDevTools);

    const build = buildTask(wsFolders[0]);
    build.group = vscode.TaskGroup.Build;
    this.tasks.push(build);

    const buildDebug = buildDebugTask(wsFolders[0]);
    buildDebug.group = vscode.TaskGroup.Build;
    this.tasks.push(buildDebug);

    const clean = cleanTask(wsFolders[0]);
    clean.group = vscode.TaskGroup.Build;
    this.tasks.push(clean);

    const terminal = openTerminalTask(wsFolders[0]);
    terminal.group = vscode.TaskGroup.Build;
    this.tasks.push(terminal);

    const speculos = runInSpeculosTask(wsFolders[0]);
    speculos.group = vscode.TaskGroup.Build;
    this.tasks.push(speculos);

    const killSpeculos = killSpeculosTask(wsFolders[0]);
    killSpeculos.group = vscode.TaskGroup.Build;
    this.tasks.push(killSpeculos);

    const loadRequirements = installLoadRequirementsTask(wsFolders[0]);
    loadRequirements.group = vscode.TaskGroup.Build;
    this.tasks.push(loadRequirements);

    const load = appLoadTask(wsFolders[0]);
    load.group = vscode.TaskGroup.Build;
    this.tasks.push(load);

    const tests = functionalTestsTask(wsFolders[0]);
    tests.group = vscode.TaskGroup.Build;
    this.tasks.push(tests);

    const testsDisplay = functionalTestsDisplayTask(wsFolders[0]);
    testsDisplay.group = vscode.TaskGroup.Build;
    this.tasks.push(testsDisplay);

    const testsRequirements = functionalTestsRequirementsTask(wsFolders[0]);
    testsRequirements.group = vscode.TaskGroup.Build;
    this.tasks.push(testsRequirements);
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
}

function runDevToolsImageTask(ws: vscode.WorkspaceFolder): vscode.Task {
  let exec = "";
  // Checks if a container with the name ${containerName} exists, and if it does, it is stopped and removed before a new container is created using the same name and other specified configuration parameters
  if (platform === "linux") {
    // Linux
    exec = `docker ps -a --format '{{.Names}}' | grep -q ${containerName} && (docker container stop ${containerName} && docker container rm ${containerName}) ; docker pull ${image} && docker run --user $(id -u):$(id -g) --privileged -e DISPLAY=$DISPLAY -v '/dev/bus/usb:/dev/bus/usb' -v '/tmp/.X11-unix:/tmp/.X11-unix' -v '${workspacePath}:/app' -t -d --name ${containerName} ${image}`;
  } else if (platform === "darwin") {
    // macOS
    exec = `xhost + ; docker ps -a --format '{{.Names}}' | grep -q ${containerName} && (docker container stop ${containerName} && docker container rm ${containerName}) ; docker pull ${image} && docker run --user $(id -u):$(id -g) --privileged -e DISPLAY='host.docker.internal:0' -v '/tmp/.X11-unix:/tmp/.X11-unix' -v '${workspacePath}:/app' -t -d --name ${containerName} ${image}`;
  } else {
    // Assume windows
    const winWorkspacePath = workspacePath.substring(1); // Remove first '/' from windows workspace path URI. Otherwise it is not valid.
    exec = `if (docker ps -a --format '{{.Names}}' | Select-String -Quiet ${containerName}) { docker container stop ${containerName}; docker container rm ${containerName} }; docker pull ${image}; docker run --privileged -e DISPLAY='host.docker.internal:0' -v '${winWorkspacePath}:/app' -t -d --name ${containerName} ${image}`;
  }

  return new vscode.Task(
    { type: TaskProvider.taskType, task: "Run dev-tools image" },
    ws,
    "Run dev-tools image",
    TaskProvider.taskType,
    new vscode.ShellExecution(exec)
  );
}

function buildTask(ws: vscode.WorkspaceFolder): vscode.Task {
  const exec = `docker exec -it ${containerName} bash -c 'export BOLOS_SDK=$(echo ${getSelectedSDK()}) && make -j'`;
  // Builds the app in release mode using the make command, inside the docker container.
  return new vscode.Task(
    { type: TaskProvider.taskType, task: "Build app", dependsOn: "Clean" },
    ws,
    "Build app",
    TaskProvider.taskType,
    new vscode.ShellExecution(exec)
  );
}

function buildDebugTask(ws: vscode.WorkspaceFolder): vscode.Task {
  // Builds the app with debug mode enabled using the make command, inside the docker container.
  const exec = `docker exec -it ${containerName} bash -c 'export BOLOS_SDK=$(echo ${getSelectedSDK()}) && make -j DEBUG=1'`;
  return new vscode.Task(
    { type: TaskProvider.taskType, task: "Build app [debug]" },
    ws,
    "Build app [debug]",
    TaskProvider.taskType,
    new vscode.ShellExecution(exec)
  );
}

function cleanTask(ws: vscode.WorkspaceFolder): vscode.Task {
  // Cleans all app build files (for all device models).
  const exec = `docker exec -it ${containerName} bash -c 'make clean'`;
  return new vscode.Task(
    { type: TaskProvider.taskType, task: "Clean" },
    ws,
    "Clean build files",
    TaskProvider.taskType,
    new vscode.ShellExecution(exec)
  );
}

function openTerminalTask(ws: vscode.WorkspaceFolder): vscode.Task {
  const exec = `docker exec -it ${containerName} bash`;
  return new vscode.Task(
    { type: TaskProvider.taskType, task: "Terminal" },
    ws,
    "Open dev-tools container terminal",
    TaskProvider.taskType,
    new vscode.ShellExecution(exec)
  );
}

function runInSpeculosTask(ws: vscode.WorkspaceFolder): vscode.Task {
  // Runs the app on the speculos emulator for the selected device model, in the docker container.
  const exec = `docker exec -it ${containerName} bash -c 'speculos --model ${getSelectedSpeculosModel()} build/${getSelectedSpeculosModel()}/bin/app.elf'`;
  return new vscode.Task(
    { type: TaskProvider.taskType, task: "Speculos" },
    ws,
    "Test app with Speculos",
    TaskProvider.taskType,
    new vscode.ShellExecution(exec)
  );
}

function killSpeculosTask(ws: vscode.WorkspaceFolder): vscode.Task {
  // Kills speculos emulator in the docker container.
  const exec = `docker exec -it ${containerName} bash -c 'pkill -f speculos'`;
  return new vscode.Task(
    { type: TaskProvider.taskType, task: "Speculos" },
    ws,
    "Kill Speculos",
    TaskProvider.taskType,
    new vscode.ShellExecution(exec)
  );
}

function getAppLoadRequirementsExec(): string {
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

function installLoadRequirementsTask(ws: vscode.WorkspaceFolder): vscode.Task {
  const exec = getAppLoadRequirementsExec();
  return new vscode.Task(
    { type: TaskProvider.taskType, task: "Load Requirements" },
    ws,
    "Install app loading requirements",
    TaskProvider.taskType,
    new vscode.ShellExecution(exec)
  );
}

function appLoadTask(ws: vscode.WorkspaceFolder): vscode.Task {
  let exec = getAppLoadRequirementsExec() + ";";
  if (platform === "linux") {
    // Linux
    // Executes make load in the container to load the app on a physical device.
    exec += `docker exec -it ${containerName} bash -c 'export BOLOS_SDK=$(echo ${getSelectedSDK()}) && make load'`;
  } else if (platform === "darwin") {
    // macOS
    // Side loads the app APDU file using ledgerblue runScript.
    exec += `source ledger/bin/activate && python3 -m ledgerblue.runScript --scp --fileName ${buildDir}/bin/app.apdu --elfFile ${buildDir}/bin/app.elf`;
  } else {
    // Assume windows
    // Side loads the app APDU file using ledgerblue runScript.
    exec += `cmd.exe /C '.\\ledger\\Scripts\\activate.bat && python -m ledgerblue.runScript --scp --fileName ${buildDir}/bin/app.apdu --elfFile ${buildDir}/bin/app.elf'`;
  }

  return new vscode.Task(
    { type: TaskProvider.taskType, task: "Load" },
    ws,
    "Load app on device",
    TaskProvider.taskType,
    new vscode.ShellExecution(exec)
  );
}

function functionalTestsTask(ws: vscode.WorkspaceFolder): vscode.Task {
  // Runs functional tests inside the docker container (with Qt display disabled).
  const exec = `docker exec -it ${containerName} bash -c 'pytest tests/ --tb=short -v --device ${getSelectedSpeculosModel()}'`;
  return new vscode.Task(
    { type: TaskProvider.taskType, task: "Tests" },
    ws,
    "Run functional tests",
    TaskProvider.taskType,
    new vscode.ShellExecution(exec)
  );
}

function functionalTestsDisplayTask(ws: vscode.WorkspaceFolder): vscode.Task {
  // Runs functional tests inside the docker container (with Qt display enabled).
  const exec = `docker exec -it ${containerName} bash -c 'pytest tests/ --tb=short -v --device ${getSelectedSpeculosModel()} --display'`;
  return new vscode.Task(
    { type: TaskProvider.taskType, task: "Tests Display" },
    ws,
    "Run functional tests (with display)",
    TaskProvider.taskType,
    new vscode.ShellExecution(exec)
  );
}

function functionalTestsRequirementsTask(ws: vscode.WorkspaceFolder): vscode.Task {
  // Installs functional tests python requirements in the docker container.
  const exec = `docker exec -it -u 0 ${containerName} bash -c 'apk add gcc musl-dev python3-dev && pip install -r tests/requirements.txt'`;
  return new vscode.Task(
    { type: TaskProvider.taskType, task: "Tests Requirements" },
    ws,
    "Install tests requirements",
    TaskProvider.taskType,
    new vscode.ShellExecution(exec)
  );
}
