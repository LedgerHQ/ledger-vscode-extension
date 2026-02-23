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
  }

  interface ToolbarGroup {
    id: string;
    actions: ToolbarAction[];
  }
</script>

<script lang="ts">
  import { Toolbar, Tooltip } from "bits-ui";
  import autoAnimate from "@formkit/auto-animate";

  interface Props {
    actionGroups: ActionGroupData[];
    allDevices: boolean;
    onExecute: (groupId: string, actionId: string) => void;
    isGroupDisabled?: (group: ActionGroupData) => boolean;
  }

  let { actionGroups, allDevices, onExecute, isGroupDisabled }: Props = $props();

  // Group pinned actions by their source group
  let groups = $derived.by(() => {
    const result: ToolbarGroup[] = [];
    for (const group of actionGroups) {
      const actions: ToolbarAction[] = [];
      const addAction = (action: Action, icon: string) => {
        actions.push({
          id: action.id,
          label: action.label,
          icon,
          group: group.id,
          taskName: action.taskName,
          tooltip: action.tooltip,
          status: action.status,
          disabled:
            (isGroupDisabled?.(group) ?? false) ||
            action.disabled ||
            (allDevices && (action.disabledOnAllDevices ?? false)),
        });
      };
      if (group.mainAction?.pinned) {
        addAction(group.mainAction, group.mainAction.icon ?? group.icon);
      }
      for (const opt of group.options) {
        if (opt.pinned) {
          addAction(opt, opt.icon ?? "symbol-method");
        }
      }
      if (actions.length > 0) {
        result.push({ id: group.id, actions });
      }
    }
    return result;
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
  {#if groups.length > 0}
    <Tooltip.Provider>
      <Toolbar.Root class="toolbar-root" orientation="horizontal" loop>
        {#each groups as group, i}
          {#if i > 0}
            <div class="toolbar-divider"></div>
          {/if}
          {#each group.actions as action}
            <Tooltip.Root delayDuration={500}>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <Toolbar.Button
                    {...props}
                    class="toolbar-button {getStatusClass(action.status)}"
                    disabled={action.disabled || action.status === "running"}
                    onclick={() => onExecute(action.group, action.id)}
                  >
                    <span class="toolbar-icon">
                      <i class="codicon codicon-{action.icon}"></i>
                    </span>
                  </Toolbar.Button>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content class="toolbar-tooltip" sideOffset={8} collisionPadding={8}>
                  <span class="tooltip-label">{action.label}</span>
                  {#if action.tooltip}
                    <span class="tooltip-desc">{action.tooltip}</span>
                  {/if}
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          {/each}
        {/each}
      </Toolbar.Root>
    </Tooltip.Provider>
  {/if}
</div>

<style>
  .toolbar-wrapper {
    margin-bottom: 4px;
  }

  :global(.toolbar-root) {
    display: flex;
    align-items: center;
    gap: 1px;
    flex-wrap: wrap;
  }

  .toolbar-divider {
    width: 1px;
    height: 20px;
    background: var(--vscode-panel-border);
    margin: 0 3px;
  }

  :global(.toolbar-button) {
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

  :global(.toolbar-button:hover:not(:disabled)) {
    color: var(--vscode-foreground);
    background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
  }

  :global(.toolbar-button:active:not(:disabled)) {
    background: var(--vscode-toolbar-activeBackground, rgba(99, 102, 241, 0.2));
  }

  :global(.toolbar-button:disabled) {
    opacity: 0.4;
    cursor: not-allowed;
  }

  :global(.toolbar-button.status-running) {
    color: var(--vscode-focusBorder);
    animation: pulse-glow 1.5s ease-in-out infinite;
    cursor: progress;
  }

  @keyframes pulse-glow {
    0%,
    100% {
      text-shadow: 0 0 4px 1px var(--vscode-focusBorder);
      opacity: 0.7;
    }
    50% {
      text-shadow: 0 0 10px 3px var(--vscode-focusBorder);
      opacity: 1;
    }
  }

  :global(.toolbar-button.status-success) {
    color: var(--vscode-testing-iconPassed);
  }

  :global(.toolbar-button.status-error) {
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
    max-width: min(300px, calc(100vw - 16px));
    word-wrap: break-word;
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
