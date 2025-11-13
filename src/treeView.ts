import * as vscode from "vscode";
import { platform } from "node:process";
import * as cp from "child_process";
import { TargetSelector } from "./targetSelector";
import { getSelectedApp } from "./appSelector";
import { TaskSpec, checks } from "./taskProvider";
import { DevImageStatus, ContainerManager } from "./containerManager";

export class TreeDataProvider implements vscode.TreeDataProvider<TreeItem> {
  private data: TreeItem[];
  private targetSelector: TargetSelector;
  private fileDecorationProvider: ViewFileDecorationProvider;
  private containerManager?: ContainerManager;

  constructor(targetSelector: TargetSelector) {
    this.data = [];
    this.targetSelector = targetSelector;
    this.addDefaultTreeItems();
    this.updateDynamicLabels();
    this.fileDecorationProvider = new ViewFileDecorationProvider(this);
    vscode.window.registerFileDecorationProvider(this.fileDecorationProvider);
  }

  public setContainerManager(containerManager: ContainerManager) {
    this.containerManager = containerManager;
  }

  getTaskItemByLabel(label: string): TreeItem | undefined {
    // Loop through all items in the tree that have children
    for (let item of this.data) {
      if (item.children) {
        for (let child of item.children) {
          if (child.label === label) {
            return child;
          }
        }
      }
    }
  }

  getTreeItem(element: TreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return element;
  }

  getChildren(element?: TreeItem | undefined): vscode.ProviderResult<TreeItem[]> {
    if (element === undefined) {
      return this.data;
    }
    return element.children;
  }

  private addTaskToTree(spec: TaskSpec): void {
    let taskItem = new TreeItem(spec.name);
    taskItem.tooltip = spec.toolTip;
    taskItem.command = {
      command: "executeTask",
      title: spec.name,
      arguments: [spec.name],
    };
    if (spec.group) {
      // Find existing group by base group name (without any status suffix)
      let rootItem = this.data.find((item) => {
        const label = item.label?.toString() || "";
        // Match by checking if label starts with the group name
        // This handles cases where group label has status suffix like "Docker Container [running]"
        return label === spec.group || label.startsWith(spec.group + " [");
      });
      if (!rootItem) {
        rootItem = new TreeItem(spec.group);
        if (rootItem.label?.toString().startsWith("Docker Container")) {
          // Initialize Docker Container with current status
          if (this.containerManager) {
            const status = this.containerManager.getContainerStatus();
            let statusSuffix = "";
            let icon = new vscode.ThemeIcon("vm");
            switch (status) {
              case DevImageStatus.running:
                statusSuffix = "running";
                icon = new vscode.ThemeIcon("vm-active");
                break;
              case DevImageStatus.syncing:
                statusSuffix = "syncing";
                icon = new vscode.ThemeIcon("vm-connect");
                break;
              case DevImageStatus.stopped:
                statusSuffix = "stopped";
                icon = new vscode.ThemeIcon("vm-outline");
                break;
            }
            rootItem.label = `Docker Container [${statusSuffix}]`;
            rootItem.iconPath = icon;
          }
          else {
            rootItem.iconPath = new vscode.ThemeIcon("vm");
          }
        }
        if (rootItem.label?.toString().startsWith("Build")) {
          rootItem.iconPath = new vscode.ThemeIcon("tools");
        }
        if (rootItem.label?.toString().startsWith("Functional")) {
          rootItem.contextValue = "functionalTests";
          rootItem.iconPath = new vscode.ThemeIcon("test-view-icon");
        }
        if (rootItem.label?.toString().startsWith("Device")) {
          rootItem.iconPath = new vscode.ThemeIcon("zap");
        }
        this.data.push(rootItem);
      }
      rootItem.addChild(taskItem);

      taskItem.iconPath = new vscode.ThemeIcon("circle-filled");
      taskItem.resourceUri = vscode.Uri.from({
        scheme: "devtools-treeview",
        authority: "task",
        path: "/" + spec.name + "/" + spec.state,
      });
    }
    else {
      if (taskItem.label?.toString().startsWith("Run Guideline Enforcer")) {
        taskItem.iconPath = new vscode.ThemeIcon("symbol-ruler");
        taskItem.resourceUri = vscode.Uri.from({
          scheme: "devtools-treeview",
          authority: "task",
          path: "/" + spec.name + "/" + spec.state,
        });
        taskItem.contextValue = "selectCheck";
      }
      this.data.push(taskItem);
    }

    this.fileDecorationProvider.refreshTaskItemDecoration(taskItem.resourceUri);
  }

