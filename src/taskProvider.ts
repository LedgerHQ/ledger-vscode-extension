"use strict";

import * as vscode from "vscode";

export class TaskProvider implements vscode.TaskProvider {
  // Referenced in package.json::taskDefinitions
  static TaskType = "ledger";

  public provideTasks(): vscode.Task[] {
    const wsFolders = vscode.workspace.workspaceFolders;
    if (!wsFolders || !wsFolders[0]) {
      vscode.window.showErrorMessage("no workspace open...");
      return [];
    }

    const tasks = [];

    const test = new vscode.Task(
      { type: TaskProvider.TaskType, task: "Run tests" },
      wsFolders[0],
      "Run tests",
      TaskProvider.TaskType,
      new vscode.ShellExecution("")
    );

    test.group = vscode.TaskGroup.Build;

    tasks.push(test);

    const compile = new vscode.Task(
      { type: TaskProvider.TaskType, task: "Build" },
      wsFolders[0],
      "Build",
      TaskProvider.TaskType,
      new vscode.ShellExecution("make")
    );

    compile.group = vscode.TaskGroup.Build;

    tasks.push(compile);

    const clean = new vscode.Task(
      { type: TaskProvider.TaskType, task: "Clean project" },
      wsFolders[0],
      "Clean project",
      TaskProvider.TaskType,
      new vscode.ShellExecution("make clean")
    );

    clean.group = vscode.TaskGroup.Build;

    tasks.push(clean);

    const run = new vscode.Task(
      { type: TaskProvider.TaskType, task: "Run" },
      wsFolders[0],
      "Run",
      TaskProvider.TaskType,
      new vscode.ShellExecution("")
    );

    tasks.push(run);

    return tasks;
  }

  public resolveTask(_task: vscode.Task): vscode.Task | undefined {
    // This method can be implemented to improve performance.
    // See: https://code.visualstudio.com/api/extension-guides/task-provider
    return undefined;
  }
}


