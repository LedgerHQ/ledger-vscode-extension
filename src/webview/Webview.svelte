<script lang="ts">
  import "@vscode-elements/elements/dist/vscode-icon/index.js";
  import autoAnimate from "@formkit/auto-animate";
  import Select, { type SelectItem } from "./components/Select.svelte";
  import StatusDot from "./components/StatusDot.svelte";
  import ActionGroup, { type ActionGroupData, type Action } from "./components/ActionGroup.svelte";
  import TestsList from "./components/TestsList.svelte";
  import type { TestCase } from "./components/TestsList.svelte";
  import type { TaskSpec, BadgeStatus } from "../types";

  let { vscode } = $props();
  let selectedApp = $state("app-boilerplate");
  let selectedTarget = $state("Stax");
  let allDevices = $state(false);
  let apps = $state<SelectItem[]>([]);
  let targets = $state<SelectItem[]>([]);
  let containerStatus: BadgeStatus = $state("stopped");

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

  let testCases = $state<TestCase[]>([]);
  let verboseTests = $state(false);
  let isRefreshing = $state(false);

  let actionGroups = $state<ActionGroupData[]>([
    { id: "Build", icon: "tools", options: [] },
    { id: "Emulator", icon: "play", options: [], disabledOnAllDevices: true },
    { id: "Tests", icon: "beaker", options: [] },
    { id: "Device", icon: "device-mobile", options: [], disabledOnAllDevices: true },
    { id: "Tools", icon: "terminal", options: [] },
  ]);

  function isGroupDisabled(group: ActionGroupData): boolean {
    // Disabled if no mainAction (not populated) OR if allDevices mode and group is disabled on all devices
    if (!group.mainAction) return true;
    if (group.id === "Tests" && testCases.length === 0 && !isRefreshing) return true;
    return (allDevices && (group.disabledOnAllDevices ?? false)) || group.mainAction.disabled;
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
        actionGroups.forEach((g) => {
          g.mainAction = undefined;
          g.options = [];
        });
        let specs: TaskSpec[] = message.specs;
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
        break;
      case "addEnforcerChecks":
        enforcerChecks = [];
        enforcerChecks = message.enforcerChecks.map((check: string) => ({
          value: check,
          label: check,
        }));
        enforcerCheck = message.selectedEnforcerCheck;
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
          {#if buildUseCases.length > 1}
            <Select
              items={buildUseCaseItems}
              bind:value={buildUseCase}
              onchange={selectBuildUseCase}
              variant="badge"
              icon={getBuildUseCaseIcon(buildUseCase)}
              tooltip="Select Build Use Case"
            />
          {/if}
          {#if variants.length > 1}
            <Select
              items={variantItems}
              bind:value={variant}
              onchange={selectedVariant}
              variant="badge"
              icon="symbol-misc"
              tooltip="Select Variant"
            />
          {/if}
        </div>

        <!-- Configuration Card -->
        <div class="config-card">
          <div class="config-header">
            <i class="codicon codicon-settings-gear"></i>
            <h2 class="config-title">Configuration</h2>
            <StatusDot status={containerStatus} />
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
                placeholder="Select..."
                onchange={sendSelectedTarget}
              />
            </div>
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

      <!-- Action Groups -->
      <div class="actions-section">
        {#each actionGroups as group}
          {#if group.id === "Tests"}
            <ActionGroup
              {group}
              disabled={isGroupDisabled(group)}
              {allDevices}
              onExecute={(actionId) => executeAction(group.id, actionId)}
            >
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
            />
          {/if}
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
    flex-wrap: wrap;
    gap: 8px;
  }

  @media (max-width: 250px) {
    .header-row {
      flex-direction: column;
      align-items: flex-start;
    }
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
    flex: 1;
  }

  @media (min-width: 350px) {
    .config-grid {
      display: flex;
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

  /* Hint wrapper & toggle hint */
  .hint-wrapper {
    display: flex;
    flex-direction: column;
  }

  .toggle-hint {
    margin-top: 12px;
    padding-top: 12px;
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

  /* Actions Section */
  .actions-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
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

  .check-select-wrapper {
    flex: 1 1 auto;
    min-width: 80px;
  }
</style>
