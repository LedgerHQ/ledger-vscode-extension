<script lang="ts" module>
  type CommandStatus = "idle" | "running" | "success" | "error";

  export interface Action {
    id: string;
    label: string;
    icon?: string;
    taskName?: string;
    tooltip?: string;
    status: CommandStatus;
    disabledOnAllDevices?: boolean;
    disabled: boolean;
  }

  export interface ActionGroupData {
    id: string;
    icon: string;
    mainAction?: Action;
    options: Action[];
    disabledOnAllDevices?: boolean;
  }
</script>

<script lang="ts">
  import { Plus, Check, X } from "@jis3r/icons";
  import autoAnimate from "@formkit/auto-animate";
  import type { Snippet } from "svelte";

  interface Props {
    group: ActionGroupData;
    disabled: boolean;
    allDevices: boolean;
    onExecute: (actionId: string) => void;
    optionSuffix?: Snippet<[Action]>; // content to render inline after an option
    children?: Snippet;
  }

  let { group, disabled, allDevices, onExecute, optionSuffix, children }: Props = $props();

  let hovered = $state(false);
  let showOptions = $state(false);

  function isActionDisabled(action: Action): boolean {
    return (allDevices && (action.disabledOnAllDevices ?? false)) || action.disabled;
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
</script>

<div class="action-group" class:disabled use:autoAnimate>
  <div class="action-group-header">
    {#if group.mainAction}
      <button
        onclick={() => onExecute(group.mainAction?.id ?? "")}
        disabled={group.mainAction.status === "running" || disabled}
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
      onmouseenter={() => (hovered = true)}
      onmouseleave={() => (hovered = false)}
      class="gear-button"
      class:active={showOptions && !disabled}
      onclick={() => (showOptions = !showOptions)}
      {disabled}
    >
      <span class="plus-icon" class:rotated={showOptions && !disabled}>
        <Plus size={16} animate={hovered} />
      </span>
    </button>
  </div>

  {#if showOptions && !disabled}
    <div class="options-panel">
      {#each group.options as option}
        <div class="option-row">
          <button
            title={option.tooltip}
            onclick={() => onExecute(option.id)}
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
          {#if optionSuffix}
            {@render optionSuffix(option)}
          {/if}
        </div>
      {/each}
      {#if children}
        {@render children()}
      {/if}
    </div>
  {/if}
</div>

<style>
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
    gap: 8px;
    padding: 6px 10px;
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

  .option-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .option-button {
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

  .status-running .status-indicator {
    color: var(--vscode-progressBar-background);
  }

  .status-success .status-indicator {
    color: var(--vscode-testing-iconPassed);
  }

  .status-error .status-indicator {
    color: var(--vscode-testing-iconFailed);
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--vscode-progressBar-background);
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .spinner.small {
    width: 10px;
    height: 10px;
    border-width: 1.5px;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
