import { mount } from "svelte";
import Webview from "./Webview.svelte";

document.addEventListener("DOMContentLoaded", () => {
  mount(Webview, {
    target: document.body,
    props: {
      vscode: acquireVsCodeApi(),
    },
  });
});
