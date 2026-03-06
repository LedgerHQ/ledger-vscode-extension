"use strict";

import * as vscode from "vscode";
import * as path from "path";
import { execSync } from "child_process";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Violation {
  file: string;
  line: number;
  severity: "critical" | "high" | "warning" | "info";
  rule: string;
  message: string;
}

const SEVERITY_MAP: Record<string, vscode.DiagnosticSeverity> = {
  critical: vscode.DiagnosticSeverity.Error,
  high: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  info: vscode.DiagnosticSeverity.Information,
};

type ReviewResult = { type: "violations"; count: number; blocking: number; tokens: number } | { type: "parseError"; finalText: string; tokens: number } | null;

let selectedModel: string | undefined = undefined;

export function setSelectedModel(name: string) {
  selectedModel = name;
}

const LOG_MESSAGES = false; // Set to true to save model messages to ./logs for debugging

// ---------------------------------------------------------------------------
// Instruction file loader (hybrid: workspace submodule -> bundled fallback)
// ---------------------------------------------------------------------------

async function loadInstructionFile(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  filename: string,
): Promise<string> {
  const local = vscode.Uri.file(path.join(workspaceRoot, ".github", "instructions", filename));
  try {
    return Buffer.from(await vscode.workspace.fs.readFile(local)).toString("utf8");
  }
  catch {
    const bundled = vscode.Uri.joinPath(context.extensionUri, "resources", "instructions", filename);
    return Buffer.from(await vscode.workspace.fs.readFile(bundled)).toString("utf8");
  }
}

function instructionFilesForExt(ext: string): string[] {
  const base = ["EMBEDDED.instructions.md", "REVIEW.instructions.md"];
  if ([".c", ".h"].includes(ext)) {
    base.push("C.instructions.md");
  }
  else if (ext === ".rs") {
    base.push("RUST.instructions.md");
  }
  else if (ext === ".py") {
    base.push("PYTHON.instructions.md");
  }
  return base;
}

// ---------------------------------------------------------------------------
// Workspace tools exposed to the model
// ---------------------------------------------------------------------------

const WORKSPACE_TOOLS: vscode.LanguageModelChatTool[] = [
  {
    name: "ledger_readFile",
    description:
      "Read the full content of a file in the workspace. Use this to examine source files, "
      + "headers, or test files relevant for cross-file analysis. Path must be relative to the workspace root.",
    inputSchema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Relative path to the file, e.g. src/main.c or tests/test_sign.py",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "ledger_grepCode",
    description:
      "Search for a pattern (plain text or regex) across workspace source files. "
      + "Returns matching lines with file path and line number.",
    inputSchema: {
      type: "object" as const,
      properties: {
        pattern: {
          type: "string",
          description: "Text or regex pattern to search for, e.g. cx_hash_sha256 or THROW",
        },
        directory: {
          type: "string",
          description: "Optional directory to limit the search scope, e.g. src/",
        },
      },
      required: ["pattern"],
    },
  },
];

async function executeTool(
  name: string,
  input: Record<string, string>,
  workspaceRoot: string,
): Promise<string> {
  try {
    switch (name) {
      case "ledger_readFile": {
        const uri = vscode.Uri.file(path.join(workspaceRoot, input.path));
        const bytes = await vscode.workspace.fs.readFile(uri);
        return Buffer.from(bytes).toString("utf8");
      }
      case "ledger_grepCode": {
        const dir = input.directory ? path.join(workspaceRoot, input.directory) : workspaceRoot;
        const cmd = `rg --line-number "${input.pattern}" "${dir}" 2>/dev/null`
          + ` || grep -rn "${input.pattern}" "${dir}" 2>/dev/null | head -100`;
        const out = execSync(cmd, { encoding: "utf8", cwd: workspaceRoot });
        return out.slice(0, 8000) || "(no matches)";
      }
      default:
        return `Unknown tool: ${name}`;
    }
  }
  catch (e: any) {
    return `Error executing tool: ${e.message}`;
  }
}

// ---------------------------------------------------------------------------
// Git branch / diff helpers
// ---------------------------------------------------------------------------

const DEFAULT_BRANCHES = ["main", "master", "develop"];

interface GitContext {
  branch: string;
  isDefaultBranch: boolean;
  mergeBase: string | null;
}

