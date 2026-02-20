<script lang="ts" module>
  import type { ActionGroupData, Action } from "./ActionGroup.svelte";

  export interface ToolbarAction {
    id: string;
    label: string;
    icon: string;
    group: string;
    taskName?: string;
    tooltip?: string;
    status: "idle" | "running" | "success" | "error";
    disabled: boolean;
    showDivider: boolean;
  }
</script>

<script lang="ts">
  import { Tooltip } from "bits-ui";
  import { Check, X } from "@jis3r/icons";
  import autoAnimate from "@formkit/auto-animate";

  interface Props {
    actionGroups: ActionGroupData[];
    allDevices: boolean;
    onExecute: (groupId: string, actionId: string) => void;
  }

  let { actionGroups, allDevices, onExecute }: Props = $props();

  // Derive pinned actions from groups, with divider markers between groups
  let actions = $derived.by(() => {
    const pinned: ToolbarAction[] = [];
    let lastGroup = "";
    for (const group of actionGroups) {
      const addAction = (action: Action, icon: string) => {
        pinned.push({
          id: action.id,
          label: action.label,
          icon,
          group: group.id,
          taskName: action.taskName,
          tooltip: action.tooltip,
          status: action.status,
          disabled: action.disabled || (allDevices && (action.disabledOnAllDevices ?? false)),
          showDivider: lastGroup !== "" && lastGroup !== group.id,
        });
        lastGroup = group.id;
      };
      if (group.mainAction?.pinned) {
        addAction(group.mainAction, group.mainAction.icon ?? group.icon);
      }
      for (const opt of group.options) {
        if (opt.pinned) {
          addAction(opt, opt.icon ?? "symbol-method");
        }
      }
    }
    return pinned;
  });

  function getStatusClass(status: ToolbarAction["status"]): string {
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

<div class="toolbar-wrapper" use:autoAnimate>
  {#if actions.length > 0}
    <Tooltip.Provider>
      <div class="toolbar-root">
        <div class="toolbar-inner" use:autoAnimate>
          {#each actions as action}
            {#if action.showDivider}
              <div class="toolbar-divider"></div>
            {/if}
            <Tooltip.Root delayDuration={500}>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <button
                    {...props}
                    class="toolbar-button {getStatusClass(action.status)}"
                    disabled={action.disabled || action.status === "running"}
                    onclick={() => onExecute(action.group, action.id)}
                  >
                    <span class="toolbar-icon">
                      <i class="codicon codicon-{action.icon}"></i>
                    </span>
                  </button>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content class="toolbar-tooltip" sideOffset={8}>
                  <span class="tooltip-label">{action.label}</span>
                  {#if action.tooltip}
                    <span class="tooltip-desc">{action.tooltip}</span>
                  {/if}
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          {/each}
        </div>
      </div>
    </Tooltip.Provider>
  {/if}
</div>

<style>
  .toolbar-root {
    display: inline-flex;
    align-items: center;
    margin-bottom: 4px;
  }

  .toolbar-inner {
    display: flex;
    align-items: center;
    gap: 1px;
  }

  .toolbar-divider {
    width: 1px;
    height: 20px;
    background: var(--vscode-panel-border);
    margin: 0 3px;
  }

  .toolbar-button {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    transition:
      background 0.1s ease,
      color 0.1s ease;
  }

  .toolbar-button:hover:not(:disabled) {
    color: var(--vscode-foreground);
    background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
  }

  .toolbar-button:active:not(:disabled) {
    background: var(--vscode-toolbar-activeBackground, rgba(99, 102, 241, 0.2));
  }

  .toolbar-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .toolbar-button.status-running {
    color: var(--vscode-focusBorder);
    animation: pulse-glow 1.5s ease-in-out infinite;
    cursor: progress;
  }

  @keyframes pulse-glow {
    0%,
    100% {
      box-shadow: 0 0 4px 1px var(--vscode-focusBorder);
      opacity: 0.7;
    }
    50% {
      box-shadow: 0 0 10px 3px var(--vscode-focusBorder);
      opacity: 1;
    }
  }

  .toolbar-button.status-success {
    color: var(--vscode-testing-iconPassed);
  }

  .toolbar-button.status-error {
    color: var(--vscode-testing-iconFailed);
  }

  .toolbar-icon {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .toolbar-icon .codicon {
    font-size: 16px;
  }

  .spinner {
    width: 6px;
    height: 6px;
    border: 1px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  :global(.toolbar-tooltip) {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px 8px;
    background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-editorWidget-border);
    border-radius: 3px;
    box-shadow: 0 2px 8px var(--vscode-widget-shadow);
    z-index: 1000;
  }

  :global(.tooltip-label) {
    font-size: 11px;
    font-weight: 500;
    color: var(--vscode-foreground);
  }

  :global(.tooltip-desc) {
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
  }
</style>
