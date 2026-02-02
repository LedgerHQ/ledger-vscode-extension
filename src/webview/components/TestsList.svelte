<script lang="ts" module>
  export interface TestCase {
    id: string;
    name: string;
    selected: boolean;
  }
</script>

<script lang="ts">
  import autoAnimate from "@formkit/auto-animate";
  import Switch from "./Switch.svelte";

  interface Props {
    testCases: TestCase[];
    verboseTests?: boolean;
    isRefreshing: boolean;
    refreshTests: () => void;
    sendSelectedTests: (testCases: TestCase[]) => void;
  }

  let {
    testCases = $bindable([]),
    verboseTests = $bindable(false),
    isRefreshing,
    refreshTests,
    sendSelectedTests,
  }: Props = $props();

  function toggleAllTests(select: boolean) {
    testCases.forEach((t) => (t.selected = select));
    sendSelectedTests(testCases);
  }

  function getSelectedTestCount(): number {
    return testCases.filter((t) => t.selected).length;
  }

  function onTestChange() {
    sendSelectedTests(testCases);
  }
</script>

<div class="test-selector-embedded">
  <div class="test-selector-divider"></div>
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
      <button class="icon-button" onclick={refreshTests} title="Refresh test list">
        <i class="codicon codicon-refresh {isRefreshing ? 'spinning' : ''}"></i>
      </button>
      <span class="test-count">{getSelectedTestCount()}/{testCases.length}</span>
    </div>
  </div>
  <div class="test-quick-actions" use:autoAnimate>
    {#if !isRefreshing}
      <button class="text-button" onclick={() => toggleAllTests(true)}>
        <i class="codicon codicon-check-all"></i>
        All
      </button>
      <button class="text-button" onclick={() => toggleAllTests(false)}>
        <i class="codicon codicon-close-all"></i>
        None
      </button>
    {/if}
  </div>
  <div class="test-list-compact" use:autoAnimate>
    {#each testCases as test}
      <label class="test-item-compact">
        <input type="checkbox" bind:checked={test.selected} onchange={onTestChange} />
        <span class="test-name">{test.name}</span>
      </label>
    {/each}
  </div>
</div>

<style>
  .test-selector-embedded {
    margin-top: 4px;
  }

  .test-selector-divider {
    height: 1px;
    background-color: var(--vscode-panel-border);
    margin: 8px 0;
  }

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

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
