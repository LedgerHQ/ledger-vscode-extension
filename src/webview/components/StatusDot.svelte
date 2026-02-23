<script lang="ts">
  import { Tooltip } from "bits-ui";
  import type { ContainerStatus } from "../../types";

  interface Props {
    vscode: any;
    status: ContainerStatus;
    imageOutdated?: boolean;
  }

  let { vscode, status, imageOutdated = false }: Props = $props();

  const color = $derived.by(() => {
    switch (status) {
      case "running":
        return imageOutdated
          ? "var(--vscode-editorWarning-foreground)"
          : "var(--vscode-testing-iconPassed)";
      case "stopped":
        return "var(--vscode-testing-iconFailed)";
      case "syncing":
        return "var(--vscode-testing-iconQueued)";
    }
  });

  const label = $derived.by(() => {
    switch (status) {
      case "running":
        return "Container running";
      case "stopped":
        return "Container stopped";
      case "syncing":
        return "Container syncing";
    }
  });
</script>

<Tooltip.Provider delayDuration={200}>
  <Tooltip.Root>
    <Tooltip.Trigger class="status-dot-trigger">
      <span class="status-dot" style="background-color: {color};"></span>
    </Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Content class="status-tooltip" sideOffset={6}>
        <div class="status-row">
          <i class="codicon codicon-vm"></i>
          {label}
        </div>
        {#if imageOutdated}
          <div class="warning-label">
            <i class="codicon codicon-warning"></i>
            <button
              class="warning-link"
              onclick={() =>
                vscode.postMessage({
                  command: "executeTask",
                  taskName: "Update Container",
                })}
            >
              Image is outdated. Click to update.
            </button>
          </div>
        {/if}
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>
</Tooltip.Provider>

<style>
  :global(.status-dot-trigger) {
    all: unset;
    display: flex;
    align-items: center;
    padding: 6px;
    margin: -6px;
    cursor: default;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    transition: background-color 0.2s;
  }

  :global(.status-tooltip) {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 10px;
    background-color: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-editorWidget-border);
    border-radius: 4px;
    font-size: 11px;
    color: var(--vscode-foreground);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    z-index: 1000;
  }

  .status-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .warning-label {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--vscode-editorWarning-foreground);
    font-size: 11px;
  }

  .warning-link {
    background: none;
    border: none;
    padding: 0;
    color: var(--vscode-editorWarning-foreground);
    font-size: 11px;
    cursor: pointer;
    text-decoration: underline;
  }

  .warning-link:hover {
    opacity: 0.8;
  }
</style>
