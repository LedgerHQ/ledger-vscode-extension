import * as path from "path";
import Mocha = require("mocha");
import { glob } from "glob";

export async function run(): Promise<void> {
  // Create the Mocha test instance
  const mocha = new Mocha({
    ui: "tdd",
    color: true,
  });

  const testsRoot = path.resolve(__dirname, "..");

  try {
    // Use glob's promise-based API to find test files
    const files = glob.sync("**/*.test.js", { cwd: testsRoot });

    // Add each test file to the Mocha test suite
    files.forEach(file => mocha.addFile(path.resolve(testsRoot, file)));

    // Run the tests and handle results
    return new Promise((resolve, reject) => {
      mocha.run((failures: number) => {
        if (failures > 0) {
          reject(new Error(`${failures} tests failed.`));
        }
        else {
          resolve();
        }
      });
    });
  }
  catch (err) {
    console.error("Error setting up tests:", err);
    throw err;
  }
}
