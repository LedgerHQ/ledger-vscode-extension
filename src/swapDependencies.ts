import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";

// Swap tests need the Exchange app (main app) and other coin apps (libraries) as prebuilt binaries.
// Each dependency repo keeps a rolling pre-release tagged `test-binaries`, rebuilt on every push to
// its develop branch. It holds one asset per manifest use case and device, named
// `<use_case>-<device>.elf`. They are downloaded where ragger expects them:
// `<MAIN_APP_DIR | SIDELOADED_APPS_DIR>/<repo>/build/<device>/bin/app.elf`.

const MAIN_APP_REPO = /^app-exchange(-dev)?$/;
const RELEASE_TAG = "test-binaries";

export interface SwapDependency {
  gitRepoUrl: string;
  useCase: string;
}

export interface ConftestDirs {
  mainDir?: string;
  libsDir?: string;
}

export interface DownloadPlanItem {
  repoSlug: string;
  asset: string;
  dest: string;
}

interface ReleaseInfo {
  commit: string;
  assets: Map<string, number>;
}

// Read the dependencies directories configured in the swap conftest.py (ragger options).
export function parseConftestDirs(conftest: string): ConftestDirs {
  const read = (option: string) => conftest.match(new RegExp(`${option}\\s*=\\s*["']([^"']+?)/?["']`))?.[1];
  return { mainDir: read("MAIN_APP_DIR"), libsDir: read("SIDELOADED_APPS_DIR") };
}

export function planDownloads(deps: SwapDependency[], devices: string[], dirs: { mainDir: string; libsDir: string }): DownloadPlanItem[] {
  return deps.flatMap((dep) => {
    const repoSlug = dep.gitRepoUrl.replace(/\.git$/, "").split("/").slice(-2).join("/");
    const repoName = path.posix.basename(repoSlug);
    const baseDir = MAIN_APP_REPO.test(repoName) ? dirs.mainDir : dirs.libsDir;
    return devices.map(device => ({
      repoSlug,
      asset: `${dep.useCase}-${device}.elf`,
      dest: path.posix.join(baseDir, repoName, "build", device, "bin", "app.elf"),
    }));
  });
}

// Token for private repositories (and a higher API rate limit): GH_TOKEN, GITHUB_TOKEN, else the `gh` CLI login.
export function getGithubToken(): string | undefined {
  const fromEnv = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (fromEnv) {
    return fromEnv;
  }
  try {
    return cp.execFileSync("gh", ["auth", "token"], { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined;
  }
  catch {
    return undefined;
  }
}

async function github(apiPath: string, token: string | undefined, accept = "application/vnd.github+json"): Promise<Response> {
  const headers: Record<string, string> = { Accept: accept };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return fetch(`https://api.github.com/${apiPath}`, { headers });
}

// The release tag is moved to the commit the binaries were built from: its SHA tells if they changed.
async function getRelease(repoSlug: string, token: string | undefined): Promise<ReleaseInfo> {
  const ref = await github(`repos/${repoSlug}/git/ref/tags/${RELEASE_TAG}`, token);
  const release = await github(`repos/${repoSlug}/releases/tags/${RELEASE_TAG}`, token);
  if (!ref.ok || !release.ok) {
    throw new Error(`${repoSlug} release '${RELEASE_TAG}' not found (HTTP ${ref.ok ? release.status : ref.status}). Private repository? Set GH_TOKEN or log in with 'gh auth login'.`);
  }
  const assets = (await release.json() as { assets: { name: string; id: number }[] }).assets;
  return {
    commit: (await ref.json() as { object: { sha: string } }).object.sha,
    assets: new Map(assets.map(asset => [asset.name, asset.id])),
  };
}

// Download the swap dependencies binaries of the `test-binaries` releases. Returns the errors messages, if any.
export async function downloadSwapDependencies(
  appRoot: string,
  swapTestsDir: string,
  deps: SwapDependency[],
  devices: string[],
): Promise<string[]> {
  const conftestPath = path.join(appRoot, swapTestsDir, "conftest.py");
  const { mainDir, libsDir } = fs.existsSync(conftestPath) ? parseConftestDirs(fs.readFileSync(conftestPath, "utf8")) : {};
  if (!mainDir || !libsDir) {
    return [`MAIN_APP_DIR or SIDELOADED_APPS_DIR not found in ${conftestPath}`];
  }

  const errors: string[] = [];
  const token = getGithubToken();
  const releases = new Map<string, Promise<ReleaseInfo>>();
  for (const { repoSlug, asset, dest } of planDownloads(deps, devices, { mainDir, libsDir })) {
    const destPath = path.join(appRoot, dest);
    const commitPath = `${destPath}.commit`;
    if (!releases.has(repoSlug)) {
      releases.set(repoSlug, getRelease(repoSlug, token));
    }
    try {
      const { commit, assets } = await releases.get(repoSlug)!;
      if (fs.existsSync(destPath) && fs.existsSync(commitPath) && fs.readFileSync(commitPath, "utf8") === commit) {
        continue;
      }
      const assetId = assets.get(asset);
      if (assetId === undefined) {
        throw new Error(`asset ${asset} not found in ${repoSlug} release '${RELEASE_TAG}'`);
      }
      const res = await github(`repos/${repoSlug}/releases/assets/${assetId}`, token, "application/octet-stream");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, Buffer.from(await res.arrayBuffer()));
      fs.writeFileSync(commitPath, commit);
    }
    catch (error) {
      // Keep a binary downloaded earlier when GitHub cannot be reached.
      if (!fs.existsSync(destPath)) {
        errors.push(`Download of ${asset} failed: ${error instanceof Error ? error.message : error}`);
      }
    }
  }
  return errors;
}
