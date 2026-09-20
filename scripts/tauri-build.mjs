import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const tauriCli = require.resolve("@tauri-apps/cli/tauri.js");
const environment = { ...process.env };

if (process.platform === "linux") {
  environment.NO_STRIP = "YES";
}

const child = spawn(
  process.execPath,
  [tauriCli, "build", ...process.argv.slice(2)],
  {
    env: environment,
    stdio: "inherit",
  },
);

child.on("error", (error) => {
  console.error(`Failed to start the Tauri build: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Tauri build stopped by signal ${signal}.`);
    process.exitCode = 1;
    return;
  }

  process.exitCode = code ?? 1;
});
