import * as vscode from "vscode";
import { platform } from "node:process";
import { execSync } from "node:child_process";

// Helper to get Docker user option based on configuration
export function getDockerUserOpt(): string {
  const conf = vscode.workspace.getConfiguration("ledgerDevTools");
  if (conf.get<boolean>("openContainerAsRoot") === true) {
    return `--user 0`;
  }
  // On Windows, use 1000:1000 as fallback since id command doesn't exist
  if (platform === "win32") {
    return `--user 1000:1000`;
  }
  // On Linux/macOS, get the actual user and group IDs
  try {
    const uid = execSync("id -u", { encoding: "utf-8" }).trim();
    const gid = execSync("id -g", { encoding: "utf-8" }).trim();
    return `--user ${uid}:${gid}`;
  } catch (error) {
    // Fallback if id command fails
    return `--user 1000:1000`;
  }
}
