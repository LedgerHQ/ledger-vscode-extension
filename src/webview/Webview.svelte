<script lang="ts">
  import "@vscode-elements/elements/dist/vscode-icon/index.js";
  import { onMount } from 'svelte';
  
  let selectedApp = $state('app-boilerplate');
  let selectedTarget = $state('Stax');
  let allDevices = $state(false);
  
  // Build use case
  type BuildUseCase = 'debug' | 'release';
  let buildUseCase = $state<BuildUseCase>('debug');
  let showBuildUseCaseMenu = $state(false);
  
  const buildUseCases: { id: BuildUseCase; label: string }[] = [
    { id: 'debug', label: 'Debug' },
    { id: 'release', label: 'Release' },
  ];
  
  type CommandStatus = 'idle' | 'running' | 'success' | 'error';
  
  interface Action {
    id: string;
    label: string;
    icon: string;  // codicon name
    status: CommandStatus;
    disabledOnAllDevices?: boolean;
  }

  interface ActionGroup {
    id: string;
    title: string;
    icon: string;
    mainAction: Action;
    options: Action[];
    showOptions: boolean;
    disabledOnAllDevices?: boolean;
  }

  interface TestCase {
    id: string;
    name: string;
    selected: boolean;
  }

  let testCases = $state<TestCase[]>([
    { id: 'test_sign_tx', name: 'test_sign_tx', selected: true },
    { id: 'test_sign_message', name: 'test_sign_message', selected: true },
    { id: 'test_get_public_key', name: 'test_get_public_key', selected: true },
    { id: 'test_get_app_config', name: 'test_get_app_config', selected: true },
    { id: 'test_blind_sign', name: 'test_blind_sign', selected: false },
    { id: 'test_eip712', name: 'test_eip712', selected: false },
    { id: 'test_personal_sign', name: 'test_personal_sign', selected: true },
    { id: 'test_error_handling', name: 'test_error_handling', selected: false },
  ]);
  
  let actionGroups = $state<ActionGroup[]>([
    {
      id: 'build',
      title: 'Build',
      icon: 'tools',
      mainAction: { id: 'buildIncremental', label: 'Build App', icon: 'tools', status: 'idle' },
      options: [
        { id: 'cleanBuild', label: 'Clean & Build', icon: 'refresh', status: 'idle' },
        { id: 'cleanTarget', label: 'Clean Target Build', icon: 'trash', status: 'idle' },
        { id: 'cleanAll', label: 'Clean All Builds', icon: 'clear-all', status: 'idle' },
      ],
      showOptions: false,
    },
    {
      id: 'emulator',
      title: 'Emulator',
      icon: 'play',
      mainAction: { id: 'runEmulator', label: 'Run in Emulator', icon: 'play', status: 'idle' },
      options: [
        { id: 'killEmulator', label: 'Stop Emulator', icon: 'debug-stop', status: 'idle' },
        { id: 'restartEmulator', label: 'Restart Emulator', icon: 'debug-restart', status: 'idle' },
      ],
      showOptions: false,
      disabledOnAllDevices: true,
    },
    {
      id: 'tests',
      title: 'Tests',
      icon: 'beaker',
      mainAction: { id: 'runTests', label: 'Run Tests', icon: 'beaker', status: 'idle' },
      options: [
        { id: 'runTestsDisplay', label: 'Tests with Display', icon: 'device-desktop', status: 'idle' },
        { id: 'runTestsDevice', label: 'Tests on Device', icon: 'device-mobile', status: 'idle', disabledOnAllDevices: true },
        { id: 'generateSnapshots', label: 'Generate Snapshots', icon: 'file-media', status: 'idle' },
      ],
      showOptions: false,
    },
    {
      id: 'device',
      title: 'Device',
      icon: 'device-mobile',
      mainAction: { id: 'loadDevice', label: 'Load on Device', icon: 'cloud-upload', status: 'idle' },
      options: [
        { id: 'deleteDevice', label: 'Delete from Device', icon: 'trash', status: 'idle' },
        { id: 'quickSetup', label: 'Quick Device Setup', icon: 'zap', status: 'idle' },
      ],
      showOptions: false,
      disabledOnAllDevices: true,
    },
    {
      id: 'tools',
      title: 'Tools',
      icon: 'terminal',
      mainAction: { id: 'openTerminal', label: 'Open Terminal', icon: 'terminal', status: 'idle' },
      options: [
        { id: 'updateContainer', label: 'Update Container', icon: 'package', status: 'idle' },
        { id: 'addPrereqs', label: 'Add Prerequisites', icon: 'extensions', status: 'idle' },
        { id: 'runGuideline', label: 'Guideline Enforcer', icon: 'checklist', status: 'idle' },
      ],
      showOptions: false,
    },
  ]);

  function isGroupDisabled(group: ActionGroup): boolean {
    return allDevices && (group.disabledOnAllDevices ?? false);
  }

  function isActionDisabled(action: Action): boolean {
    return allDevices && (action.disabledOnAllDevices ?? false);
  }
  
  function executeAction(groupId: string, actionId: string) {
    const group = actionGroups.find(g => g.id === groupId);
    if (!group) return;
    
    let action = group.mainAction.id === actionId 
      ? group.mainAction 
      : group.options.find(o => o.id === actionId);
    
    if (!action) return;
    
    action.status = 'running';
    
    setTimeout(() => {
      const success = Math.random() > 0.2;
      action.status = success ? 'success' : 'error';
      
      setTimeout(() => {
        action.status = 'idle';
      }, 2000);
    }, 1500);
  }

  function toggleOptions(groupId: string) {
    const group = actionGroups.find(g => g.id === groupId);
    if (group) {
      const willOpen = !group.showOptions;
      // Close all other options first
      actionGroups.forEach(g => g.showOptions = false);
      showBuildUseCaseMenu = false;
      // Toggle the selected one
      group.showOptions = willOpen;
    }
  }

  function toggleAllTests(select: boolean) {
    testCases.forEach(t => t.selected = select);
  }

  function getSelectedTestCount(): number {
    return testCases.filter(t => t.selected).length;
  }
  
  function getStatusClass(status: CommandStatus): string {
    switch (status) {
      case 'running': return 'status-running';
      case 'success': return 'status-success';
      case 'error': return 'status-error';
      default: return '';
    }
  }
  
  function getStatusIcon(status: CommandStatus): string {
    switch (status) {
      case 'running': return 'sync';
      case 'success': return 'check';
      case 'error': return 'error';
      default: return '';
    }
  }

  function closeAllOptions() {
    actionGroups.forEach(g => g.showOptions = false);
    showBuildUseCaseMenu = false;
  }

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    // Check if click is outside any options panel or dropdown
    if (!target.closest('.options-panel') && 
        !target.closest('.gear-button') &&
        !target.closest('.build-usecase-dropdown') &&
        !target.closest('.build-usecase-badge')) {
      closeAllOptions();
    }
  }

  function selectBuildUseCase(useCase: BuildUseCase) {
    buildUseCase = useCase;
    showBuildUseCaseMenu = false;
  }

  onMount(() => {
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  });
</script>