function getGitContext(workspaceRoot: string): GitContext {
  let branch = "unknown";
  let defaultBranch: string | undefined = undefined;

  try {
    branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8", cwd: workspaceRoot }).trim();
  }
  catch { /* not a git repo */ }

  try {
    defaultBranch = execSync("git remote show origin | sed -n '/HEAD branch/s/.*: //p'", { encoding: "utf8", cwd: workspaceRoot }).trim() || undefined;
  }
  catch { /* no remote */ }

  // No remote — fall back to well-known names.
  if (!defaultBranch) {
    if (DEFAULT_BRANCHES.includes(branch)) {
      return { branch, isDefaultBranch: true, mergeBase: null };
    }
    // Can't determine scope without a known default branch.
    return { branch, isDefaultBranch: false, mergeBase: null };
  }

  if (branch === defaultBranch) {
    return { branch, isDefaultBranch: true, mergeBase: null };
  }

  // Try remote ref first, then local.
  let mergeBase: string | null = null;
  for (const ref of [`origin/${defaultBranch}`, defaultBranch]) {
    try {
      mergeBase = execSync(`git merge-base HEAD ${ref}`, { encoding: "utf8", cwd: workspaceRoot }).trim();
      break;
    }
    catch { /* try next */ }
  }

  return { branch, isDefaultBranch: false, mergeBase };
}

async function buildGitDiff(
  workspaceRoot: string,
  gitContext: GitContext,
  excludeFiles: string[],
  maxLength: number,
): Promise<{ diff: string; changedFiles: string[]; description: string }> {
  const excludeArgs = excludeFiles.map(f => `':(exclude)${f}'`).join(" ");
  const changedFilesSet = new Set<string>();
  let diff = "";
  let description = "";

  try {
    if (gitContext.isDefaultBranch || !gitContext.mergeBase) {
      // Only uncommitted changes (staged + unstaged)
      description = gitContext.isDefaultBranch
        ? `uncommitted changes on default branch (${gitContext.branch})`
        : `uncommitted changes on ${gitContext.branch} (merge-base not found)`;

      diff = execSync(
        `git diff HEAD ${excludeArgs}`,
        { encoding: "utf8", cwd: workspaceRoot },
      );
      execSync(`git diff --name-only HEAD`, { encoding: "utf8", cwd: workspaceRoot })
        .trim().split("\n").filter(Boolean).forEach(f => changedFilesSet.add(f));
    }
    else {
      // All branch commits since divergence + uncommitted changes
      description = `all commits + uncommitted changes on branch (${gitContext.branch})`;

      const branchDiff = execSync(
        `git diff ${gitContext.mergeBase}..HEAD ${excludeArgs}`,
        { encoding: "utf8", cwd: workspaceRoot },
      );
      const uncommitted = execSync(
        `git diff HEAD ${excludeArgs}`,
        { encoding: "utf8", cwd: workspaceRoot },
      );
      diff = branchDiff + uncommitted;

      execSync(`git diff --name-only ${gitContext.mergeBase}..HEAD`, { encoding: "utf8", cwd: workspaceRoot })
        .trim().split("\n").filter(Boolean).forEach(f => changedFilesSet.add(f));
      execSync(`git diff --name-only HEAD`, { encoding: "utf8", cwd: workspaceRoot })
        .trim().split("\n").filter(Boolean).forEach(f => changedFilesSet.add(f));
    }
  }
  catch { /* not a git repo or no changes */ }

  // Append untracked new source files as synthetic diff hunks
  try {
    const untracked = execSync(
      "git ls-files --others --exclude-standard",
      { encoding: "utf8", cwd: workspaceRoot },
    ).trim().split("\n").filter(
      f => f && [".c", ".h", ".rs", ".py"].includes(path.extname(f)) && !excludeFiles.includes(f),
    );

    for (const f of untracked) {
      try {
        const content = Buffer.from(
          await vscode.workspace.fs.readFile(vscode.Uri.file(path.join(workspaceRoot, f))),
        ).toString("utf8");
        const lines = content.split("\n").map(l => `+${l}`).join("\n");
        diff += `\n--- /dev/null\n+++ b/${f}\n@@ -0,0 +1 @@\n${lines}`;
        changedFilesSet.add(f);
      }
      catch { /* skip unreadable */ }
    }
  }
  catch { /* ignore */ }

  return {
    diff: diff.slice(0, maxLength),
    changedFiles: Array.from(changedFilesSet),
    description,
  };
}

