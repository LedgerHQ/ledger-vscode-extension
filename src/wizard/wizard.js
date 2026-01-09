// Import vscode-elements components
import "@vscode-elements/elements/dist/vscode-button/index.js";
import "@vscode-elements/elements/dist/vscode-textfield/index.js";
import "@vscode-elements/elements/dist/vscode-radio/index.js";
import "@vscode-elements/elements/dist/vscode-radio-group/index.js";
import "@vscode-elements/elements/dist/vscode-single-select/index.js";
import "@vscode-elements/elements/dist/vscode-option/index.js";
import "@vscode-elements/elements/dist/vscode-icon/index.js";

console.log("Wizard JS loaded!");

/**
 * Get element by ID or throw an error if not found
 * @param {string} id
 * @returns {HTMLElement}
 */
function getObjectOrThrow(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`${id} element not found`);
  }
  return element;
}

// Wait for DOM to be fully loaded
document.addEventListener("DOMContentLoaded", () => {
  const vscode = acquireVsCodeApi();

  // UI Logic to handle selection state styling
  const sdkGroup = getObjectOrThrow("sdk-group");

  sdkGroup.addEventListener("click", () => {
    // Defines a small timeout to let the component update its internal state
    setTimeout(() => {
      const radios = sdkGroup.querySelectorAll("vscode-radio");
      radios.forEach((r) => {
        if (r.hasAttribute("checked") || r.checked) {
          r.classList.add("selected");
        }
        else {
          r.classList.remove("selected");
        }
      });
    }, 50);
  });

  // Button click handler
  const createBtn = getObjectOrThrow("createBtn");

  createBtn.addEventListener("click", () => {
    const appName = getObjectOrThrow("appName");
    const coinName = getObjectOrThrow("coinName");
    const curve = getObjectOrThrow("curve");

    vscode.postMessage({
      command: "generateApp",
      data: {
        sdk: sdkGroup.value || "c",
        appName: appName.value || "",
        coinName: coinName.value || "",
        curve: curve.value || "",
      },
    });
  });

  const closeBtn = getObjectOrThrow("closeBtn");

  closeBtn.addEventListener("click", (e) => {
    vscode.postMessage({
      command: "closeWizard",
    });
  });

  // Handle messages sent from the extension to the webview
  window.addEventListener("message", (event) => {
    const message = event.data;
    switch (message.type) {
      case "reset":
        // Reset form if needed
        break;
    }
  });
});