<div class="container">
  <div class="main-content">
    <!-- Header -->
    <div class="header-section">
      <div class="header-row">
        <div class="build-usecase-wrapper">
          <button 
            class="build-usecase-badge {buildUseCase}"
            onclick={(e) => { 
              e.stopPropagation(); 
              const willOpen = !showBuildUseCaseMenu;
              actionGroups.forEach(g => g.showOptions = false);
              showBuildUseCaseMenu = willOpen; 
            }}
          >
            <i class="codicon codicon-rocket"></i>
            {buildUseCases.find(u => u.id === buildUseCase)?.label}
            <i class="codicon codicon-chevron-down chevron"></i>
          </button>
          {#if showBuildUseCaseMenu}
            <div class="build-usecase-dropdown animate-in">
              {#each buildUseCases as useCase}
                <button 
                  class="usecase-option {buildUseCase === useCase.id ? 'selected' : ''}"
                  onclick={() => selectBuildUseCase(useCase.id)}
                >
                  <i class="codicon codicon-{buildUseCase === useCase.id ? 'check' : 'blank'}"></i>
                  {useCase.label}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
      
      <!-- Configuration Card -->
      <div class="config-card">
        <div class="config-header">
          <i class="codicon codicon-settings-gear"></i>
          <h2 class="config-title">Configuration</h2>
        </div>
        <div class="config-grid">
          <div class="form-group">
            <label for="app-select">Application</label>
            <select id="app-select" bind:value={selectedApp}>
              <option value="app-boilerplate">app-boilerplate</option>
              <option value="app-sample">app-sample</option>
              <option value="app-demo">app-demo</option>
            </select>
          </div>
          <div class="form-group">
            <label for="target-select">Target Device</label>
            <select id="target-select" bind:value={selectedTarget} disabled={allDevices}>
              <option value="Stax">Stax</option>
              <option value="Nano S">Nano S</option>
              <option value="Nano X">Nano X</option>
            </select>
          </div>
        </div>
        <div class="all-devices-toggle">
          <label class="toggle-label">
            <input type="checkbox" bind:checked={allDevices} />
            <span class="toggle-text">
              <i class="codicon codicon-layers"></i>
              Build for all devices
            </span>
          </label>
          {#if allDevices}
            <span class="toggle-hint">Some actions will be disabled</span>
          {/if}
        </div>
      </div>
    </div>

    <!-- Action Groups -->
    <div class="actions-section">
      {#each actionGroups as group}
        <div class="action-group {isGroupDisabled(group) ? 'disabled' : ''}">
          <div class="action-group-header">
            <button
              onclick={() => executeAction(group.id, group.mainAction.id)}
              disabled={group.mainAction.status === 'running' || isGroupDisabled(group)}
              class="action-button main {getStatusClass(group.mainAction.status)}"
            >
              <span class="action-icon">
                <i class="codicon codicon-{group.icon}"></i>
              </span>
              <div class="action-label">
                <div class="action-title">{group.title}</div>
                <div class="action-subtitle">{group.mainAction.label}</div>
              </div>
              {#if group.mainAction.status !== 'idle'}
                <span class="status-indicator {group.mainAction.status === 'running' ? 'spin' : ''}">
                  <i class="codicon codicon-{getStatusIcon(group.mainAction.status)}"></i>
                </span>
              {/if}
            </button>
            <button 
              class="gear-button {group.showOptions ? 'active' : ''}"
              onclick={() => toggleOptions(group.id)}
              disabled={isGroupDisabled(group)}
              title="More options"
            >
              <i class="codicon codicon-settings-gear"></i>
            </button>
          </div>
          
          {#if group.showOptions && !isGroupDisabled(group)}
            <div class="options-panel animate-in">
              {#each group.options as option}
                <button
                  onclick={() => executeAction(group.id, option.id)}
                  disabled={option.status === 'running' || isActionDisabled(option)}
                  class="option-button {getStatusClass(option.status)} {isActionDisabled(option) ? 'disabled' : ''}"
                >
                  <span class="option-icon">
                    <i class="codicon codicon-{option.icon}"></i>
                  </span>
                  <span class="option-label">{option.label}</span>
                  {#if option.status !== 'idle'}
                    <span class="status-indicator small {option.status === 'running' ? 'spin' : ''}">
                      <i class="codicon codicon-{getStatusIcon(option.status)}"></i>
                    </span>
                  {/if}
                </button>
              {/each}
              
              <!-- Embedded Test Selection (only in tests group) -->
              {#if group.id === 'tests'}
                <div class="test-selector-embedded">
                  <div class="test-selector-divider"></div>
                  <div class="test-selector-header-inline">
                    <span class="test-selector-title">
                      <i class="codicon codicon-list-selection"></i>
                      Tests to run
                    </span>
                    <span class="test-count">{getSelectedTestCount()}/{testCases.length}</span>
                  </div>
                  <div class="test-quick-actions">
                    <button class="text-button" onclick={() => toggleAllTests(true)}>
                      <i class="codicon codicon-check-all"></i>
                      All
                    </button>
                    <button class="text-button" onclick={() => toggleAllTests(false)}>
                      <i class="codicon codicon-close-all"></i>
                      None
                    </button>
                  </div>
                  <div class="test-list-compact">
                    {#each testCases as test}
                      <label class="test-item-compact">
                        <input type="checkbox" bind:checked={test.selected} />
                        <span class="test-name">{test.name}</span>
                      </label>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Footer Info -->
    <div class="footer-info">
      <i class="codicon codicon-info"></i>
      <span>
        {#if allDevices}
          Building {selectedApp} for <strong>all devices</strong>
        {:else}
          Building {selectedApp} for <strong>{selectedTarget}</strong>
        {/if}
      </span>
    </div>
  </div>
</div>

<style>
  .container {
    background-color: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-font-family);
    min-height: 100vh;
    padding: 16px;
  }

  .main-content {
    max-width: 600px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .header-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .title {
    font-size: 18px;
    font-weight: 600;
    margin: 0;
  }

  /* Build Use Case Selector */
  .build-usecase-wrapper {
    position: relative;
  }

  .build-usecase-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 12px;
    background-color: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    font-size: 11px;
    border: none;
    cursor: pointer;
    transition: background-color 0.1s;
  }

  .build-usecase-badge:hover {
    background-color: var(--vscode-button-secondaryHoverBackground);
  }

  .build-usecase-badge .chevron {
    font-size: 10px;
    opacity: 0.7;
  }

  .build-usecase-dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 4px;
    min-width: 100px;
    background-color: var(--vscode-dropdown-background);
    border: 1px solid var(--vscode-dropdown-border);
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    z-index: 100;
    overflow: hidden;
  }

  .usecase-option {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 10px;
    border: none;
    background: none;
    color: var(--vscode-dropdown-foreground);
    font-size: 12px;
    cursor: pointer;
    text-align: left;
  }

  .usecase-option:hover {
    background-color: var(--vscode-list-hoverBackground);
  }

  .usecase-option.selected {
    background-color: var(--vscode-list-activeSelectionBackground);
  }

  .usecase-option .codicon-blank {
    visibility: hidden;
  }

  /* Configuration Card */
  .config-card {
    background-color: var(--vscode-sideBar-background);
    border-radius: 4px;
    border: 1px solid var(--vscode-panel-border);
    padding: 12px;
  }

  .config-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    color: var(--vscode-foreground);
  }

  .config-title {
    font-size: 13px;
    font-weight: 600;
    margin: 0;
  }

  .config-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .form-group label {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .form-group select {
    width: 100%;
    background-color: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border);
    border-radius: 2px;
    padding: 4px 6px;
    font-size: 12px;
    color: var(--vscode-input-foreground);
  }

  .form-group select:focus {
    outline: none;
    border-color: var(--vscode-focusBorder);
  }

  .form-group select:disabled {
    opacity: 0.5;
  }

  /* All Devices Toggle */
  .all-devices-toggle {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--vscode-panel-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 12px;
  }

  .toggle-label input[type="checkbox"] {
    width: 14px;
    height: 14px;
    accent-color: var(--vscode-focusBorder);
  }

  .toggle-text {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .toggle-hint {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    font-style: italic;
  }

  /* Actions Section */
  .actions-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

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
    gap: 10px;
    padding: 10px 12px;
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

  .option-button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border: none;
    border-radius: 2px;
    background-color: transparent;
    color: var(--vscode-foreground);
    cursor: pointer;
    transition: all 0.1s;
    text-align: left;
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
    color: var(--vscode-focusBorder);
  }

  .status-indicator.small {
    font-size: 12px;
  }

  .spin {
    animation: spin 1s linear infinite;
  }

  /* Embedded Test Selector (inside Tests options) */
  .test-selector-embedded {
    margin-top: 4px;
  }

  .test-selector-divider {
    height: 1px;
    background-color: var(--vscode-panel-border);
    margin: 8px 0;
  }

  .test-selector-header-inline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 10px;
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

  /* Footer */
  .footer-info {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    padding: 8px;
  }

  /* Animations */
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @keyframes fade-slide-in {
    from { 
      opacity: 0;
      transform: translateY(-4px);
    }
    to { 
      opacity: 1;
      transform: translateY(0);
    }
  }

  .animate-in {
    animation: fade-slide-in 0.15s ease-out;
  }
</style>