// ---------------------------------------------------------------------------
// Main review entry point
// ---------------------------------------------------------------------------
async function folderExists(uri: vscode.Uri): Promise<boolean> {
  try {
    const stat = await vscode.workspace.fs.stat(uri);
    return stat.type === vscode.FileType.Directory;
  }
  catch {
    return false;
  }
}

async function logMessages(messages: vscode.LanguageModelChatMessage[], round: number) {
  // Check if logs directory exists, if not create it
  const logsDir = path.join(__dirname, "logs");
  if (!await folderExists(vscode.Uri.file(logsDir))) {
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(logsDir));
  }
  // Print messages and round number
  messages.forEach(async (m, i) => {
    const role = m.role;
    const content = m.content.map((p) => {
      if (p instanceof vscode.LanguageModelTextPart) {
        return p.value;
      }
      else if (p instanceof vscode.LanguageModelToolCallPart) {
        return `[ToolCall: ${p.name}(${JSON.stringify(p.input)})]`;
      }
      else if (p instanceof vscode.LanguageModelToolResultPart) {
        const text = p.content
          .map(c => (c instanceof vscode.LanguageModelTextPart ? c.value : ""))
          .join("");
        return `[ToolResult: ${text}]`;
      }
      else {
        return "[UnknownPart]";
      }
    }).join("");
    await vscode.workspace.fs.writeFile(vscode.Uri.file(`./logs/round${round + 1}_message${i + 1}.log`), Buffer.from(`Role: ${role}\nContent:\n${content}`));
  });
}

