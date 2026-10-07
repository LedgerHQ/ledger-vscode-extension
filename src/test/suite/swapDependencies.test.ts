import * as assert from "assert";
import { getGithubToken, parseConftestDirs, planDownloads } from "../../swapDependencies";

const CONFTEST = `
configuration.OPTIONAL.BACKEND_SCOPE = "class"
configuration.OPTIONAL.MAIN_APP_DIR = "tests/swap/.test_dependencies/main"
configuration.OPTIONAL.SIDELOADED_APPS_DIR = "tests/swap/.test_dependencies/libraries/"
`;

const deps = [
  { gitRepoUrl: "https://github.com/LedgerHQ/app-exchange", useCase: "dbg_use_test_keys" },
  { gitRepoUrl: "https://github.com/LedgerHQ/app-ethereum.git", useCase: "use_test_keys" },
];

suite("Swap dependencies", () => {
  test("parseConftestDirs reads main and libraries dirs", () => {
    assert.deepStrictEqual(parseConftestDirs(CONFTEST), {
      mainDir: "tests/swap/.test_dependencies/main",
      libsDir: "tests/swap/.test_dependencies/libraries",
    });
  });

  test("parseConftestDirs returns undefined when dirs are missing", () => {
    assert.deepStrictEqual(parseConftestDirs("pytest_plugins = ()"), { mainDir: undefined, libsDir: undefined });
  });

  test("planDownloads puts exchange in main and others in libraries", () => {
    const plan = planDownloads(deps, { mainDir: "m", libsDir: "l" });
    assert.deepStrictEqual(plan, [
      { repoSlug: "LedgerHQ/app-exchange", destDir: "m/app-exchange", asset: "dbg_use_test_keys.zip" },
      { repoSlug: "LedgerHQ/app-ethereum", destDir: "l/app-ethereum", asset: "use_test_keys.zip" },
    ]);
  });

  test("planDownloads treats app-exchange-dev as the main app too", () => {
    const plan = planDownloads([{ gitRepoUrl: "https://github.com/me/app-exchange-dev", useCase: "u" }], { mainDir: "m", libsDir: "l" });
    assert.strictEqual(plan[0].destDir, "m/app-exchange-dev");
  });

  test("getGithubToken prefers the GH_TOKEN environment variable", () => {
    const saved = process.env.GH_TOKEN;
    process.env.GH_TOKEN = "token-from-env";
    try {
      assert.strictEqual(getGithubToken(), "token-from-env");
    }
    finally {
      if (saved === undefined) {
        delete process.env.GH_TOKEN;
      }
      else {
        process.env.GH_TOKEN = saved;
      }
    }
  });
});
