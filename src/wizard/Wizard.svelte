<script lang="ts">
  import "@vscode-elements/elements/dist/vscode-button/index.js";
  import "@vscode-elements/elements/dist/vscode-textfield/index.js";
  import "@vscode-elements/elements/dist/vscode-single-select/index.js";
  import "@vscode-elements/elements/dist/vscode-option/index.js";
  import "@vscode-elements/elements/dist/vscode-radio-group/index.js";
  import "@vscode-elements/elements/dist/vscode-radio/index.js";
  import "@vscode-elements/elements/dist/vscode-icon/index.js";

  let { vscode } = $props();
  let step: number = $state(1);
  let coinName: string = $state("");
  let appName: string = $state("");
  let sdk: string = $state("c");
  let curve: string = $state("secp256k1");

  function createApplication() {
    console.log("Create button clicked");
    vscode.postMessage({
      command: "generateApp",
      data: {
        sdk: sdk,
        appName: appName,
        coinName: coinName,
        curve: curve,
      },
    });
  }

  function closeWizard() {
    vscode.postMessage({
      command: "closeWizard",
    });
  }
</script>

<div class="container">
  <vscode-icon name="close" id="closeBtn" close action-icon onclick={closeWizard}></vscode-icon>
  <h2 title>New Device App</h2>
  <div>
    <vscode-radio-group id="sdk-group" onchange={(e) => (sdk = e.target.value)}>
      <vscode-radio value="c" checked class="selected">
        <div class="radio-content">
          <span class="radio-title">C Language</span>
          <span class="radio-desc">Native & Compact</span>
        </div>
      </vscode-radio>
      <vscode-radio value="rust">
        <div class="radio-content">
          <span class="radio-title">Rust</span>
          <span class="radio-desc">Safe & Modern</span>
        </div>
      </vscode-radio>
    </vscode-radio-group>
  </div>

  <!-- FORM FIELDS -->
  <div>
    <label for="appName">Application Name</label>
    <input bind:value={appName} placeholder="e.g. app-ethereum" />
  </div>

  <div>
    <label for="coinName">Coin Name</label>
    <input bind:value={coinName} placeholder="e.g. SOMECOIN" />
  </div>

  <div>
    <label for="curve">Elliptic Curve</label>
    <vscode-single-select id="curve" onchange={(e) => (curve = e.target.value)}>
      <vscode-option value="secp256k1" selected
        >secp256k1 (Bitcoin/Eth)</vscode-option
      >
      <vscode-option value="ed25519">ed25519 (Solana/Polkadot)</vscode-option>
      <vscode-option value="prime256v1">prime256v1 (NIST)</vscode-option>
    </vscode-single-select>
  </div>

  <vscode-button class="create" onclick={createApplication}
    >Create Application</vscode-button
  >
</div>

<style>
  .container {
    max-width: 500px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 20px;
    position: relative;
  }

  .create {
    width: 100%;
    margin-top: 10px;
    margin-bottom: 10px;
  }

  /* Custom Card-like Styling for Radios */
  vscode-radio-group {
    display: flex;
    gap: 15px;
    width: 100%;
  }

  vscode-radio {
    flex: 1;
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-input-border);
    border-radius: 6px;
    padding: 15px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: flex-start; /* Align radio circle to top */
  }

  vscode-radio:hover {
    background: var(--vscode-list-hoverBackground);
    border-color: var(--vscode-focusBorder);
  }

  vscode-icon[close] {
    position: absolute;
    top: 10px;
    right: 4px;
  }

  h2[title] {
    margin-top: 10px;
    margin-bottom: 15px;
    font-size: 1.4em;
  }

  /* Active state styling - targeting attribute and class for safety */
  vscode-radio[checked],
  vscode-radio.selected {
    background: var(--vscode-inputOption-activeBackground);
    border-color: var(--vscode-focusBorder);
    color: var(--vscode-inputOption-activeForeground);
    outline: 1px solid var(--vscode-focusBorder);
  }

  .radio-content {
    display: flex;
    flex-direction: column;
    margin-left: 5px;
  }

  .radio-title {
    font-weight: 600;
    font-size: 1.1em;
    margin-bottom: 4px;
  }

  .radio-desc {
    font-size: 0.85em;
    opacity: 0.8;
  }

  input:not([type]) {
    background-color: var(--vscode-settings-textInputBackground, #313131);
    border: 1px solid
      var(
        --vscode-settings-textInputBorder,
        var(--vscode-settings-textInputBackground, #3c3c3c)
      );
    border-radius: 2px;
    box-sizing: border-box;
    color: var(--vscode-settings-textInputForeground, #cccccc);
    display: block;
    font-family: var(--vscode-font-family, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    font-weight: var(--vscode-font-weight, normal);
    line-height: 18px;
    outline: none;
    padding: 3px 4px;
    width: 80%;
  }

  input:focus,
  input:not([type]):focus {
    border-color: var(--vscode-focusBorder, #0078d4);
  }

  input::placeholder {
    color: var(--vscode-input-placeholderForeground, #989898);
    opacity: 1;
  }

  input:read-only:not([type="file"]) {
    cursor: not-allowed;
  }

  input:invalid {
    background-color: var(--vscode-inputValidation-errorBackground, #5a1d1d);
    border-color: var(--vscode-inputValidation-errorBorder, #be1100);
  }
</style>
