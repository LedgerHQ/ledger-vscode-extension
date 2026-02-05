"use strict";

import * as vscode from "vscode";
import {
  TaskProvider,
  taskType,
  onCheckSelectedEvent,
  setSelectedCheck,
  getChecks,
  showChecks,
} from "./taskProvider";
import { TargetSelector } from "./targetSelector";
import { StatusBarManager } from "./statusBar";
import { ContainerManager, DevImageStatus } from "./containerManager";
import {
  showBuildUseCase,
  findAppsInWorkspace,
  getSelectedApp,
  setSelectedApp,
  getAppList,
  getAppTestsList,
  onTestsSelectedEvent,
  setAppTestsPrerequisites,
  getAppTestsPrerequisites,
  updateAppTestsPrerequisites,
  showTestUseCaseSelectorMenu,
  onTestUseCaseSelected,
  onUseCaseSelectedEvent,
  onAppSelectedEvent,
  getAndBuildAppTestsDependencies,
  getSelectedBuidUseCase,
  setBuildUseCase,
  onVariantSelectedEvent,
  showVariant,
  setVariant,
  setSelectedAppByName,
  initializeAppSubmodulesIfNeeded,
  getAppUseCaseNames,
  showAppSelectorMenu,
} from "./appSelector";
import { Webview, WebviewRefreshOptions } from "./webview/webviewProvider";

let outputChannel: vscode.OutputChannel;
const appDetectionFiles = ["Cargo.toml", "ledger_app.toml", "Makefile"];

console.log("Ledger: Loading extension");

