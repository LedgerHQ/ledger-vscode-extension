"use strict";

import * as vscode from "vscode";
import {
  TaskProvider,
  taskType,
  onCheckSelectedEvent,
  showChecks,
  onBuildModeSelectedEvent,
  toggleBuildMode,
} from "./taskProvider";
import { TreeDataProvider } from "./treeView";
import { TargetSelector } from "./targetSelector";
import { StatusBarManager } from "./statusBar";
import { ContainerManager, DevImageStatus } from "./containerManager";
import {
  showBuildUseCase,
  findAppsInWorkspace,
  getSelectedApp,
  setSelectedApp,
  getAppTestsList,
  onTestsSelectedEvent,
  onTestsListRefreshedEvent,
  setAppTestsPrerequisites,
  showTestUseCaseSelectorMenu,
  onTestUseCaseSelected,
  onUseCaseSelectedEvent,
  getAndBuildAppTestsDependencies,
  getSelectedBuidUseCase,
  onVariantSelectedEvent,
  showVariant,
  setSelectedAppByName,
  initializeAppSubmodulesIfNeeded,
} from "./appSelector";
import { Webview } from "./webview/webviewProvider";

let outputChannel: vscode.OutputChannel;
const appDetectionFiles = ["Cargo.toml", "ledger_app.toml", "Makefile"];

console.log("Ledger: Loading extension");

