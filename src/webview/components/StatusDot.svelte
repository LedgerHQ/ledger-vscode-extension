<script lang="ts">
  import { Tooltip } from "bits-ui";
  import type { BadgeStatus } from "../../types";

  interface Props {
    status: BadgeStatus;
  }

  let { status }: Props = $props();

  const color = $derived.by(() => {
    switch (status) {
      case "running":
        return "var(--vscode-testing-iconPassed)";
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
        <i class="codicon codicon-vm"></i>
        {label}
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
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background-color: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-editorWidget-border);
    border-radius: 4px;
    font-size: 11px;
    color: var(--vscode-foreground);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    z-index: 1000;
  }
</style>
