import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import { unzipSync } from "fflate";

// Swap tests need the Exchange app (main app) and other coin apps (libraries) as prebuilt binaries.
// Each dependency repo keeps a rolling pre-release tagged `test-binaries`, rebuilt on every push to
// its master branch. It holds one zip per manifest use case, named `<use_case>.zip`, with the
// `build/<device>/bin/app.elf` files of all devices. Each zip is extracted where ragger expects
// them: `<MAIN_APP_DIR | SIDELOADED_APPS_DIR>/<repo>/`.

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
  destDir: string;
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

export function planDownloads(deps: SwapDependency[], dirs: { mainDir: string; libsDir: string }): DownloadPlanItem[] {
  return deps.map((dep) => {
    const repoSlug = dep.gitRepoUrl.replace(/\.git$/, "").split("/").slice(-2).join("/");
    const repoName = path.posix.basename(repoSlug);
    const baseDir = MAIN_APP_REPO.test(repoName) ? dirs.mainDir : dirs.libsDir;
    return { repoSlug, asset: `${dep.useCase}.zip`, destDir: path.posix.join(baseDir, repoName) };
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

function extractZip(zip: Uint8Array, destDir: string) {
  for (const [name, data] of Object.entries(unzipSync(zip))) {
    const filePath = path.resolve(destDir, name);
    if (name.endsWith("/")) {
      continue;
    }
    if (!filePath.startsWith(path.resolve(destDir) + path.sep)) {
      throw new Error(`unsafe path in zip: ${name}`);
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, data);
  }
}

// Download the swap dependencies binaries of the `test-binaries` releases and extract them. Returns the errors messages, if any.
// Without `checkForUpdates`, binaries that were already downloaded are kept without contacting GitHub.
export async function downloadSwapDependencies(
  appRoot: string,
  swapTestsDir: string,
  deps: SwapDependency[],
  checkForUpdates: boolean = true,
): Promise<string[]> {
  const conftestPath = path.join(appRoot, swapTestsDir, "conftest.py");
  const { mainDir, libsDir } = fs.existsSync(conftestPath) ? parseConftestDirs(fs.readFileSync(conftestPath, "utf8")) : {};
  if (!mainDir || !libsDir) {
    return [`MAIN_APP_DIR or SIDELOADED_APPS_DIR not found in ${conftestPath}`];
  }

  const errors: string[] = [];
  const token = getGithubToken();
  const releases = new Map<string, Promise<ReleaseInfo>>();
  for (const { repoSlug, asset, destDir } of planDownloads(deps, { mainDir, libsDir })) {
    const destPath = path.join(appRoot, destDir);
    const commitPath = path.join(destPath, ".test-binaries-commit");
    if (!checkForUpdates && fs.existsSync(commitPath)) {
      continue;
    }
    if (!releases.has(repoSlug)) {
      releases.set(repoSlug, getRelease(repoSlug, token));
    }
    try {
      const { commit, assets } = await releases.get(repoSlug)!;
      const downloaded = `${asset}@${commit}`;
      if (fs.existsSync(commitPath) && fs.readFileSync(commitPath, "utf8") === downloaded) {
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
      const zip = new Uint8Array(await res.arrayBuffer());
      // Invalidate the marker first: a failed extraction must not look like a valid download.
      fs.rmSync(commitPath, { force: true });
      extractZip(zip, destPath);
      fs.writeFileSync(commitPath, downloaded);
    }
    catch (error) {
      // Keep binaries downloaded earlier when GitHub cannot be reached.
      if (!fs.existsSync(commitPath)) {
        errors.push(`Download of ${asset} failed: ${error instanceof Error ? error.message : error}`);
      }
    }
  }
  return errors;
}