export function activate(context: vscode.ExtensionContext) {
  console.log(`Ledger: activating extension`);

  outputChannel = vscode.window.createOutputChannel("Ledger DevTools");

  let webview = new Webview(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("appWebView", webview, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  const appList = findAppsInWorkspace();
  const hasApps = appList && appList.length > 0;

  if (hasApps) {
    setSelectedApp(appList[0]);
    // Initialize git submodules for the default selected app (event not fired on setSelectedApp)
    initializeAppSubmodulesIfNeeded(appList[0].folderUri);
  }

  let targetSelector = new TargetSelector();
  targetSelector.updateTargetsInfos();

  let taskProvider = new TaskProvider(targetSelector, webview);
  context.subscriptions.push(vscode.tasks.registerTaskProvider(taskType, taskProvider));

  let statusBarManager = new StatusBarManager(targetSelector.getSelectedTarget(), getSelectedBuidUseCase());

  let containerManager = new ContainerManager(taskProvider);

  let isInitialActivation = true;

  // Helper to build full webview refresh options from current state
  const buildFullRefreshOptions = (): WebviewRefreshOptions => {
    const appList = getAppList();
    const selectedApp = getSelectedApp();

    const options: WebviewRefreshOptions = {
      targets: {
        list: targetSelector.getTargetsArray(),
        selected: targetSelector.getSelectedTarget(),
      },
    };

    if (selectedApp) {
      options.apps = {
        list: appList.map(app => app.folderName),
        selected: selectedApp.folderName,
      };
      options.buildUseCases = {
        list: getAppUseCaseNames(selectedApp.folderName),
        selected: getSelectedBuidUseCase(),
      };
      options.variants = selectedApp.variants
        ? { list: selectedApp.variants.values, selected: selectedApp.variants.selected }
        : null;
      options.enforcerChecks = {
        list: getChecks().values,
        selected: getChecks().selected,
      };
    }

    // Include container status (for re-resolution)
    const containerStatus = containerManager.getContainerStatus();
    options.containerStatus = {
      status: containerStatus === DevImageStatus.running
        ? "running"
        : containerStatus === DevImageStatus.stopped
          ? "stopped"
          : "syncing",
    };

    return options;
  };

  // Helper to refresh webview with full state
  const refreshWebviewFullState = () => {
    webview.refresh(buildFullRefreshOptions());
    if (getSelectedApp()) {
      webview.sendTestDependencies(getAppTestsPrerequisites());
    }
    taskProvider.generateTasks();
  };

  // Event listener for container status.
  // This event is fired when the container status changes
  context.subscriptions.push(
    containerManager.onStatusEvent((data) => {
      statusBarManager.updateDevImageItem(data);
      webview.refresh({
        containerStatus: {
          status: data === DevImageStatus.running ? "running" : data === DevImageStatus.stopped ? "stopped" : "syncing",
        },
      });
      if (data === DevImageStatus.running) {
        getAndBuildAppTestsDependencies(targetSelector);
        getAppTestsList(targetSelector, false, webview);
      }
    }),
  );

  // Event listener for target selection from quick pick menu.
  context.subscriptions.push(
    targetSelector.onTargetSelectedEvent((data) => {
      taskProvider.generateTasks();
      statusBarManager.updateTargetItem(data);
      containerManager.manageContainer();
      webview.refresh({
        targets: {
          list: targetSelector.getTargetsArray(),
          selected: targetSelector.getSelectedTarget(),
        },
      });
    }),
  );

  // Event listener for target selection from webview.
  context.subscriptions.push(
    webview.onTargetSelectedEvent((data) => {
      targetSelector.setSelectedTarget(data);
      taskProvider.generateTasks();
      statusBarManager.updateTargetItem(data);
      containerManager.manageContainer();
    }),
  );

  // Event listener for variant selection from webview.
  context.subscriptions.push(
    webview.onVariantSelectedEvent((data) => {
      setVariant(data);
      taskProvider.generateTasks();
    }),
  );

  // Event listener for variant selection.
  // This event is fired when the user selects a build variant
  context.subscriptions.push(
    onVariantSelectedEvent(() => {
      webview.refresh({
        variants: {
          list: getSelectedApp() ? getSelectedApp()!.variants?.values || [] : [],
          selected: getSelectedApp() ? getSelectedApp()!.variants?.selected || "" : "",
        },
      });
      taskProvider.generateTasks();
    }),
  );

  // Event listener for tests selection.
  // This event is fired when the user selects tests to run
  context.subscriptions.push(
    onTestsSelectedEvent(() => {
      taskProvider.regenerateSubset([
        "Run Tests",
        "Tests with Display",
        "Tests on Device",
        "Generate Snapshots",
      ]);
    }),
  );

  // Event listener for Guideline Enforcer check selection.
  // This event is fired when the user selects a Guideline Enforcer check
  context.subscriptions.push(
    onCheckSelectedEvent(() => {
      webview.refresh({
        enforcerChecks: {
          list: getChecks().values,
          selected: getChecks().selected,
        },
      });
      taskProvider.generateTasks();
    }),
  );

  context.subscriptions.push(
    webview.onCheckSelectedEvent((check) => {
      setSelectedCheck(check);
      taskProvider.generateTasks();
    }),
  );

  context.subscriptions.push(
    webview.onTestDepsUpdatedEvent((deps) => {
      updateAppTestsPrerequisites(deps);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("selectCheck", () => {
      showChecks();
    }),
  );

  // Event listener for useCase selection from quick pick menu.
  // This event is fired when the user selects a build useCase
  context.subscriptions.push(
    onUseCaseSelectedEvent((data) => {
      taskProvider.generateTasks();
      statusBarManager.updateBuildUseCaseItem(data);
      webview.refresh({
        buildUseCases: {
          list: getAppUseCaseNames(getSelectedApp() ? getSelectedApp()!.folderName : ""),
          selected: getSelectedBuidUseCase(),
        },
      });
    }),
  );

  // Event listener for useCase selection from webview.
  // This event is fired when the user selects a build useCase in the webview
  context.subscriptions.push(
    webview.onUseCaseSelectedEvent((data) => {
      setBuildUseCase(data);
      taskProvider.generateTasks();
      statusBarManager.updateBuildUseCaseItem(data);
    }),
  );

  // Event listener for app selection from webview - just triggers setSelectedAppByName which fires onAppSelectedEvent
  context.subscriptions.push(
    webview.onAppSelectedEvent((selectedAppName) => {
      setSelectedAppByName(selectedAppName);
    }),
  );

  // Event listener for app selection (shared handler for webview and quick pick menu)
  context.subscriptions.push(
    onAppSelectedEvent((selectedAppName) => {
      const selectedApp = getSelectedApp()!;
      // Initialize git submodules if needed for the selected app
      initializeAppSubmodulesIfNeeded(selectedApp.folderUri);

      if (selectedApp.variants) {
        selectedApp.variants.selected = getSetting("selectedVariant", selectedApp.folderUri) as string;
      }

      const target = getSetting("selectedDevice", selectedApp.folderUri, "defaultDevice") as string;
      if (target) {
        targetSelector.setSelectedTarget(target);
        statusBarManager.updateTargetItem(target);
      }

      containerManager.manageContainer();
      taskProvider.generateTasks();
      targetSelector.updateTargetsInfos();
      const appList = getAppList();
      webview.refresh({
        apps: {
          list: appList.map(app => app.folderName),
          selected: selectedAppName,
        },
        targets: {
          list: targetSelector.getTargetsArray(),
          selected: targetSelector.getSelectedTarget(),
        },
        buildUseCases: {
          list: getAppUseCaseNames(selectedAppName),
          selected: getSelectedBuidUseCase(),
        },
        variants: selectedApp.variants
          ? { list: selectedApp.variants.values, selected: selectedApp.variants.selected }
          : null,
        enforcerChecks: {
          list: getChecks().values,
          selected: getChecks().selected,
        },
      });
      webview.sendTestDependencies(getAppTestsPrerequisites());
    }),
  );

  // Event listener for test use case selection.
  // This event is fired when the user selects a test use case in the testUseCaseSelector menu
  context.subscriptions.push(
    onTestUseCaseSelected(() => {
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("selectTarget", () => {
      targetSelector.showTargetSelectorMenu();
    }),
  );

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
    if (taskName.startsWith("Update Container") || taskName.startsWith("Create Container")) {
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
    if (taskName.startsWith("Update Container") || taskName.startsWith("Create Container")) {
      containerManager.checkUpdateRetries();
    }
  });

  vscode.tasks.onDidEndTaskProcess((event) => {
    const taskName = event.execution.task.name;
    webview.onEndTaskProcess(taskName, event.exitCode === 0);
    console.log(`Ledger: TaskProcess completed : "${taskName}". ExiCode=${event.exitCode}`);
    if (
      (taskName === "Load on Device" || taskName === "Delete App from Device" || taskName === "Update Container" || taskName === "Create Container")
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
    let currentApp = getSelectedApp();
    if (appList) {
      if (!currentApp || !appList.includes(currentApp)) {
        setSelectedApp(appList[0]);
        currentApp = appList[0];
        // Initialize git submodules for the newly selected app (event not fired on setSelectedApp)
        initializeAppSubmodulesIfNeeded(appList[0].folderUri);
      }
      targetSelector.updateTargetsInfos();
      webview.refresh({
        apps: {
          list: appList.map(app => app.folderName),
          selected: currentApp ? currentApp.folderName : "",
        },
        buildUseCases: {
          list: getAppUseCaseNames(currentApp ? currentApp.folderName : ""),
          selected: getSelectedBuidUseCase(),
        },
        targets: {
          list: targetSelector.getTargetsArray(),
          selected: targetSelector.getSelectedTarget(),
        },
        // Clear tests if the (re-detected) app no longer has functional tests
        testCases: !currentApp?.functionalTestsDir ? null : undefined,
      });
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

  // Watch for tests folder changes (conftest.py creation/deletion)
  // Helper functions to avoid duplication
  const refreshTestsIfReady = () => {
    const currentApp = getSelectedApp();
    if (currentApp?.functionalTestsDir && containerManager.getContainerStatus() === DevImageStatus.running) {
      getAppTestsList(targetSelector, false, webview);
    }
  };

  const isTestsRelatedPath = (fsPath: string): boolean => {
    if (fsPath.endsWith("conftest.py")) {
      return true;
    }
    const currentApp = getSelectedApp();
    const testsDir = currentApp?.functionalTestsDir;
    if (testsDir && currentApp?.folderUri) {
      const testsPath = vscode.Uri.joinPath(currentApp.folderUri, testsDir).fsPath;
      return testsPath.startsWith(fsPath);
    }
    return false;
  };

  // FileSystemWatcher catches external changes (terminal, other apps)
  const conftestWatcher = vscode.workspace.createFileSystemWatcher("**/conftest.py", false, true, false);
  conftestWatcher.onDidCreate(() => refreshTestsIfReady());
  conftestWatcher.onDidDelete(() => webview.refresh({ testCases: null }));
  context.subscriptions.push(conftestWatcher);

  // VS Code explorer operations are caught by workspace events
  context.subscriptions.push(
    vscode.workspace.onDidDeleteFiles((event) => {
      if (event.files.some(uri => isTestsRelatedPath(uri.fsPath))) {
        webview.refresh({ testCases: null });
      }
    }),
    vscode.workspace.onDidCreateFiles((event) => {
      if (event.files.some(uri => uri.fsPath.endsWith("conftest.py"))) {
        refreshTestsIfReady();
      }
    }),
  );

  vscode.workspace.onDidChangeConfiguration((event) => {
    // Exclude appSettings changes - they're handled by dedicated event listeners
    // (onTargetSelectedEvent for selectedDevice, onVariantSelectedEvent for selectedVariant, etc.)
    if (event.affectsConfiguration("ledgerDevTools") && !event.affectsConfiguration("ledgerDevTools.appSettings")) {
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

  // Listen for webview ready event (fires on initial load and re-resolution when moved to new sidebar)
  context.subscriptions.push(
    webview.onWebviewReadyEvent(() => {
      refreshWebviewFullState();
      if (isInitialActivation) {
        isInitialActivation = false;
        containerManager.manageContainer();
      }
      else {
        // On re-resolution, fetch tests if container is already running (onStatusEvent won't fire)
        if (containerManager.getContainerStatus() === DevImageStatus.running) {
          getAppTestsList(targetSelector, false, webview);
        }
      }
    }),
  );

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
