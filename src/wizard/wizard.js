import { mount } from "svelte";
import Wizard from "./Wizard.svelte";

document.addEventListener("DOMContentLoaded", () => {
  mount(Wizard, {
    target: document.body,
    props: {
      vscode: acquireVsCodeApi(),
    },
  });
});
