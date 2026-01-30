<script lang="ts">
  import type { BadgeStatus } from "../../types";

  let expanded = $state(false);

  interface Props {
    status?: BadgeStatus;
    label?: string;
  }

  let { status = "running" }: Props = $props();

  let color = $derived.by(() => {
    switch (status) {
      case "running":
        return "var(--vscode-testing-iconPassed)";
      case "stopped":
        return "var(--vscode-testing-iconFailed)";
      case "syncing":
        return "var(--vscode-testing-iconQueued)";
      default:
        return "var(--vscode-badge-foreground)";
    }
  });

  let label = $derived.by(() => {
    switch (status) {
      case "running":
        return "Container running";
      case "stopped":
        return "Container stopped";
      case "syncing":
        return "Container syncing";
      default:
        return "Container status unknown";
    }
  });
</script>

<span
  class="badge"
  class:expanded
  role="status"
  onmouseenter={() => (expanded = true)}
  onmouseleave={() => (expanded = false)}
>
  <i class="icon codicon codicon-circle-filled" style="color: {color};"></i>
  <span class="text">{label}</span>
</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    margin-bottom: 8px;
    background-color: transparent;
    border: none;
    border-radius: 12px;
    cursor: pointer;
    font-family: var(--vscode-font-family);
    font-size: 11px;
    color: var(--vscode-badge-foreground);
    transition: background-color 0.1s;
    overflow: hidden;
    white-space: nowrap;
    outline: none;
  }

  .badge:hover {
    background-color: var(--vscode-button-secondaryHoverBackground);
  }

  .icon {
    font-size: 11px;
    transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .text {
    max-width: 0;
    opacity: 0;
    transform: translateX(-10px);
    transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .badge.expanded {
    padding: 4px 10px;
    background-color: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }

  .badge.expanded .text {
    max-width: 200px;
    opacity: 1;
    margin-left: 4px;
    transform: translateX(0);
  }
</style>
