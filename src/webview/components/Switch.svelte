<script lang="ts">
  import { Switch as SwitchPrimitive } from "bits-ui";

  let { checked = $bindable(false), disabled = false, ...restProps } = $props();
</script>

<SwitchPrimitive.Root bind:checked {disabled} class="switch-root" {...restProps}>
  <SwitchPrimitive.Thumb class="switch-thumb" />
</SwitchPrimitive.Root>

<style>
  :global(.switch-root) {
    display: inline-flex;
    align-items: center;
    width: 30px;
    height: 16px;
    padding: 2px;
    background-color: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border);
    border-radius: 10px;
    cursor: pointer;
    transition:
      background-color 0.2s,
      border-color 0.2s;
  }

  :global(.switch-root:focus-visible) {
    outline: none;
    border-color: var(--vscode-focusBorder);
    box-shadow: 0 0 0 2px var(--vscode-focusBorder);
  }

  :global(.switch-root[data-disabled]) {
    opacity: 0.5;
    cursor: not-allowed;
  }

  :global(.switch-root[data-state="checked"]) {
    background-color: var(--vscode-focusBorder);
    border-color: var(--vscode-focusBorder);
  }

  :global(.switch-thumb) {
    display: block;
    width: 14px;
    height: 14px;
    background-color: var(--vscode-foreground);
    border-radius: 50%;
    transition: transform 0.2s;
  }

  :global(.switch-root[data-state="checked"] .switch-thumb) {
    transform: translateX(16px);
  }

  :global(.switch-root[data-state="unchecked"] .switch-thumb) {
    transform: translateX(0);
  }
</style>
