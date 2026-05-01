import { readFileSync, rmSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const dist = resolve(root, "dist");
const releaseDir = resolve(root, "release");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const version = packageJson.version;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
}

function zipDirectory(sourceDir, archivePath) {
  run("zip", ["-r", "-q", archivePath, "."], { cwd: sourceDir });
}

function zipSource(archivePath) {
  run("zip", [
    "-r",
    "-q",
    archivePath,
    ".",
    "-x",
    ".git/*",
    ".agents/",
    ".agents/*",
    ".codex",
    ".codex/",
    ".codex/*",
    "dist/",
    "dist/*",
    "release/",
    "release/*",
    "node_modules/",
    "node_modules/*",
    "src/entryPoints/sidePanel/",
    "src/entryPoints/sidePanel/*",
    "src/lib/ui/panels/tabWheel/",
    "src/lib/ui/panels/tabWheel/*",
    "src/lib/ui/panels/quickControls/",
    "src/lib/ui/panels/quickControls/*",
  ]);
}

function main() {
  rmSync(releaseDir, { recursive: true, force: true });
  mkdirSync(releaseDir, { recursive: true });

  run("npm", ["run", "build:firefox"]);
  zipDirectory(dist, resolve(releaseDir, `tabwheel-firefox-v${version}.xpi`));

  run("npm", ["run", "build:chrome"]);
  zipDirectory(dist, resolve(releaseDir, `tabwheel-chrome-v${version}.zip`));

  zipSource(resolve(releaseDir, `tabwheel-source-v${version}.zip`));

  console.log("[release] Done");
  console.log(`- release/tabwheel-firefox-v${version}.xpi`);
  console.log(`- release/tabwheel-chrome-v${version}.zip`);
  console.log(`- release/tabwheel-source-v${version}.zip`);
}

try {
  main();
} catch (error) {
  console.error("[release] FAILED");
  console.error(error);
  process.exit(1);
}
