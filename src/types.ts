/**
 * Shared types - used by both extension and webview
 * This file must NOT import any Node.js or VS Code modules
 */

// App language types
export const validLanguages = ["rust", "c"] as const;
export type AppLanguage = (typeof validLanguages)[number];

// Task types
type CustomTaskFunction = () => void;
export type ExecBuilder = () => string | [string, CustomTaskFunction];
export type TaskTargetLanguage = AppLanguage | "Both";
export type BuilderForLanguage = Partial<Record<TaskTargetLanguage, ExecBuilder>>;

export type TaskState = "enabled" | "disabled" | "unavailable";
export type BehaviorWhenAllTargetsSelected = "enable" | "disable" | "executeForEveryTarget";

export interface TaskSpec {
  group?: string;
  name: string;
  label?: string;
  toolTip?: string;
  icon?: string;
  builders: BuilderForLanguage;
  dependsOn?: ExecBuilder;
  state: TaskState;
  allSelectedBehavior: BehaviorWhenAllTargetsSelected;
  mainCommand?: boolean;
}

// Container types
/**
 * Status of the Docker container
 */
export type BadgeStatus = "running" | "stopped" | "syncing";