  public addAllTasksToTree(taskSpecs: TaskSpec[]): void {
    // Keep only default items
    this.data = this.data.filter(item => item.default);
    taskSpecs.forEach((spec) => {
      // Add only enabled tasks
      if (!(spec.state === "unavailable")) {
        this.addTaskToTree(spec);
        if (spec.name.includes("Run tests")) {
          this.addTestDependenciesTreeItem();
        }
      }
    });
    this.updateDynamicLabels();
  }

  private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<
    TreeItem | undefined | null | void
  >();

  readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  private addTestDependenciesTreeItem(): void {
    // Check functional tests root item exists
    let testsRootItem = this.data.find(item => item.label?.toString().startsWith("Functional"));
    // Check if dependencies item already exists
    let addTestReqsItem = testsRootItem?.children?.find(item => item.label?.toString().startsWith("Add test prerequisites"));
    if (testsRootItem && !addTestReqsItem) {
      // Add item to add new test requirements
      let addTestReqsItem = new TreeItem("Add test prerequisites");
      addTestReqsItem.tooltip
        = "Add Python tests prerequisites for current app (for instance 'apk add python3-protobuf'). This will be saved in your global configuration.";
      addTestReqsItem.command = {
        // Command that let's user input string saved for each app present in workspace
        command: "addTestsPrerequisites",
        title: "Add test prerequisites",
        arguments: [],
      };

      addTestReqsItem.iconPath = new vscode.ThemeIcon("circle-filled");
      addTestReqsItem.resourceUri = vscode.Uri.from({
        scheme: "devtools-treeview",
        authority: "task",
        path: "/" + testsRootItem.label + "/enabled",
      });

      testsRootItem.addChild(addTestReqsItem);
    }
    else if (testsRootItem && addTestReqsItem) {
      // Move addTestReqsItem item to the end of the list
      testsRootItem.children?.splice(testsRootItem.children?.indexOf(addTestReqsItem), 1);
    }
  }

  // updateContainerStatus function that takes DevImageStatus as argument to set the "Docker Operations" TreeItem
  public updateContainerLabel(status: DevImageStatus): void {
    const currentApp = getSelectedApp();
    let itemPrefix: string = "Docker Container";
    let itemSuffix: string = "";
    let itemIcon = new vscode.ThemeIcon("vm");
    if (currentApp) {
      let containerItem = this.data.find(item => item.label && item.label.toString().startsWith("Docker Container"));
      if (containerItem) {
        switch (status) {
          case DevImageStatus.running:
            itemIcon = new vscode.ThemeIcon("vm-active");
            itemSuffix = "running";
            break;
          case DevImageStatus.syncing:
            itemIcon = new vscode.ThemeIcon("vm-connect");
            itemSuffix = "syncing";
            break;
          case DevImageStatus.stopped:
            itemIcon = new vscode.ThemeIcon("vm-outline");
            itemSuffix = "stopped";
            break;
          default:
            itemIcon = new vscode.ThemeIcon("vm-outline");
            itemSuffix = "stopped";
            break;
        }
        containerItem.iconPath = itemIcon;
        containerItem.label = `${itemPrefix} [${itemSuffix}]`;
      }
    }
    this.refresh();
  }

  public getComposeServiceName(): string {
    let optionsExecSync: cp.ExecSyncOptions = { stdio: "pipe", encoding: "utf-8" };
    const currentApp = getSelectedApp();
    if (currentApp) {
      const uri = vscode.Uri.parse(currentApp.folderUri.toString());
      optionsExecSync.cwd = uri.fsPath;
    }
    // If platform is windows, set shell to powershell for cp exec.
    if (platform === "win32") {
      let shell: string = "C:\\windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
      optionsExecSync.shell = shell;
    }

    let cleanCmd: string = `docker compose config --services`;
    const output = cp.execSync(cleanCmd, optionsExecSync).toString().trim();
    return output.split("\n")[0];
  }

