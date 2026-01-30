<script lang="ts" module>
  export interface SelectItem {
    value: string;
    label: string;
    disabled?: boolean;
  }

  export type SelectVariant = "default" | "badge";
</script>

<script lang="ts">
  import { Select, type WithoutChildren } from "bits-ui";
  import { ChevronDown, ChevronUp, Check } from "@jis3r/icons";

  interface Props {
    value?: string;
    placeholder?: string;
    items: SelectItem[];
    contentProps?: WithoutChildren<Select.ContentProps>;
    disabled?: boolean;
    onchange?: (value: string) => void;
    variant?: SelectVariant;
    icon?: string; // codicon name for badge variant
    tooltip?: string;
  }

  let {
    value = $bindable(),
    items,
    contentProps,
    placeholder = "Select...",
    disabled = false,
    onchange,
    variant = "default",
    icon,
    tooltip,
  }: Props = $props();

  const selectedLabel = $derived(items.find((item) => item.value === value)?.label);
  const triggerClassName = $derived(variant === "badge" ? "select-badge" : "select-trigger");

  // Track if change came from user interaction (dropdown was opened)
  let isUserInteraction = false;
  let isOpen = $state(false);

  function handleOpenChange(open: boolean) {
    isOpen = open;
    if (open) {
      isUserInteraction = true;
    }
  }

  function handleValueChange(newValue: string) {
    value = newValue;
    if (isUserInteraction) {
      onchange?.(newValue);
      isUserInteraction = false;
    }
  }
</script>

<Select.Root
  type="single"
  {disabled}
  {items}
  onValueChange={handleValueChange}
  onOpenChange={handleOpenChange}
>
  <Select.Trigger class={triggerClassName} title={tooltip}>
    {#if variant === "badge"}
      {#if icon}
        <i class="codicon codicon-{icon}"></i>
      {/if}
      <span class="badge-label">{selectedLabel ?? placeholder}</span>
      <i class="codicon codicon-chevron-{isOpen ? 'up' : 'down'} chevron"></i>
    {:else}
      <span class="select-value">{selectedLabel ? selectedLabel : placeholder}</span>
      <span class="select-icon">
        <ChevronDown size={14} />
      </span>
    {/if}
  </Select.Trigger>
  <Select.Portal>
    <Select.Content class="select-content" sideOffset={4} {...contentProps}>
      <Select.ScrollUpButton class="select-scroll-button">
        <ChevronUp size={12} />
      </Select.ScrollUpButton>
      <Select.Viewport class="select-viewport">
        {#each items as item (item.value)}
          <Select.Item
            value={item.value}
            label={item.label}
            disabled={item.disabled}
            class="select-item"
          >
            {#snippet children({ selected })}
              <span class="select-item-indicator">
                {#if selected}
                  <Check size={12} />
                {/if}
              </span>
              <span class="select-item-label">{item.label}</span>
            {/snippet}
          </Select.Item>
        {/each}
      </Select.Viewport>
      <Select.ScrollDownButton class="select-scroll-button">
        <ChevronDown size={12} />
      </Select.ScrollDownButton>
    </Select.Content>
  </Select.Portal>
</Select.Root>

<style>
  :global(.select-trigger) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    padding: 6px 10px;
    background-color: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border);
    border-radius: 6px;
    color: var(--vscode-input-foreground);
    font-size: 12px;
    font-family: var(--vscode-font-family);
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
    outline: none;
    min-height: 28px;
  }

  :global(.select-trigger:hover) {
    border-color: var(--vscode-focusBorder);
  }

  :global(.select-trigger:focus) {
    border-color: var(--vscode-focusBorder);
    box-shadow: 0 0 0 1px var(--vscode-focusBorder);
  }

  :global(.select-trigger[data-disabled]) {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Badge variant */
  :global(.select-badge) {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 12px;
    background-color: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    font-size: 11px;
    font-family: var(--vscode-font-family);
    border: none;
    cursor: pointer;
    transition: background-color 0.1s;
    outline: none;
    max-width: 130px;
  }

  :global(.select-badge:hover) {
    background-color: var(--vscode-button-secondaryHoverBackground);
  }

  :global(.select-badge .chevron) {
    font-size: 10px;
    opacity: 0.7;
    flex-shrink: 0;
  }

  .badge-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .select-value {
    flex: 1;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .select-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--vscode-descriptionForeground);
    flex-shrink: 0;
  }

  :global(.select-content) {
    background-color: var(--vscode-dropdown-background);
    border: 1px solid var(--vscode-dropdown-border);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    overflow: hidden;
    z-index: 1000;
    width: max-content;
    min-width: max(var(--bits-select-anchor-width), 120px);
    max-height: min(300px, var(--bits-select-content-available-height, 300px));
    animation: scaleIn 0.15s ease;
  }

  :global(.select-viewport) {
    padding: 4px;
    max-height: inherit;
    overflow-y: auto;
  }

  :global(.select-item) {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-family: var(--vscode-font-family);
    color: var(--vscode-dropdown-foreground);
    cursor: pointer;
    outline: none;
    transition: background-color 0.1s ease;
  }

  :global(.select-item:hover),
  :global(.select-item[data-highlighted]) {
    background-color: var(--vscode-list-hoverBackground);
  }

  :global(.select-item[data-selected]) {
    background-color: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }

  :global(.select-item[data-disabled]) {
    opacity: 0.5;
    cursor: not-allowed;
  }

  :global(.select-item-indicator) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    color: var(--vscode-focusBorder);
  }

  :global(.select-item-label) {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.select-scroll-button) {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
  }

  :global(.select-scroll-button:hover) {
    background-color: var(--vscode-list-hoverBackground);
  }

  @keyframes scaleIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
</style>
