<script lang="ts" module>
  export interface TestCase {
    id: string;
    name: string;
    selected: boolean;
  }

  interface TestGroup {
    file: string;
    tests: TestCase[];
    collapsed: boolean;
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

  let searchQuery = $state('');
  let collapsedFiles = $state<Set<string>>(new Set());

  let groups = $derived.by<TestGroup[]>(() => {
    const map = new Map<string, TestCase[]>();
    for (const t of testCases) {
      const parts = t.id.split("::");
      const file = parts.length > 1 ? parts.slice(0, parts.length - 1).join("::") : '';
      if (!map.has(file)) map.set(file, []);
      map.get(file)!.push(t);
    }
    return Array.from(map.entries()).map(([file, tests]) => ({
      file,
      tests,
      collapsed: collapsedFiles.has(file),
    }));
  });

  let filteredGroups = $derived.by<TestGroup[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        tests: q ? g.tests.filter((t) => t.name.toLowerCase().includes(q)) : g.tests,
      }))
      .filter((g) => g.tests.length > 0);
  });

  let filteredTests = $derived.by<TestCase[]>(() =>
    filteredGroups.flatMap((g) => g.tests)
  );

  function toggleAllTests(select: boolean) {
    testCases.forEach((t) => (t.selected = select));
    sendSelectedTests(testCases);
  }

  function toggleFilteredTests(select: boolean) {
    const ids = new Set(filteredTests.map((t) => t.id));
    testCases.forEach((t) => {
      if (ids.has(t.id)) t.selected = select;
    });
    sendSelectedTests(testCases);
  }

  function getSelectedTestCount(): number {
    return testCases.filter((t) => t.selected).length;
  }

  function onTestChange() {
    sendSelectedTests(testCases);
  }

  function toggleFile(file: string) {
    const next = new Set(collapsedFiles);
    if (next.has(file)) next.delete(file);
    else next.add(file);
    collapsedFiles = next;
  }

  function isFileCollapsed(file: string): boolean {
    return collapsedFiles.has(file);
  }

  function fileLabel(file: string): string {
    return file || '(root)';
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
      {#if !isRefreshing}
        <button class="icon-button" onclick={() => toggleAllTests(true)} title="Select all">
          <i class="codicon codicon-check-all"></i>
        </button>
        <button class="icon-button" onclick={() => toggleAllTests(false)} title="Deselect all">
          <i class="codicon codicon-close-all"></i>
        </button>
      {/if}
      <button class="icon-button" onclick={refreshTests} title="Refresh test list">
        <i class="codicon codicon-refresh {isRefreshing ? 'spinning' : ''}"></i>
      </button>
      <span class="test-count">{getSelectedTestCount()}/{testCases.length}</span>
    </div>
  </div>
  <div class="test-search">
    <i class="codicon codicon-search search-icon"></i>
    <input
      type="text"
      class="search-input"
      placeholder="Filter tests..."
      bind:value={searchQuery}
    />
    {#if searchQuery}
      <button class="icon-button" onclick={() => toggleFilteredTests(true)} title="Select filtered">
        <i class="codicon codicon-check"></i>
      </button>
      <button class="icon-button" onclick={() => toggleFilteredTests(false)} title="Deselect filtered">
        <i class="codicon codicon-dash"></i>
      </button>
      <button class="icon-button clear-button" onclick={() => (searchQuery = '')} title="Clear filter">
        <i class="codicon codicon-x"></i>
      </button>
    {/if}
  </div>
  <div class="test-quick-actions" use:autoAnimate></div>
  <div class="test-list-compact">
    {#each filteredGroups as group (group.file)}
      {#if group.file}
        <button class="file-header" onclick={() => toggleFile(group.file)} title={group.file}>
          <i class="codicon {isFileCollapsed(group.file) ? 'codicon-chevron-right' : 'codicon-chevron-down'} collapse-icon"></i>
          <i class="codicon codicon-file file-icon"></i>
          <span class="file-name">{fileLabel(group.file)}</span>
        </button>
      {/if}
      {#if !isFileCollapsed(group.file)}
        <div class="file-tests" use:autoAnimate>
          {#each group.tests as test (test.id)}
            <label class="test-item-compact {group.file ? 'indented' : ''}" title={test.id}>
              <input type="checkbox" bind:checked={test.selected} onchange={onTestChange} />
              <span class="test-name">{test.name}</span>
            </label>
          {/each}
        </div>
      {/if}
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
    gap: 4px;
  }

  .icon-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
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
    gap: 4px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .test-count {
    font-size: 10px;
    background-color: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    padding: 1px 5px;
    border-radius: 8px;
  }

  .test-search {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
  }

  .search-icon {
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    flex-shrink: 0;
  }

  .search-input {
    flex: 1;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
    padding: 2px 4px;
    font-size: 11px;
    outline: none;
    min-width: 0;
  }

  .search-input:focus {
    border-color: var(--vscode-focusBorder);
  }

  .search-input::placeholder {
    color: var(--vscode-input-placeholderForeground);
  }

  .clear-button {
    flex-shrink: 0;
  }

  .test-quick-actions {
    display: flex;
    gap: 8px;
    padding: 2px 10px 6px;
  }

  .test-list-compact {
    display: flex;
    flex-direction: column;
    max-height: 250px;
    overflow-y: auto;
    padding: 0 4px;
  }

  .file-header {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 3px 6px;
    border: none;
    background: none;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    border-radius: 2px;
    font-size: 11px;
    text-align: left;
  }

  .file-header:hover {
    background-color: var(--vscode-list-hoverBackground);
    color: var(--vscode-foreground);
  }

  .collapse-icon {
    font-size: 10px;
    flex-shrink: 0;
  }

  .file-icon {
    font-size: 11px;
    flex-shrink: 0;
  }

  .file-name {
    font-family: var(--vscode-editor-font-family);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-tests {
    display: flex;
    flex-direction: column;
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

  .test-item-compact.indented {
    padding-left: 22px;
  }

  .test-item-compact:hover {
    background-color: var(--vscode-list-hoverBackground);
  }

  .test-item-compact input[type="checkbox"] {
    width: 12px;
    height: 12px;
    accent-color: var(--vscode-focusBorder);
    flex-shrink: 0;
  }

  .test-name {
    font-family: var(--vscode-editor-font-family);
    color: var(--vscode-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
