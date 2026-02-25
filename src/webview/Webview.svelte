<script lang="ts">
  import "@vscode-elements/elements/dist/vscode-icon/index.js";
  import autoAnimate from "@formkit/auto-animate";
  import { Popover } from "bits-ui";
  import Select, { type SelectItem } from "./components/Select.svelte";
  import StatusDot from "./components/StatusDot.svelte";
  import ActionGroup, { type ActionGroupData, type Action } from "./components/ActionGroup.svelte";
  import Toolbar from "./components/Toolbar.svelte";
  import { ChevronDown, ChevronRight } from "@jis3r/icons";
  import TestsList from "./components/TestsList.svelte";
  import type { TestCase } from "./components/TestsList.svelte";
  import type { TaskSpec } from "../types";
  import { DevImageStatus } from "../types";

  let { vscode } = $props();
  let selectedApp = $state("app-boilerplate");
  let selectedTarget = $state("Stax");
  let allDevices = $state(false);
  let showActions = $state(true);
  let pinnedIds: string[] = [];
  let expandedIds: string[] = [];
  let apps = $state<SelectItem[]>([]);
  let targets = $state<SelectItem[]>([]);
  let ready = $state(false);
  let containerStatus: DevImageStatus = $state(DevImageStatus.stopped);
  let dockerRunning = $state(false);
  let imageOutdated = $state(false);

  // Build use case
  let buildUseCase = $state("");
  let buildUseCases = $state<string[]>([]);

  let variants = $state<string[]>([]);
  let variant = $state("");

  let enforcerChecks = $state<SelectItem[]>([]);
  let enforcerCheck = $state("");

  // Capitalize first letter for display
  function formatBuildUseCase(useCase: string): string {
    return useCase.charAt(0).toUpperCase() + useCase.slice(1);
  }

  // Get icon for build use case
  function getBuildUseCaseIcon(useCase: string): string {
    switch (useCase.toLowerCase()) {
      case "debug":
        return "bug";
      case "release":
        return "package";
      default:
        return "rocket";
    }
  }

  function toggleActions() {
    showActions = !showActions;
    saveUIState();
  }

  let testCases = $state<TestCase[]>([]);
  let verboseTests = $state(false);
  let isRefreshing = $state(false);
  let testDependencies = $state("");
  let depsPopoverOpen = $state(false);
  let depsInputValue = $state("");

  $effect(() => {
    depsInputValue = testDependencies;
  });

  function saveDependencies() {
    updateTestDependencies(depsInputValue);
    depsPopoverOpen = false;
  }

  let actionGroups = $state<ActionGroupData[]>([
    { id: "Build", icon: "tools", options: [] },
    { id: "Emulator", icon: "play", options: [], disabledOnAllDevices: true },
    { id: "Tests", icon: "beaker", options: [] },
    { id: "Device", icon: "device-mobile", options: [], disabledOnAllDevices: true },
    { id: "Tools", icon: "terminal", options: [] },
  ]);

  function isGroupDisabled(group: ActionGroupData): boolean {
    if (group.id === "Tests" && testCases.length === 0 && !isRefreshing) return true;
    if (allDevices && (group.disabledOnAllDevices ?? false)) return true;
    if (group.mainAction && group.mainAction.disabled) return true;
    return false;
  }

  function togglePin(groupId: string, actionId: string) {
    const group = actionGroups.find((g) => g.id === groupId);
    if (!group) return;

    if (group.mainAction?.id === actionId) {
      group.mainAction.pinned = !group.mainAction.pinned;
    } else {
      const option = group.options.find((o) => o.id === actionId);
      if (option) {
        option.pinned = !option.pinned;
      }
    }
    saveUIState();
  }

  function toggleExpand(groupId: string) {
    const group = actionGroups.find((g) => g.id === groupId);
    if (group) group.expanded = !group.expanded;
    saveUIState();
  }

  function saveUIState() {
    // Rebuild plain arrays from current state for postMessage (avoids Svelte proxies)
    pinnedIds = [];
    expandedIds = [];
    for (const group of actionGroups) {
      if (group.expanded) expandedIds.push(group.id);
      if (group.mainAction?.pinned) pinnedIds.push(group.mainAction.id);
      for (const option of group.options) {
        if (option.pinned) pinnedIds.push(option.id);
      }
    }

    vscode.postMessage({
      command: "saveUIState",
      pinnedIds,
      expandedIds,
      showActions,
    });
  }

  function executeAction(groupId: string, actionId: string) {
    const group = actionGroups.find((g) => g.id === groupId);
    if (!group) return;

    let action =
      group.mainAction?.id === actionId
        ? group.mainAction
        : group.options.find((o) => o.id === actionId);

    if (!action) return;

    // Post message to VSCode extension
    vscode.postMessage({
      command: "executeTask",
      taskName: action.taskName,
    });

    action.status = "running";
  }

  function executeCommand(commandName: string, args: any[] = []) {
    vscode.postMessage({
      command: "executeCommand",
      commandName,
      args,
    });
  }

  function sendSelectedTests(testsCases: TestCase[]) {
    vscode.postMessage({
      command: "updateSelectedTests",
      selectedTests: testsCases.filter((t) => t.selected).map((t) => t.id),
    });
  }

  function sendSelectedApp(app: string) {
    vscode.postMessage({
      command: "appSelected",
      selectedApp: app,
    });
  }

  function sendSelectedTarget(target: string) {
    allDevices = target === "All";
    vscode.postMessage({
      command: "targetSelected",
      selectedTarget: target,
    });
  }

  function refreshTests() {
    isRefreshing = true;
    testCases = [];
    vscode.postMessage({ command: "refreshTests" });
  }

  function selectBuildUseCase(useCase: string) {
    buildUseCase = useCase;
    vscode.postMessage({
      command: "buildUseCaseSelected",
      selectedBuildUseCase: useCase,
    });
  }

  function selectedVariant(selected: string) {
    variant = selected;
    vscode.postMessage({
      command: "variantSelected",
      selectedVariant: selected,
    });
  }

  function selectCheck(check: string) {
    enforcerCheck = check;
    vscode.postMessage({
      command: "enforcerCheckSelected",
      selectedEnforcerCheck: check,
    });
  }

  function updateTestDependencies(value: string) {
    testDependencies = value;
    vscode.postMessage({
      command: "testDependenciesUpdated",
      testDependencies: value,
    });
  }

  // Convert buildUseCases to SelectItem format
  const buildUseCaseItems = $derived<SelectItem[]>(
    buildUseCases.map((uc) => ({ value: uc, label: formatBuildUseCase(uc) })),
  );

  const variantItems = $derived<SelectItem[]>(variants.map((v) => ({ value: v, label: v })));

  window.addEventListener("message", (event) => {
    const message = event.data;
    switch (message.command) {
      case "addTasks":
        console.log("Received addTasks message:", message);
        let specs: TaskSpec[] = message.specs;

        // Build new options per group first
        const newOpts: Record<string, Action[]> = {};
        actionGroups.forEach((g) => {
          newOpts[g.id] = [];
        });

        specs.forEach((spec) => {
          const group = actionGroups.find((g) => g.id === spec.group);
          if (group && spec.state !== "unavailable") {
            let action: Action = {
              id: spec.name,
              label: spec.label ?? spec.name,
              icon: spec.icon,
              taskName: spec.name,
              tooltip: spec.toolTip,
              disabledOnAllDevices: spec.allSelectedBehavior === "disable",
              disabled: spec.state === "disabled",
              status: "idle",
              pinned: pinnedIds.includes(spec.name),
            };
            if (spec.mainCommand) {
              group.mainAction = action;
            } else {
              newOpts[group.id].push(action);
            }
          }
        });
        // Assign options atomically
        actionGroups.forEach((group) => {
          group.options = newOpts[group.id];
        });
        break;
      case "endTaskProcess":
        const { taskName, success } = message;
        // Update action groups (toolbar derives from these)
        actionGroups.forEach((group) => {
          // Check main action
          if (group.mainAction && group.mainAction.taskName === taskName) {
            group.mainAction.status = success ? "success" : "error";
            setTimeout(() => {
              group.mainAction!.status = "idle";
            }, 5000);
          } else {
            // Check options
            group.options.forEach((option) => {
              if (option.taskName === taskName) {
                option.status = success ? "success" : "error";
                setTimeout(() => {
                  option.status = "idle";
                }, 5000);
              }
            });
          }
        });
        break;
      case "addTestCases":
        const receivedTestCases: string[] = message.testCases;
        const selectedTestCases: string[] =
          message.selectedTestCases.length == 0 ? receivedTestCases : message.selectedTestCases;
        testCases = [];
        testCases = receivedTestCases.map((testId) => ({
          id: testId,
          name: testId,
          selected: selectedTestCases.includes(testId),
        }));
        isRefreshing = false;
        break;
      case "addApps":
        apps = [];
        apps = message.apps.map((app: string) => ({ value: app, label: app }));
        selectedApp = message.selectedApp;
        // Clear tests when app list changes - tests will be refreshed when container is ready
        testCases = [];
        break;
      case "addTargets":
        targets = [];
        targets.push({ value: "All", label: "All" });
        targets.push(
          ...message.targets.map((target: string) => ({ value: target, label: target })),
        );
        selectedTarget = message.selectedTarget;
        allDevices = selectedTarget === "All";
        break;
      case "addBuildUseCases":
        buildUseCases = message.buildUseCases;
        buildUseCase = message.selectedBuildUseCase;
        break;
      case "addVariants":
        variants = message.variants;
        variant = message.selectedVariant;
        break;
      case "containerStatus":
        containerStatus = message.status;
        dockerRunning = message.dockerRunning ?? false;
        imageOutdated = message.imageOutdated ?? false;
        break;
      case "addEnforcerChecks":
        enforcerChecks = [];
        enforcerChecks = message.enforcerChecks.map((check: string) => ({
          value: check,
          label: check,
        }));
        enforcerCheck = message.selectedEnforcerCheck;
        break;
      case "setTestDependencies":
        testDependencies = message.testDependencies ?? "";
        break;
      case "setState": {
        /** Restore UI state */
        pinnedIds = message.pinnedIds ?? [];
        expandedIds = message.expandedIds ?? [];
        actionGroups.forEach((group) => {
          group.expanded = expandedIds.includes(group.id);
          if (group.mainAction) {
            group.mainAction.pinned = pinnedIds.includes(group.mainAction.id);
          }
          group.options.forEach((opt) => {
            opt.pinned = pinnedIds.includes(opt.id);
          });
        });
        if (message.showActions !== undefined) {
          showActions = message.showActions;
        }
        break;
      }
      case "ready":
        ready = true;
        break;
    }
    // Handle other commands as needed
  });

  // Notify extension that webview is ready to receive messages
  function notifyReady() {
    vscode.postMessage({ command: "webviewReady" });
  }
  notifyReady();