  public updateDynamicLabels(): void {
    const currentApp = getSelectedApp();
    if (currentApp) {
      let selectTargetItem = this.data.find(item => item.label && item.label.toString().startsWith("Select target"));
      let selectAppItem = this.data.find(item => item.label && item.label.toString().startsWith("Select app"));
      let functionalTestsItem = this.data.find(item => item.label && item.label.toString().startsWith("Functional"));
      let buildUseCaseItem = this.data.find(item => item.label && item.label.toString().startsWith("Build"));
      let selectVariantItem = this.data.find(item => item.label && item.label.toString().startsWith("Select variant"));
      let checkItem = this.data.find(item => item.label && item.label.toString().startsWith("Run Guideline Enforcer"));
      let devOprItem = this.data.find(item => item.label && item.label.toString().startsWith("Device Operations"));

      this.data.forEach((item) => {
        if (item.label?.toString().startsWith("Docker Container")) {
          const terminalItem = item.children?.find(child => child.label && child.label.toString().startsWith("Open default terminal"));
          if (terminalItem) {
            const conf = vscode.workspace.getConfiguration("ledgerDevTools");
            terminalItem.label = conf.get<boolean>("openContainerAsRoot") ? "Open default terminal [root]" : "Open default terminal";
          }
          const composeItem = item.children?.find(child => child.label && child.label.toString().startsWith("Open compose terminal"));
          if (composeItem) {
            const serviceName = this.getComposeServiceName();
            composeItem.label = `Open compose terminal [${serviceName}]`;
          }
        }
      });
      if (devOprItem) {
        if (this.targetSelector.getSelectedTarget() === "Nano X") {
          devOprItem.label = `Device Operations [Unsupported on Nano X]`;
        }
        else {
          devOprItem.label = `Device Operations`;
        }
      }
      if (checkItem) {
        checkItem.label = `Run Guideline Enforcer [${checks.selected}]`;
      }
      if (selectAppItem) {
        selectAppItem.label = `Select app [${currentApp.folderName}]`;
      }
      if (selectTargetItem) {
        selectTargetItem.label = `Select target [${this.targetSelector.getSelectedTarget()}]`;
      }
      if (functionalTestsItem) {
        functionalTestsItem.iconPath = new vscode.ThemeIcon("test-view-icon");
        functionalTestsItem.label = `Functional Tests`;
        if (currentApp.selectedTests && currentApp.selectedTests.length > 0) {
          functionalTestsItem.iconPath = new vscode.ThemeIcon("filter");
          functionalTestsItem.label = `${functionalTestsItem.label} [${currentApp.selectedTests.length}]`;
        }
        if (currentApp.selectedTestUseCase) {
          functionalTestsItem.label = `${functionalTestsItem.label} [${currentApp.selectedTestUseCase.name}]`;
        }
      }
      if (buildUseCaseItem) {
        buildUseCaseItem.label = `Build`;

        // if C app is selected
        if (currentApp.language === "c") {
          // Update Clean Target label
          const cleanItem = buildUseCaseItem.children?.find(child => child.label && child.label.toString().startsWith("Clean the "));
          if (cleanItem) {
            cleanItem.label = `Clean the ${this.targetSelector.getSelectedTarget()} build files`;
          }
        }
      }
      if (selectVariantItem) {
        if (currentApp.variants?.values && currentApp.variants?.values.length > 1 && currentApp.variants?.selected) {
          selectVariantItem.label = `Select variant [${currentApp.variants?.selected}]`;
        }
        else {
          selectVariantItem.label = `Select variant`;
        }
      }
      const selectUseCaseItem = this.data.find(item => item.label && item.label.toString().startsWith("Select use case"));
      if (selectUseCaseItem) {
        if (currentApp.buildUseCases && currentApp.buildUseCases.length > 1 && currentApp.selectedBuildUseCase) {
          selectUseCaseItem.label = `Select use case [${currentApp.selectedBuildUseCase.name}]`;
        }
        else {
          selectUseCaseItem.label = `Select use case`;
        }
      }
    }
    else {
      // Remove all tree items. The welcome view will be displayed instead.
      this.data = [];
    }
    this.refresh();
  }

