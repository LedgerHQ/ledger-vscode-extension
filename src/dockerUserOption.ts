import * as vscode from "vscode";
import { platform } from "node:process";

// Helper to get Docker user option based on configuration
export function getDockerUserOpt(): string {
  const conf = vscode.workspace.getConfiguration("ledgerDevTools");
  if (conf.get<boolean>("openContainerAsRoot") === true) {
    return `--user 0`;
  }
  // On Windows, use 1000:1000 as fallback since $(id -u):$(id -g) doesn't work
  return platform === "win32" ? `--user 1000:1000` : `--user $(id -u):$(id -g)`;
}