export async function runAIReview(
  context: vscode.ExtensionContext,
  diagnosticCollection: vscode.DiagnosticCollection,
  outputChannel: vscode.OutputChannel,
  appFolderUri: vscode.Uri,
): Promise<void> {
  const workspaceRoot = appFolderUri.fsPath;

  const models = await vscode.lm.selectChatModels();
  if (!models.length) {
    vscode.window.showErrorMessage(
      "Ledger AI Review: No compatible language model available. "
      + "Make sure GitHub Copilot is installed and signed in.",
    );
    return;
  }
  const model: vscode.LanguageModelChat = models.find(m => m.name === selectedModel) ?? models[0];

  const EXCLUDED_FILES = [
    ".vscode/settings.json",
    ".vscode/launch.json",
    ".vscode/tasks.json",
  ];

  const gitContext = getGitContext(workspaceRoot);
  const { diff: gitDiff, changedFiles, description: diffDescription } = await buildGitDiff(
    workspaceRoot,
    gitContext,
    EXCLUDED_FILES,
    8000,
  );

  if (!gitDiff.trim()) {
    vscode.window.showInformationMessage("Ledger AI Review: No changes to review.");
    return;
  }

  const instructionFilenames = new Set<string>([
    "EMBEDDED.instructions.md",
    "REVIEW.instructions.md",
  ]);

  for (const f of changedFiles) {
    for (const i of instructionFilesForExt(path.extname(f))) {
      instructionFilenames.add(i);
    }
  }

  const instructionParts: string[] = [];
  await Promise.all(
    Array.from(instructionFilenames).map(async (filename) => {
      try {
        const content = await loadInstructionFile(context, workspaceRoot, filename);
        instructionParts.push(`\n\n--- ${filename} ---\n${content}`);
      }
      catch { /* skip missing files */ }
    }),
  );

  // Pre-fetch workspace file list so the model has exact paths from round 1.
  const workspaceFileList = await (async () => {
    const pattern = new vscode.RelativePattern(workspaceRoot, "**/*.{c,h,rs,py}");
    const files = await vscode.workspace.findFiles(pattern, "**/node_modules/**", 300);
    return files.map(f => path.relative(workspaceRoot, f.fsPath)).join("\n") || "(none)";
  })();

  let reviewResult: ReviewResult = null;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Ledger AI Review",
      cancellable: true,
    },
    async (progress, token) => {
      progress.report({ message: "Starting analysis..." });
      outputChannel.clear();
      outputChannel.show(true);
      outputChannel.appendLine("=== Ledger AI Review ===");
      outputChannel.appendLine(`Model: ${model.name}  |  Workspace: ${workspaceRoot}`);
      outputChannel.appendLine(`Branch: ${gitContext.branch}  |  Scope: ${diffDescription}\n`);

      // Small diffs: one-shot, no tools. Larger diffs: one tool round + one verdict round.
      const MAX_ROUNDS = gitDiff.length < 3000 ? 1 : 2;

      const systemPrompt = `Apply the following rules strictly:${instructionParts.join("")}

You have access to workspace tools (ledger_readFile, ledger_grepCode).
Use them to read related files (headers, callers, test files) whenever you need cross-file context.
You have a maximum of ${MAX_ROUNDS - 1} tool-call round(s). The final round has no tools and you must output the JSON array.
Prioritise the most impactful tool calls first and avoid redundant reads.

Your entire response MUST be a raw JSON array. No text before it, no text after it, no markdown fences.
Start your response with [ and end it with ]. Schema:
[
  {
    "file": "relative/path/to/file.c",
    "line": 42,
    "severity": "critical" | "high" | "warning" | "info",
    "rule": "short-rule-id",
    "message": "Concise, actionable explanation (max 120 characters)"
  }
]
Violation messages must be 120 characters or less to ensure they are fully visible in the editor diagnostics tooltip.
If there are no violations, your entire response must be: []`;

      const userContent = `Reviewing: ${diffDescription}.\n\nWorkspace source files (use these exact paths with ledger_readFile):\n${workspaceFileList}\n\nHere is the diff:\n\`\`\`diff\n${gitDiff}\n\`\`\`\n\nReview the changed code for violations. Use tools to read related files as needed for cross-file analysis.`;

      const messages: vscode.LanguageModelChatMessage[] = [
        vscode.LanguageModelChatMessage.User(systemPrompt + "\n\n" + userContent),
      ];

      let finalText = "";
      let totalTokens = 0;

      for (let round = 0; round < MAX_ROUNDS; round++) {
        // Count input tokens for this round.
        const inputTokenCounts = await Promise.all(messages.map(m => model.countTokens(m, token)));
        totalTokens += inputTokenCounts.reduce((a, b) => a + b, 0);
        if (token.isCancellationRequested) {
          outputChannel.appendLine("\n[Cancelled by user]");
          return;
        }

        progress.report({ message: `Thinking... (round ${round + 1})` });

        // On the last round, withhold tools to force a text-only (JSON) response.
        const isLastRound = round === MAX_ROUNDS - 1;
        if (isLastRound) {
          messages.push(vscode.LanguageModelChatMessage.User(
            "This is your last round. Output your findings now as the JSON array. "
            + "No tools, no prose — start with [ and end with ].",
          ));
        }

        let response: vscode.LanguageModelChatResponse;
        try {
          if (LOG_MESSAGES) {
            await logMessages(messages, round);
          }
          response = await model.sendRequest(
            messages,
            isLastRound ? {} : { tools: WORKSPACE_TOOLS },
            token,
          );
        }
        catch (e: any) {
          outputChannel.appendLine(`[Error calling model]: ${e.message}`);
          vscode.window.showErrorMessage(`Ledger AI Review: Model error -- ${e.message}`);
          return;
        }

        const toolCalls: vscode.LanguageModelToolCallPart[] = [];
        let roundText = "";

        for await (const part of response.stream) {
          if (token.isCancellationRequested) {
            break;
          }
          if (part instanceof vscode.LanguageModelTextPart) {
            roundText += part.value;
          }
          else if (part instanceof vscode.LanguageModelToolCallPart) {
            toolCalls.push(part);
          }
        }

        if (toolCalls.length === 0) {
          finalText = roundText;
          // Count output tokens for this (final) round.
          if (roundText) {
            totalTokens += await model.countTokens(roundText, token);
          }
          break;
        }

        // Count output tokens for this tool round.
        if (roundText) {
          totalTokens += await model.countTokens(roundText, token);
        }

        const assistantParts: (vscode.LanguageModelTextPart | vscode.LanguageModelToolCallPart)[] = [
          ...toolCalls,
        ];
        if (roundText) {
          assistantParts.unshift(new vscode.LanguageModelTextPart(roundText));
        }
        messages.push(vscode.LanguageModelChatMessage.Assistant(assistantParts));

        progress.report({ message: `Fetching context (${toolCalls.length} file(s))...` });
        for (const call of toolCalls) {
          const result = await executeTool(
            call.name,
            call.input as Record<string, string>,
            workspaceRoot,
          );
          outputChannel.appendLine(
            `[tool] ${call.name}(${JSON.stringify(call.input)}) -> ${result.length} chars`,
          );
          messages.push(
            vscode.LanguageModelChatMessage.User([
              new vscode.LanguageModelToolResultPart(call.callId, [
                new vscode.LanguageModelTextPart(result),
              ]),
            ]),
          );
        }
      }

      diagnosticCollection.clear();

      try {
        // Extract the JSON array regardless of surrounding prose.
        // Search for '[' followed by optional whitespace then '{' or ']'
        // (the only valid starts of a violation array), which skips bracket
        // accesses in prose.
        const start = finalText.search(/\[\s*(?:\{|\])/);
        const end = finalText.lastIndexOf("]");
        if (start === -1 || end === -1 || end < start) {
          throw new Error("No JSON array found in model response");
        }
        const cleaned = finalText.slice(start, end + 1);

        const violations: Violation[] = JSON.parse(cleaned);
        outputChannel.appendLine(`\nFound ${violations.length} violation(s). Total tokens used: ~${totalTokens.toLocaleString()}\n`);

        const byFile = new Map<string, vscode.Diagnostic[]>();

        for (const v of violations) {
          const line = Math.max(0, v.line - 1);
          const range = new vscode.Range(line, 0, line, Number.MAX_VALUE);
          const diag = new vscode.Diagnostic(
            range,
            `[Ledger/${v.rule}] ${v.message}`,
            SEVERITY_MAP[v.severity] ?? vscode.DiagnosticSeverity.Warning,
          );
          diag.source = "Ledger AI Review";

          const absPath = path.isAbsolute(v.file)
            ? v.file
            : path.join(workspaceRoot, v.file);

          if (!byFile.has(absPath)) {
            byFile.set(absPath, []);
          }
          byFile.get(absPath)!.push(diag);

          outputChannel.appendLine(
            `  ${v.severity.toUpperCase().padEnd(8)} [${v.rule}] ${v.file}:${v.line} -- ${v.message}`,
          );
        }

        for (const [filePath, diags] of byFile) {
          diagnosticCollection.set(vscode.Uri.file(filePath), diags);
        }

        if (violations.length === 0) {
          progress.report({ message: "No violations found." });
        }
        else {
          const blocking = violations.filter(
            v => v.severity === "critical" || v.severity === "high",
          ).length;
          reviewResult = { type: "violations", count: violations.length, blocking, tokens: totalTokens };
        }
      }
      catch {
        outputChannel.appendLine(
          "\n[Raw model response -- could not parse as JSON]:\n" + finalText,
        );
        reviewResult = { type: "parseError", finalText, tokens: totalTokens };
      }
    },
  );

  // Snapshot result after withProgress closes (TypeScript CFA doesn't track
  // mutations through async callbacks, so we re-assert the type here).
  const result = reviewResult as ReviewResult;

  // Show notifications after the progress bar has fully closed
  if (result !== null && result.type === "violations") {
    const msg = `Ledger AI Review: ${result.count} violation(s) found`
      + (result.blocking > 0 ? ` — ${result.blocking} blocking (critical/high)` : "")
      + ` — ~${result.tokens.toLocaleString()} tokens used.`;
    const clicked = await vscode.window.showWarningMessage(msg, "Open Problems");
    if (clicked === "Open Problems") {
      await vscode.commands.executeCommand("workbench.actions.view.problems");
    }
  }
  else if (result !== null && result.type === "parseError") {
    const clicked = await vscode.window.showErrorMessage(
      `Ledger AI Review: Could not parse model response — ~${result.tokens.toLocaleString()} tokens used.`,
      "Show Output",
    );
    if (clicked === "Show Output") {
      outputChannel.show(true);
    }
  }
}