  public addDefaultTreeItems(): void {
    // Check select app and select target items don't already exist
    const selectAppItem = this.data.find(item => item.label && item.label.toString().startsWith("Select app"));
    const selectTargetItem = this.data.find(item => item.label && item.label.toString().startsWith("Select target"));
    const selectUseCaseItem = this.data.find(item => item.label && item.label.toString().startsWith("Select use case"));
    const selectVariantItem = this.data.find(item => item.label && item.label.toString().startsWith("Select variant"));

    if (!selectAppItem) {
      let selectApp = new TreeItem("Select app");
      selectApp.setDefault();
      selectApp.tooltip = "Select app from workspace to build";
      selectApp.command = {
        command: "showAppList",
        title: "Select app",
        arguments: [],
      };
      console.log("Ledger: Adding selectApp to tree");
      this.data.push(selectApp);
    }

    if (!selectTargetItem) {
      let selectTarget = new TreeItem("Select target");
      selectTarget.contextValue = "selectTarget";
      selectTarget.setDefault();
      selectTarget.tooltip = "Select device to build for";
      selectTarget.command = {
        command: "selectTarget",
        title: "Select target",
        arguments: [],
      };
      console.log("Ledger: Adding selectTarget to tree");
      this.data.push(selectTarget);
    }

    const currentApp = getSelectedApp();
    if (currentApp) {
      if (!selectVariantItem && currentApp.variants && currentApp.variants.values.length > 1) {
        let selectVariant = new TreeItem("Select variant");
        selectVariant.contextValue = "selectVariant";
        selectVariant.setDefault();
        selectVariant.tooltip = "Select the variant to build";
        selectVariant.command = {
          command: "selectVariant",
          title: "Select variant",
          arguments: [],
        };
        console.log("Ledger: Adding selectVariant to tree");
        this.data.push(selectVariant);
      }
      else if (selectVariantItem
        && ((currentApp.variants && currentApp.variants.values.length <= 1) || !currentApp.variants)) {
        const index = this.data.indexOf(selectVariantItem, 0);
        if (index > -1) {
          console.log("Ledger: Removing selectVariant from tree");
          this.data.splice(index, 1);
        }
      }

      if (!selectUseCaseItem && currentApp.buildUseCases && currentApp.buildUseCases.length > 0) {
        let selectUseCase = new TreeItem("Select use case");
        selectUseCase.contextValue = "buildUseCase";
        selectUseCase.setDefault();
        selectUseCase.tooltip = "Select the build use case";
        selectUseCase.command = {
          command: "buildUseCase",
          title: "Select use case",
          arguments: [],
        };
        console.log("Ledger: Adding selectUseCase to tree");
        this.data.push(selectUseCase);
      }
      else if (selectUseCaseItem
        && (!currentApp.buildUseCases || currentApp.buildUseCases.length === 0)) {
        const index = this.data.indexOf(selectUseCaseItem, 0);
        if (index > -1) {
          console.log("Ledger: Removing selectUseCase from tree");
          this.data.splice(index, 1);
        }
      }
    }
  }
}

export class TreeItem extends vscode.TreeItem {
  children: TreeItem[] | undefined;
  default: boolean;

  constructor(label: string, children?: TreeItem[]) {
    super(label, children === undefined ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Expanded);
    this.children = children;
    this.default = false;
  }

  setDefault() {
    this.default = true;
  }

  addChild(child: TreeItem) {
    if (!this.children) {
      this.children = [];
    }
    this.children.push(child);
    this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
  }
}

export class ViewFileDecorationProvider implements vscode.FileDecorationProvider, vscode.Disposable {
  private treeDataProvider: TreeDataProvider;

  private readonly _onDidChangeFileDecorations: vscode.EventEmitter<vscode.Uri | vscode.Uri[]> = new vscode.EventEmitter<
    vscode.Uri | vscode.Uri[]
  >();

  readonly onDidChangeFileDecorations: vscode.Event<vscode.Uri | vscode.Uri[]> = this._onDidChangeFileDecorations.event;

  async refreshTaskItemDecoration(uri: vscode.Uri | undefined): Promise<void> {
    if (uri) {
      this._onDidChangeFileDecorations.fire(uri);
    }
  }

  private readonly disposable: vscode.Disposable;
  constructor(treeDataProvider: TreeDataProvider) {
    this.treeDataProvider = treeDataProvider;
    this.disposable = vscode.Disposable.from(vscode.window.registerFileDecorationProvider(this));
  }

  dispose(): void {
    this.disposable.dispose();
  }

  provideFileDecoration(uri: vscode.Uri, token: vscode.CancellationToken): vscode.FileDecoration | undefined {
    if (uri.scheme !== "devtools-treeview") {
      return undefined;
    }

    switch (uri.authority) {
      case "task":
        return this.provideTaskItemDecoration(uri, token);
    }

    return undefined;
  }

  provideTaskItemDecoration(uri: vscode.Uri, _token: vscode.CancellationToken): vscode.FileDecoration | undefined {
    const [, name, status] = uri.path.split("/");

    let color = new vscode.ThemeColor("gitDecoration.ignoredResourceForeground");
    let icon = new vscode.ThemeIcon("circle-outline");
    switch (status) {
      case "disabled":
        color = new vscode.ThemeColor("gitDecoration.ignoredResourceForeground");
        icon = new vscode.ThemeIcon("circle-outline");
        break;
      default:
      case "enabled":
        color = new vscode.ThemeColor("list.inactiveSelectionForeground");
        icon = new vscode.ThemeIcon("circle-filled");
        break;
    }

    let treeItem = this.treeDataProvider.getTaskItemByLabel(name);
    if (treeItem) {
      treeItem.iconPath = icon;
    }
    return {
      color: color,
    };
  }
}
