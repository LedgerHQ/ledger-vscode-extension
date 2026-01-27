<script lang="ts">
  import "@vscode-elements/elements/dist/vscode-icon/index.js";
  import autoAnimate from "@formkit/auto-animate";
  import { Plus, Check, X } from "@jis3r/icons";
  import Switch from "./components/Switch.svelte";
  import Select, { type SelectItem } from "./components/Select.svelte";
  import type { TaskSpec } from "../types/taskTypes";

  let { vscode } = $props();
  let selectedApp = $state("app-boilerplate");
  let selectedTarget = $state("Stax");
  let allDevices = $state(false);
  let hoveredGroupId = $state<string | null>(null);
  let apps = $state<SelectItem[]>([]);
  let targets = $state<SelectItem[]>([]);

  let previousSelectedTarget: string = "";

  // Build use case
  type BuildUseCase = "debug" | "release";
  let buildUseCase = $state<BuildUseCase>("debug");
  let showBuildUseCaseMenu = $state(false);

  const buildUseCases: { id: BuildUseCase; label: string }[] = [
    { id: "debug", label: "Debug" },
    { id: "release", label: "Release" },
  ];

  type CommandStatus = "idle" | "running" | "success" | "error";

  interface Action {
    id: string;
    label: string;
    icon?: string; // codicon name
    taskName?: string;
    tooltip?: string;
    status: CommandStatus;
    disabledOnAllDevices?: boolean;
  }

  interface ActionGroup {
    id: string;
    icon: string;
    mainAction?: Action;
    options: Action[];
    showOptions: boolean;
    disabledOnAllDevices?: boolean;
  }

  interface TestCase {
    id: string;
    name: string;
    selected: boolean;
  }

  let testCases = $state<TestCase[]>([]);
  let verboseTests = $state(false);
  let isRefreshing = $state(false);

  let actionGroups = $state<ActionGroup[]>([
    { id: "Build", icon: "tools", options: [], showOptions: false },
    { id: "Emulator", icon: "play", options: [], showOptions: false, disabledOnAllDevices: true },
    { id: "Tests", icon: "beaker", options: [], showOptions: false },
    {
      id: "Device",
      icon: "device-mobile",
      options: [],
      showOptions: false,
      disabledOnAllDevices: true,
    },
    { id: "Tools", icon: "terminal", options: [], showOptions: false },
  ]);

  function isGroupDisabled(group: ActionGroup): boolean {
    // Disabled if no mainAction (not populated) OR if allDevices mode and group is disabled on all devices
    if (!group.mainAction) return true;
    return allDevices && (group.disabledOnAllDevices ?? false);
  }

  function isActionDisabled(action: Action): boolean {
    return allDevices && (action.disabledOnAllDevices ?? false);
  }

  function executeAction(groupId: string, actionId: string) {
    const group = actionGroups.find((g) => g.id === groupId);
    if (!group || !group.mainAction) return;

    let action =
      group.mainAction.id === actionId
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

  function toggleOptions(groupId: string) {
    const group = actionGroups.find((g) => g.id === groupId);
    if (group) {
      showBuildUseCaseMenu = false;
      group.showOptions = !group.showOptions;
    }
  }

  function toggleAllTests(select: boolean) {
    testCases.forEach((t) => (t.selected = select));
    sendSelectedTests();
  }

  function getSelectedTestCount(): number {
    return testCases.filter((t) => t.selected).length;
  }

  function sendSelectedTests() {
    vscode.postMessage({
      command: "updateSelectedTests",
      selectedTests: testCases.filter((t) => t.selected).map((t) => t.id),
    });
  }

  function sendSelectedApp(app: string) {
    vscode.postMessage({
      command: "appSelected",
      selectedApp: app,
    });
  }

  function sendSelectedTarget(target: string) {
    vscode.postMessage({
      command: "targetSelected",
      selectedTarget: target,
    });
  }

  function sendAllDevices() {
    if (allDevices) {
      previousSelectedTarget = selectedTarget;
      selectedTarget = "All";
    } else {
      selectedTarget = previousSelectedTarget;
    }
    vscode.postMessage({
      command: "targetSelected",
      selectedTarget: selectedTarget,
    });
  }

  function refreshTests() {
    isRefreshing = true;
    testCases = [];
    vscode.postMessage({ command: "refreshTests" });
  }

  function getStatusClass(status: CommandStatus): string {
    switch (status) {
      case "running":
        return "status-running";
      case "success":
        return "status-success";
      case "error":
        return "status-error";
      default:
        return "";
    }
  }

  function selectBuildUseCase(useCase: BuildUseCase) {
    buildUseCase = useCase;
    showBuildUseCaseMenu = false;
  }

  window.addEventListener("message", (event) => {
    const message = event.data;
    switch (message.command) {
      case "addTasks":
        console.log("Received addTasks message:", message);
        actionGroups.forEach((g) => {
          g.mainAction = undefined;
          g.options = [];
        });
        let specs: TaskSpec[] = message.specs;
        specs.forEach((spec) => {
          const group = actionGroups.find((g) => g.id === spec.group);
          if (group) {
            let action: Action = {
              id: spec.name,
              label: spec.name,
              icon: spec.icon,
              taskName: spec.name,
              tooltip: spec.toolTip,
              status: "idle",
            };
            if (spec.mainCommand) {
              console.log("Setting main action for group", group.id, "to", action);
              group.mainAction = action;
            } else {
              console.log("Adding option action for group", group.id, ":", action);
              group.options.push(action);
            }
          }
        });
        break;
      case "endTaskProcess":
        const { taskName, success } = message;
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
        break;
      case "addTargets":
        targets = [];
        targets = message.targets.map((target: string) => ({ value: target, label: target }));
        selectedTarget = message.selectedTarget;
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
  <!-- Welcome View when no apps found -->
  {#if apps.length === 0}
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
  {:else}
    <!-- Main Content -->
    <div class="main-content">
      <!-- Header -->
      <div class="header-section">
        <div class="header-row">
          <div class="build-usecase-wrapper" use:autoAnimate>
            <button
              class="build-usecase-badge {buildUseCase}"
              onclick={(e) => {
                e.stopPropagation();
                const willOpen = !showBuildUseCaseMenu;
                actionGroups.forEach((g) => (g.showOptions = false));
                showBuildUseCaseMenu = willOpen;
              }}
            >
              <i class="codicon codicon-rocket"></i>
              {buildUseCases.find((u) => u.id === buildUseCase)?.label}
              <i class="codicon codicon-chevron-down chevron"></i>
            </button>
            {#if showBuildUseCaseMenu}
              <div class="build-usecase-dropdown">
                {#each buildUseCases as useCase}
                  <button
                    class="usecase-option {buildUseCase === useCase.id ? 'selected' : ''}"
                    onclick={() => selectBuildUseCase(useCase.id)}
                  >
                    <i class="codicon codicon-{buildUseCase === useCase.id ? 'check' : 'blank'}"
                    ></i>
                    {useCase.label}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        </div>

        <!-- Configuration Card -->
        <div class="config-card">
          <div class="config-header">
            <i class="codicon codicon-settings-gear"></i>
            <h2 class="config-title">Configuration</h2>
          </div>
          <div class="config-grid">
            <div class="form-group">
              <label for="app-select">Application</label>
              <Select items={apps} bind:value={selectedApp} onchange={sendSelectedApp} />
            </div>
            <div class="form-group">
              <label for="target-select">Target Device</label>
              <Select
                items={targets}
                bind:value={selectedTarget}
                disabled={allDevices}
                placeholder={allDevices ? "All" : "Select..."}
                onchange={sendSelectedTarget}
              />
            </div>
          </div>
          <div class="all-devices-toggle">
            <label class="toggle-label">
              <input type="checkbox" bind:checked={allDevices} onchange={sendAllDevices} />
              <span class="toggle-text">
                <i class="codicon codicon-layers"></i>
                Build for all devices
              </span>
            </label>
            {#if allDevices}
              <span class="toggle-hint">Some actions will be disabled</span>
            {/if}
          </div>
        </div>
      </div>

      <!-- Action Groups -->
      <div class="actions-section">
        {#each actionGroups as group}
          <div class="action-group {isGroupDisabled(group) ? 'disabled' : ''}" use:autoAnimate>
            <div class="action-group-header">
              {#if group.mainAction}
                <button
                  onclick={() => executeAction(group.id, group.mainAction?.id ?? "")}
                  disabled={group.mainAction.status === "running" || isGroupDisabled(group)}
                  class="action-button main {getStatusClass(group.mainAction.status)}"
                  title={group.mainAction.tooltip}
                >
                  <span class="action-icon">
                    <i class="codicon codicon-{group.icon}"></i>
                  </span>
                  <div class="action-label">
                    <div class="action-title">{group.id}</div>
                    <div class="action-subtitle">{group.mainAction.label}</div>
                  </div>
                  {#if group.mainAction.status !== "idle"}
                    <span class="status-indicator">
                      {#if group.mainAction.status === "running"}
                        <span class="spinner"></span>
                      {:else if group.mainAction.status === "success"}
                        <Check size={16} animate={true} />
                      {:else}
                        <X size={16} animate={true} />
                      {/if}
                    </span>
                  {/if}
                </button>
              {:else}
                <button disabled={true} class="action-button main disabled">
                  <span class="action-icon">
                    <i class="codicon codicon-{group.icon}"></i>
                  </span>
                  <div class="action-label">
                    <div class="action-title">{group.id}</div>
                    <div class="action-subtitle">Not available</div>
                  </div>
                </button>
              {/if}
              <button
                onmouseenter={() => (hoveredGroupId = group.id)}
                onmouseleave={() => (hoveredGroupId = null)}
                class="gear-button {group.showOptions && !isGroupDisabled(group) ? 'active' : ''}"
                onclick={() => toggleOptions(group.id)}
                disabled={isGroupDisabled(group)}
              >
                <span
                  class="plus-icon"
                  class:rotated={group.showOptions && !isGroupDisabled(group)}
                >
                  <Plus size={16} animate={hoveredGroupId === group.id}></Plus>
                </span>
              </button>
            </div>

            {#if group.showOptions && !isGroupDisabled(group)}
              <div class="options-panel">
                {#each group.options as option}
                  <button
                    title={option.tooltip}
                    onclick={() => executeAction(group.id, option.id)}
                    disabled={option.status === "running" || isActionDisabled(option)}
                    class="option-button {getStatusClass(option.status)} {isActionDisabled(option)
                      ? 'disabled'
                      : ''}"
                  >
                    <span class="option-icon">
                      <i class="codicon codicon-{option.icon}"></i>
                    </span>
                    <span class="option-label">{option.label}</span>
                    {#if option.status !== "idle"}
                      <span class="status-indicator small">
                        {#if option.status === "running"}
                          <span class="spinner small"></span>
                        {:else if option.status === "success"}
                          <Check size={12} animate={true} />
                        {:else}
                          <X size={12} animate={true} />
                        {/if}
                      </span>
                    {/if}
                  </button>
                {/each}

                <!-- Embedded Test Selection (only in tests group) -->
                {#if group.id === "Tests"}
                  <div class="test-selector-embedded">
                    <div class="test-selector-divider"></div>

                    <!-- Verbose toggle -->
                    <div class="verbose-toggle-row">
                      <span class="verbose-label">
                        <i class="codicon codicon-output"></i>
                        Verbose output
                      </span>
                      <Switch bind:checked={verboseTests} />
                    </div>

                    <div class="test-selector-header-inline">
                      <span class="test-selector-title">
                        <i class="codicon codicon-list-selection"></i>
                        Tests to run
                      </span>
                      <div class="test-header-actions">
                        <button
                          class="icon-button"
                          onclick={refreshTests}
                          title="Refresh test list"
                        >
                          <i class="codicon codicon-refresh {isRefreshing ? 'spinning' : ''}"></i>
                        </button>
                        <span class="test-count">{getSelectedTestCount()}/{testCases.length}</span>
                      </div>
                    </div>
                    <div class="test-quick-actions">
                      <button class="text-button" onclick={() => toggleAllTests(true)}>
                        <i class="codicon codicon-check-all"></i>
                        All
                      </button>
                      <button class="text-button" onclick={() => toggleAllTests(false)}>
                        <i class="codicon codicon-close-all"></i>
                        None
                      </button>
                    </div>
                    <div class="test-list-compact" use:autoAnimate>
                      {#each testCases as test}
                        <label class="test-item-compact">
                          <input
                            type="checkbox"
                            bind:checked={test.selected}
                            onchange={sendSelectedTests}
                          />
                          <span class="test-name">{test.name}</span>
                        </label>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <!-- Footer Info -->
      <div class="footer-info">
        <i class="codicon codicon-info"></i>
        <span>
          {#if allDevices}
            Building {selectedApp} for <strong>all devices</strong>
          {:else}
            Building {selectedApp} for <strong>{selectedTarget}</strong>
          {/if}
        </span>
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
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 4px 14px;
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
    background-color: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-font-family);
    min-width: 200px;
    padding: 12px;
    border-radius: 8px;
  }

  .main-content {
    max-width: 600px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .header-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .title {
    font-size: 18px;
    font-weight: 600;
    margin: 0;
  }

  /* Build Use Case Selector */
  .build-usecase-wrapper {
    position: relative;
  }

  .build-usecase-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 12px;
    background-color: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    font-size: 11px;
    border: none;
    cursor: pointer;
    transition: background-color 0.1s;
  }

  .build-usecase-badge:hover {
    background-color: var(--vscode-button-secondaryHoverBackground);
  }

  .build-usecase-badge .chevron {
    font-size: 10px;
    opacity: 0.7;
  }

  .build-usecase-dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 4px;
    min-width: 100px;
    background-color: var(--vscode-dropdown-background);
    border: 1px solid var(--vscode-dropdown-border);
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    z-index: 100;
    overflow: hidden;
  }

  .usecase-option {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 10px;
    border: none;
    background: none;
    color: var(--vscode-dropdown-foreground);
    font-size: 12px;
    cursor: pointer;
    text-align: left;
  }

  .usecase-option:hover {
    background-color: var(--vscode-list-hoverBackground);
  }

  .usecase-option.selected {
    background-color: var(--vscode-list-activeSelectionBackground);
  }

  .usecase-option .codicon-blank {
    visibility: hidden;
  }

  /* Configuration Card */
  .config-card {
    background-color: var(--vscode-sideBar-background);
    border-radius: 4px;
    border: 1px solid var(--vscode-panel-border);
    padding: 12px;
  }

  .config-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    color: var(--vscode-foreground);
  }

  .config-title {
    font-size: 13px;
    font-weight: 600;
    margin: 0;
  }

  @media (min-width: 350px) {
    .config-grid {
      display: flex;
      /* grid-template-columns: 1fr 1fr; */
      flex-direction: row;
      gap: 12px;
    }

    .config-grid .form-group {
      flex: 1;
      min-width: 0;
    }
  }

  @media (max-width: 349px) {
    .config-grid {
      display: flex;
      /* grid-template-columns: 1fr 1fr; */
      flex-direction: column;
      gap: 12px;
    }
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .form-group label {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* All Devices Toggle */
  .all-devices-toggle {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--vscode-panel-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 12px;
  }

  .toggle-label input[type="checkbox"] {
    width: 14px;
    height: 14px;
    accent-color: var(--vscode-focusBorder);
  }

  .toggle-text {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .toggle-hint {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    font-style: italic;
  }

  /* Actions Section */
  .actions-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .action-group {
    display: flex;
    flex-direction: column;
    transition: opacity 0.2s;
  }

  .action-group.disabled {
    opacity: 0.4;
    pointer-events: none;
  }

  .action-group-header {
    display: flex;
  }

  .action-button {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--vscode-input-border);
    background-color: transparent;
    color: var(--vscode-foreground);
    cursor: pointer;
    transition: all 0.15s;
  }

  .action-button.main {
    flex: 1;
    border-radius: 3px 0 0 3px;
  }

  .action-button:hover:not(:disabled) {
    background-color: var(--vscode-list-hoverBackground);
  }

  .action-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-button.status-running {
    border-color: var(--vscode-focusBorder);
    background-color: var(--vscode-list-activeSelectionBackground);
  }

  .action-button.status-success {
    border-color: var(--vscode-testing-iconPassed);
  }

  .action-button.status-error {
    border-color: var(--vscode-testing-iconFailed);
  }

  .action-icon {
    font-size: 16px;
    width: 20px;
    text-align: center;
    color: var(--vscode-descriptionForeground);
  }

  .action-label {
    flex: 1;
    text-align: left;
  }

  .action-title {
    font-weight: 500;
    font-size: 12px;
  }

  .action-subtitle {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
  }

  .gear-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    border: 1px solid var(--vscode-input-border);
    border-left: none;
    border-radius: 0 3px 3px 0;
    background-color: transparent;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    transition: all 0.15s;
  }

  .gear-button:hover:not(:disabled) {
    background-color: var(--vscode-list-hoverBackground);
    color: var(--vscode-foreground);
  }

  .gear-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .gear-button.active {
    background-color: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-foreground);
  }

  .plus-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    transition: transform 0.2s ease;
  }

  .plus-icon.rotated {
    transform: rotate(45deg);
  }

  .options-panel {
    display: flex;
    flex-direction: column;
    margin-top: 2px;
    margin-left: 20px;
    padding: 4px;
    background-color: var(--vscode-sideBar-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 3px;
  }

  .option-button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border: none;
    border-radius: 2px;
    background-color: transparent;
    color: var(--vscode-foreground);
    cursor: pointer;
    transition: all 0.1s;
    text-align: left;
  }

  .option-button:hover:not(:disabled) {
    background-color: var(--vscode-list-hoverBackground);
  }

  .option-button:disabled,
  .option-button.disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .option-button.status-running {
    background-color: var(--vscode-list-activeSelectionBackground);
  }

  .option-icon {
    font-size: 14px;
    color: var(--vscode-descriptionForeground);
  }

  .option-label {
    flex: 1;
    font-size: 12px;
  }

  .status-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .status-indicator.small {
    font-size: 12px;
  }

  /* Running - uses progress bar color which is designed to stand out */
  .status-running .status-indicator {
    color: var(--vscode-progressBar-background);
  }

  /* Success - green */
  .status-success .status-indicator {
    color: var(--vscode-testing-iconPassed);
  }

  /* Error - red */
  .status-error .status-indicator {
    color: var(--vscode-testing-iconFailed);
  }

  .spin {
    animation: spin 1s linear infinite;
  }

  /* Embedded Test Selector (inside Tests options) */
  .test-selector-embedded {
    margin-top: 4px;
  }

  .test-selector-divider {
    height: 1px;
    background-color: var(--vscode-panel-border);
    margin: 8px 0;
  }

  .test-selector-header-inline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 10px;
  }

  .test-header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .icon-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    background: none;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    border-radius: 3px;
  }

  .icon-button:hover {
    background-color: var(--vscode-list-hoverBackground);
    color: var(--vscode-foreground);
  }

  .icon-button .spinning {
    animation: spin 0.8s linear infinite;
  }

  .test-selector-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .test-count {
    font-size: 10px;
    background-color: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    padding: 1px 5px;
    border-radius: 8px;
  }

  .test-quick-actions {
    display: flex;
    gap: 8px;
    padding: 2px 10px 6px;
  }

  .text-button {
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    color: var(--vscode-textLink-foreground);
    cursor: pointer;
    font-size: 10px;
    padding: 2px 4px;
    border-radius: 2px;
  }

  .text-button:hover {
    background-color: var(--vscode-list-hoverBackground);
  }

  .test-list-compact {
    display: flex;
    flex-direction: column;
    max-height: 150px;
    overflow-y: auto;
    padding: 0 4px;
  }

  .test-item-compact {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 6px;
    border-radius: 2px;
    cursor: pointer;
    font-size: 11px;
  }

  .test-item-compact:hover {
    background-color: var(--vscode-list-hoverBackground);
  }

  .test-item-compact input[type="checkbox"] {
    width: 12px;
    height: 12px;
    accent-color: var(--vscode-focusBorder);
  }

  .test-name {
    font-family: var(--vscode-editor-font-family);
    color: var(--vscode-foreground);
  }

  /* Footer */
  .footer-info {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    padding: 8px;
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

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--vscode-editor-background);
    border-top-color: #facc15;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .spinner.small {
    width: 12px;
    height: 12px;
    border-width: 1.5px;
  }

  /* Verbose toggle row */
  .verbose-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    margin-bottom: 4px;
  }

  .verbose-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--vscode-foreground);
  }
</style>