</script>

<div class="container">
  <!-- Welcome View when docker is not running -->
  {#if ready && !dockerRunning}
    <div class="welcome-view">
      <i class="codicon codicon-error welcome-icon error"></i>
      <p class="welcome-title">Docker is not running</p>
      <p class="welcome-description">
        Please install and start Docker to use the extension. Once Docker is running, reload the
        extension.
      </p>
      <div class="welcome-buttons">
        <a
          class="vscode-button"
          href="https://docs.docker.com/get-docker/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Get Docker
        </a>
        <button
          class="vscode-button secondary"
          onclick={() =>
            vscode.postMessage({
              command: "executeCommand",
              commandName: "workbench.action.reloadWindow",
            })}
        >
          Reload Extension
        </button>
      </div>
      <img class="wordmark" src={(window as any).resourceUris?.wordmark} alt="Ledger" />
    </div>
    <!-- Welcome View when no apps found -->
  {:else if ready && apps.length === 0}
    <div class="welcome-view">
      <i class="codicon codicon-warning welcome-icon"></i>
      <p class="welcome-title">No Ledger app detected</p>
      <p class="welcome-description">
        Open a Ledger app's folder or open a workspace containing Ledger apps to get started.
      </p>
      <div class="welcome-buttons">
        <button class="vscode-button" onclick={() => vscode.postMessage({ command: "openApp" })}>
          Open App Folder
        </button>
        <button
          class="vscode-button secondary"
          onclick={() => vscode.postMessage({ command: "openWorkspace" })}
        >
          Open Workspace
        </button>
      </div>
      <img class="wordmark" src={(window as any).resourceUris?.wordmark} alt="Ledger" />
    </div>
  {:else if ready && apps.length > 0}
    <!-- Main Content -->
    <div class="main-content">
      <!-- Quick Actions Toolbar (at top) -->
      <Toolbar {actionGroups} {allDevices} onExecute={executeAction} {isGroupDisabled} />
      <!-- Header -->
      <div class="header-section">
        <!-- Configuration Card -->
        <div class="config-card">
          <div class="config-header">
            <i class="codicon codicon-settings-gear"></i>
            <h2 class="config-title">Configuration</h2>
            <StatusDot {vscode} status={containerStatus} {imageOutdated} />
          </div>
          <div class="config-grid">
            <div class="form-group">
              <Select
                icon="file-code"
                groupLabel="Application"
                items={apps}
                bind:value={selectedApp}
                onchange={sendSelectedApp}
              />
            </div>
            <div class="form-group">
              <Select
                icon="device-mobile"
                groupLabel="Device"
                items={targets}
                bind:value={selectedTarget}
                placeholder="Select..."
                onchange={sendSelectedTarget}
              />
            </div>
            {#if buildUseCases.length > 1}
              <div class="form-group">
                <Select
                  icon={getBuildUseCaseIcon(buildUseCase)}
                  groupLabel="Build Mode"
                  items={buildUseCaseItems}
                  bind:value={buildUseCase}
                  onchange={selectBuildUseCase}
                />
              </div>
            {/if}
            {#if variants.length > 1}
              <div class="form-group">
                <Select
                  icon="symbol-misc"
                  groupLabel="Variant"
                  items={variantItems}
                  bind:value={variant}
                  onchange={selectedVariant}
                />
              </div>
            {/if}
          </div>
          <div class="hint-wrapper" use:autoAnimate>
            {#if allDevices}
              <div class="toggle-hint">
                <i class="codicon codicon-info"></i>
                Some actions will be disabled
              </div>
            {:else if selectedTarget === "Nano X"}
              <div class="toggle-hint warning">
                <i class="codicon codicon-warning"></i>
                Device operations not supported
              </div>
            {/if}
          </div>
        </div>
      </div>

      <!-- Actions Toggle -->
      <button class="actions-toggle" onclick={toggleActions}>
        {#if showActions}
          <ChevronDown size={12} />
        {:else}
          <ChevronRight size={12} />
        {/if}
        <span>Actions</span>
      </button>

      <!-- Action Groups -->
      <div class="actions-wrapper" use:autoAnimate>
        {#if showActions}
          <div class="actions-section">
            {#each actionGroups as group}
              {#if group.id === "Tests"}
                <ActionGroup
                  {group}
                  disabled={isGroupDisabled(group)}
                  {allDevices}
                  onExecute={(actionId) => executeAction(group.id, actionId)}
                  onTogglePin={(actionId) => togglePin(group.id, actionId)}
                  onToggleExpand={() => toggleExpand(group.id)}
                >
                  <div class="option-row">
                    <Popover.Root bind:open={depsPopoverOpen}>
                      <Popover.Trigger openOnHover openDelay={1000} class="option-button">
                        <span class="option-icon">
                          <i class="codicon codicon-type-hierarchy"></i>
                        </span>
                        <span class="option-label">Add Test Dependencies</span>
                      </Popover.Trigger>
                      <Popover.Portal>
                        <Popover.Content class="deps-popover" side="top" sideOffset={4}>
                          <div class="deps-popover-content">
                            <label class="deps-label" for="deps-input"
                              >Additional test dependencies</label
                            >
                            <div class="dep-warning-row">
                              <i class="codicon codicon-warning"></i>
                              <button
                                class="dep-warning-link"
                                onclick={() =>
                                  vscode.postMessage({
                                    command: "executeCommand",
                                    commandName: "workbench.action.openSettings",
                                    args: ["ledgerDevTools.openContainerAsRoot"],
                                  })}
                              >
                                Enable root on container
                              </button>
                            </div>

                            <input
                              id="deps-input"
                              type="text"
                              class="deps-input"
                              bind:value={depsInputValue}
                              placeholder="e.g. apt install package_name"
                            />
                            <button class="deps-save-button" onclick={saveDependencies}>Save</button
                            >
                          </div>
                        </Popover.Content>
                      </Popover.Portal>
                    </Popover.Root>
                  </div>
                  <TestsList
                    bind:testCases
                    bind:verboseTests
                    {isRefreshing}
                    {refreshTests}
                    {sendSelectedTests}
                  />
                </ActionGroup>
              {:else if group.id === "Tools"}
                <ActionGroup
                  {group}
                  disabled={isGroupDisabled(group)}
                  {allDevices}
                  onExecute={(actionId) => executeAction(group.id, actionId)}
                  onTogglePin={(actionId) => togglePin(group.id, actionId)}
                  onToggleExpand={() => toggleExpand(group.id)}
                >
                  {#snippet optionSuffix(option)}
                    {#if option.label === "Enforcer Checks"}
                      <div class="check-select-wrapper">
                        <Select
                          items={enforcerChecks}
                          bind:value={enforcerCheck}
                          placeholder="All"
                          onchange={selectCheck}
                        />
                      </div>
                    {/if}
                  {/snippet}
                </ActionGroup>
              {:else}
                <ActionGroup
                  {group}
                  disabled={isGroupDisabled(group)}
                  {allDevices}
                  onExecute={(actionId) => executeAction(group.id, actionId)}
                  onTogglePin={(actionId) => togglePin(group.id, actionId)}
                  onToggleExpand={() => toggleExpand(group.id)}
                />
              {/if}
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .welcome-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 20px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    background: linear-gradient(
      to top,
      #000000 0%,
      var(--vscode-sideBar-background) 35%,
      var(--vscode-sideBar-background) 100%
    );
    color: var(--vscode-foreground);
  }

  .welcome-icon {
    font-size: 32px;
    color: var(--vscode-editorWarning-foreground);
    margin-bottom: 12px;
  }

  .welcome-icon.error {
    color: var(--vscode-editorError-foreground);
  }

  .welcome-title {
    font-size: var(--vscode-font-size);
    font-weight: 600;
    color: var(--vscode-foreground);
    margin: 0 0 8px 0;
  }

  .welcome-description {
    font-size: var(--vscode-font-size);
    color: var(--vscode-descriptionForeground);
    margin: 0 0 16px 0;
    line-height: 1.4;
  }

  .welcome-buttons {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  }

  .vscode-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 4px 14px;
    box-sizing: border-box;
    text-decoration: none;
    border: none;
    border-radius: 2px;
    font-size: var(--vscode-font-size);
    font-family: var(--vscode-font-family);
    cursor: pointer;
    background-color: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    width: 100%;
  }

  .vscode-button:hover {
    background-color: var(--vscode-button-hoverBackground);
  }

  .vscode-button.secondary {
    background-color: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }

  .vscode-button.secondary:hover {
    background-color: var(--vscode-button-secondaryHoverBackground);
  }

  .wordmark {
    width: 100%;
    max-width: 100px;
    margin-top: 24px;
  }

  .container {
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-font-family);
    min-width: 200px;
  }

  .main-content {
    max-width: 600px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .header-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* Configuration Card */
  .config-card {
    background-color: var(--vscode-sideBar-background);
    border-radius: 4px;
    border: 1px solid var(--vscode-panel-border);
    padding: 8px;
  }

  .config-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    color: var(--vscode-foreground);
  }

  .config-title {
    font-size: 12px;
    font-weight: 600;
    margin: 0;
    flex: 1;
  }

  .config-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 8px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  /* Hint wrapper & toggle hint */
  .hint-wrapper {
    display: flex;
    flex-direction: column;
  }

  .dep-warning-row {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--vscode-editorWarning-foreground);
    font-size: 11px;
  }

  .dep-warning-link {
    background: none;
    border: none;
    padding: 0;
    color: var(--vscode-editorWarning-foreground);
    font-size: 11px;
    cursor: pointer;
    text-decoration: underline;
  }

  .dep-warning-link:hover {
    opacity: 0.8;
  }

  .toggle-hint {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--vscode-panel-border);
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
  }

  .toggle-hint.warning {
    color: var(--vscode-editorWarning-foreground);
  }

  /* Actions Toggle */
  .actions-toggle {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 2px;
    padding: 0;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--vscode-descriptionForeground);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    opacity: 0.7;
  }

  .actions-toggle:hover {
    color: var(--vscode-foreground);
    opacity: 1;
  }

  /* Actions Section */
  .actions-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* Animations */
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .check-select-wrapper {
    flex: 1 1 auto;
    min-width: 80px;
  }

  /* Shared option button styles (same as ActionGroup) */
  .option-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  :global(.option-button) {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border: none;
    border-radius: 2px;
    background-color: transparent;
    color: var(--vscode-foreground);
    cursor: pointer;
    transition: all 0.1s;
    text-align: left;
    flex: 1;
  }

  :global(.option-button:hover) {
    background-color: var(--vscode-list-hoverBackground);
  }

  .option-icon {
    font-size: 14px;
    color: var(--vscode-descriptionForeground);
  }

  .option-label {
    flex: 1;
    font-size: 12px;
  }

  :global(.deps-popover) {
    background-color: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-editorWidget-border);
    border-radius: 4px;
    padding: 12px;
    box-shadow: 0 2px 8px var(--vscode-widget-shadow);
    z-index: 1000;
  }

  :global(.deps-popover-content) {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 220px;
  }

  :global(.deps-label) {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
  }

  :global(.deps-input) {
    padding: 4px 8px;
    font-size: 12px;
    background-color: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 2px;
    outline: none;
  }

  :global(.deps-input:focus) {
    border-color: var(--vscode-focusBorder);
  }

  :global(.deps-save-button) {
    padding: 4px 10px;
    font-size: 12px;
    background-color: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 2px;
    cursor: pointer;
  }

  :global(.deps-save-button:hover) {
    background-color: var(--vscode-button-hoverBackground);
  }
</style>