export function activate(context: vscode.ExtensionContext) {
  console.log(`Ledger: activating extension`);

  // Initialize context for wizard visibility
  vscode.commands.executeCommand("setContext", "myApp.showWizard", false);

  outputChannel = vscode.window.createOutputChannel("Ledger DevTools");

  let webview = new Webview(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("appWebView", webview, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  // Register empty view for viewsWelcome when no apps found
  vscode.window.registerTreeDataProvider("emptyView", {
    getTreeItem: element => element,
    getChildren: () => [],
    onDidChangeTreeData: undefined,
  });

  const appList = findAppsInWorkspace();
  if (appList && appList.length > 0) {
    setSelectedApp(appList[0]);
    // Initialize git submodules for the default selected app (event not fired on setSelectedApp)
    initializeAppSubmodulesIfNeeded(appList[0].folderUri);
    webview.addAppsToWebview(
      appList.map(app => app.folderName),
      appList[0].folderName,
    );
  }

  let targetSelector = new TargetSelector();

  // Update targets based on selected app, then add to webview
  targetSelector.updateTargetsInfos();
  webview.addTargetsToWebview(
    targetSelector.getTargetsArray(),
    targetSelector.getSelectedTarget(),
  );

  let taskProvider = new TaskProvider(targetSelector, webview);
  context.subscriptions.push(vscode.tasks.registerTaskProvider(taskType, taskProvider));

  let statusBarManager = new StatusBarManager(targetSelector.getSelectedTarget(), getSelectedBuidUseCase());

  let containerManager = new ContainerManager(taskProvider);

  // Event listener for container status.
  // This event is fired when the container status changes
  context.subscriptions.push(
    containerManager.onStatusEvent((data) => {
      statusBarManager.updateDevImageItem(data);
      // TODO: update webview container status indicator
      if (data === DevImageStatus.running) {
        getAndBuildAppTestsDependencies(targetSelector);
        getAppTestsList(targetSelector, false, webview);
      }
    }),
  );

  // Event listener for target selection.
  // This event is fired when the user selects a target in the targetSelector menu
  context.subscriptions.push(
    webview.onTargetSelectedEvent((data) => {
      targetSelector.setSelectedTarget(data);
      taskProvider.generateTasks();
      statusBarManager.updateTargetItem(data);
      containerManager.manageContainer();
    }),
  );

  // Event listener for variant selection.
  // This event is fired when the user selects a build variant
  context.subscriptions.push(
    onVariantSelectedEvent(() => {
      taskProvider.generateTasks();
    }),
  );

  // Event listener for tests selection.
  // This event is fired when the user selects tests to run
  context.subscriptions.push(
    onTestsSelectedEvent(() => {
      taskProvider.regenerateSubset([
        "Run tests",
        "Run tests with display",
        "Run tests with display - on device",
        "Generate golden snapshots",
      ]);
    }),
  );

  // Event listener for Guideline Enforcer check selection.
  // This event is fired when the user selects a Guideline Enforcer check
  context.subscriptions.push(
    onCheckSelectedEvent(() => {
      taskProvider.generateTasks();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("selectCheck", () => {
      showChecks();
    }),
  );

  // Event listener for Build Mode selection.
  // This event is fired when the user selects a Build Mode
  context.subscriptions.push(
    onBuildModeSelectedEvent(() => {
      taskProvider.generateTasks();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("toggleBuildMode", () => {
      toggleBuildMode();
    }),
  );

  // Event listener for useCase selection.
  // This event is fired when the user selects a build useCase
  context.subscriptions.push(
    onUseCaseSelectedEvent((data) => {
      taskProvider.generateTasks();
      statusBarManager.updateBuildUseCaseItem(data);
    }),
  );

  // Event listener for app selection.
  // This event is fired when the user selects an app in the appSelector menu
  context.subscriptions.push(
    webview.onAppSelectedEvent((selectedAppName) => {
      const selectedApp = setSelectedAppByName(selectedAppName);
      if (selectedApp) {
        // Initialize git submodules if needed for the selected app
        initializeAppSubmodulesIfNeeded(selectedApp.folderUri);
        if (selectedApp.variants) {
          if (selectedApp.variants.values.length > 1) {
            vscode.commands.executeCommand("setContext", "ledgerDevTools.showSelectVariant", true);
          }
          else {
            vscode.commands.executeCommand("setContext", "ledgerDevTools.showSelectVariant", false);
          }
          const variant = getSetting("selectedVariant", selectedApp.folderUri) as string;
          selectedApp.variants.selected = variant;
        }
        else {
          vscode.commands.executeCommand("setContext", "ledgerDevTools.showSelectVariant", false);
        }
        const target = getSetting("selectedDevice", selectedApp.folderUri, "defaultDevice") as string;
        if (target) {
          targetSelector.setSelectedTarget(target);
          statusBarManager.updateTargetItem(target);
        }
      }
      containerManager.manageContainer();
      taskProvider.generateTasks();
      targetSelector.updateTargetsInfos();
      webview.addTargetsToWebview(
        targetSelector.getTargetsArray(),
        targetSelector.getSelectedTarget(),
      );
    }),
  );

  // Event listener for test use case selection.
  // This event is fired when the user selects a test use case in the testUseCaseSelector menu
  context.subscriptions.push(
    onTestUseCaseSelected(() => {
    }),
  );

  //   context.subscriptions.push(
  //     vscode.commands.registerCommand("selectTarget", () => {
  //       targetSelector.showTargetSelectorMenu();
  //     }),
  //   );

  context.subscriptions.push(
    vscode.commands.registerCommand("selectVariant", () => {
      showVariant();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("buildUseCase", () => {
      showBuildUseCase();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("addTestsPrerequisites", () => {
      setAppTestsPrerequisites(taskProvider);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("executeTask", (taskName: string) => {
      taskProvider.executeTaskByName(taskName);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("toggleAllTargets", () => {
      targetSelector.toggleAllTargetSelection();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("selectTestUseCase", () => {
      showTestUseCaseSelectorMenu(targetSelector);
    }),
  );

  //   context.subscriptions.push(
  //     vscode.commands.registerCommand("selectTests", () => {
  //       showTestsSelectorMenu(targetSelector);
  //     }),
  //   );

  context.subscriptions.push(
    vscode.commands.registerCommand("refreshTests", () => {
      getAppTestsList(targetSelector, false, webview);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("rebuildTestUseCaseDeps", () => {
      getAndBuildAppTestsDependencies(targetSelector, true);
    }),
  );

  context.subscriptions.push(vscode.commands.registerCommand("rebuildTestUseCaseDepsSpin", () => {}));
  
  context.subscriptions.push(
    vscode.commands.registerCommand("showAppList", () => {
      showAppSelectorMenu(targetSelector);
    }),
  );

  vscode.tasks.onDidStartTask((event) => {
    const taskName = event.execution.task.name;
    if (taskName.startsWith("Update container") || taskName.startsWith("Create container")) {
      event.execution.task.isBackground = true;
      containerManager.triggerStatusEvent(DevImageStatus.syncing);
    }
    if (taskName.startsWith("Quick initial device")) {
      const conf = vscode.workspace.getConfiguration("ledgerDevTools");
      const seedValue = conf.get<string>("onboardingSeed");
      const defaultSeed = conf.inspect<string>("onboardingSeed")?.defaultValue;
      if (seedValue === defaultSeed) {
        vscode.window.showWarningMessage("Do not use default onboarding seed with real funds !");
      }
    }
  });

  vscode.tasks.onDidEndTask((event) => {
    const taskName = event.execution.task.name;
    if (taskName.startsWith("Update container") || taskName.startsWith("Create container")) {
      containerManager.checkUpdateRetries();
    }
  });

  vscode.tasks.onDidEndTaskProcess((event) => {
    const taskName = event.execution.task.name;
    webview.onEndTaskProcess(taskName, event.exitCode === 0);
    console.log(`Ledger: TaskProcess completed : "${taskName}". ExiCode=${event.exitCode}`);
    if (
      (taskName === "Load app on device" || taskName === "Delete app from device" || taskName === "Update container" || taskName === "Create container")
      && event.exitCode === 0
    ) {
      const conf = vscode.workspace.getConfiguration("ledgerDevTools");
      if (conf.get<boolean>("keepTerminal") === false) {
        vscode.window.activeTerminal?.hide();
      }
    }
  });

  let findAppsAndUpdateExtension = () => {
    const appList = findAppsInWorkspace();
    let selectedApp;
    if (appList) {
      const currentApp = getSelectedApp();
      if (!currentApp || !appList.includes(currentApp)) {
        setSelectedApp(appList[0]);
        selectedApp = appList[0];
        // Initialize git submodules for the newly selected app (event not fired on setSelectedApp)
        initializeAppSubmodulesIfNeeded(appList[0].folderUri);
      }
      webview.addAppsToWebview(
        appList.map(app => app.folderName),
        selectedApp ? selectedApp.folderName : "",
      );
      targetSelector.updateTargetsInfos();
      webview.addTargetsToWebview(
        targetSelector.getTargetsArray(),
        targetSelector.getSelectedTarget(),
      );
      taskProvider.provideTasks();
      containerManager.manageContainer();
    }
  };

  vscode.workspace.onDidChangeWorkspaceFolders(() => {
    findAppsAndUpdateExtension();
  });

  vscode.workspace.onDidSaveTextDocument((event) => {
    const fileName = event.fileName.split("/").pop();
    if (fileName && appDetectionFiles.includes(fileName)) {
      findAppsAndUpdateExtension();
    }
  });

  vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("ledgerDevTools")) {
      taskProvider.generateTasks();
    }
    if (event.affectsConfiguration("ledgerDevTools.defaultDevice")) {
      targetSelector.setSelectedTarget(
        vscode.workspace.getConfiguration("ledgerDevTools").get<string>("defaultDevice", "Nano S"),
      );
      taskProvider.generateTasks();
      statusBarManager.updateTargetItem(targetSelector.getSelectedTarget());
    }
  });

  containerManager.manageContainer();

  console.log(`Ledger: extension activated`);
  return 0;
}

export function pushError(error: string) {
  outputChannel.appendLine("Error : " + error);
  outputChannel.show();
  // Show error message to user
  vscode.window.showErrorMessage("Ledger extension error : " + error);
}

export async function deactivate() {
  console.log(`Ledger: deactivating extension`);
  // DO STUFF
  console.log(`Ledger: extension deactivated`);
}

export function updateSetting(key: string, value: string | string[], folderUri: vscode.Uri) {
  const conf = vscode.workspace.getConfiguration("ledgerDevTools", folderUri);
  const appSettings = conf.get<Record<string, string | string[]>>("appSettings");
  if (appSettings) {
    if (appSettings[key] !== value) {
      if (appSettings[key]) {
        console.log(`Ledger: appSettings '${key}' found (${appSettings[key].toString()}), updating it with '${value}'`);
      }
      else {
        console.log(`Ledger: appSettings no '${key}' key exist yet, adding it with '${value}'`);
      }
      appSettings[key] = value;
      conf.update("appSettings", appSettings, vscode.ConfigurationTarget.WorkspaceFolder);
    }
  }
  else {
    console.log(`Ledger: no appSettings configuration, creating it with '${value}'`);
    conf.update("appSettings", { [key]: value }, vscode.ConfigurationTarget.WorkspaceFolder);
  }
}

export function getSetting(key: string, folderUri: vscode.Uri, defaultKey?: string): string | string[] {
  const conf = vscode.workspace.getConfiguration("ledgerDevTools", folderUri);
  const appSettings = conf.get<Record<string, string | string[]>>("appSettings");
  let value: string | string[] = "";
  if (appSettings && appSettings[key]) {
    value = appSettings[key];
  }
  else if (defaultKey) {
    const inspect = conf.inspect<string | string[]>(defaultKey);
    if (inspect && inspect.defaultValue) {
      value = inspect.defaultValue;
    }
  }
  return value;
}
