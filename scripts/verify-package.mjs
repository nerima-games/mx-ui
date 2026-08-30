import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const packageName = manifest.name;
const DEFAULT_COMMAND_TIMEOUT_MS = 120_000;
const typeScriptCompiler = join(
  root,
  "node_modules",
  "typescript",
  "bin",
  "tsc",
);

const commandLabel = (command, args) => `${command} ${args.join(" ")}`;

const run = (
  command,
  args,
  { timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS, ...options } = {},
) => {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
    timeout: timeoutMs,
    killSignal: "SIGTERM",
    ...options,
  });
  if (result.error) {
    throw new Error(
      `${commandLabel(command, args)} failed: ${result.error.message}`,
    );
  }
  if (result.signal) {
    throw new Error(
      `${commandLabel(command, args)} terminated by ${result.signal}`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `${commandLabel(command, args)} exited with status ${result.status}`,
    );
  }
  return result;
};

const capture = (
  command,
  args,
  { timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS, ...options } = {},
) => {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: timeoutMs,
    killSignal: "SIGTERM",
    ...options,
  });
  if (result.error) {
    throw new Error(
      `${commandLabel(command, args)} failed: ${result.error.message}`,
    );
  }
  if (result.signal) {
    throw new Error(
      `${commandLabel(command, args)} terminated by ${result.signal}`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `${commandLabel(command, args)} exited with status ${result.status}\n${result.stdout ?? ""}${result.stderr ?? ""}`,
    );
  }
  return result.stdout;
};

// mx-ui declares no `exports` subpaths — docs/public-api.md's contract is the
// single barrel (`index.ts`); a subpath would need its own line in that
// document before it could be added here (see the repository's hard rule
// against adding subpaths just to satisfy this script). So, unlike
// mc-kernel's copy of this script, there is no per-subpath domain-entrypoint
// reconciliation: only "does the declared root export resolve, at runtime and
// in type-space, to the contract docs/public-api.md §5 names".
const exportEntries = Object.entries(manifest.exports ?? {});
if (exportEntries.length !== 1 || exportEntries[0][0] !== ".") {
  throw new Error(
    "package.json#exports must declare exactly the root entry '.' — mx-ui has no subpath contract (docs/public-api.md)",
  );
}

const targetPaths = new Set();
for (const [subpath, target] of exportEntries) {
  if (typeof target !== "object" || target === null) {
    throw new Error(`Unsupported export declaration for ${subpath}`);
  }
  for (const field of ["types", "import", "default"]) {
    if (typeof target[field] === "string") {
      targetPaths.add(target[field]);
    }
  }
}
if (targetPaths.size === 0) {
  throw new Error("package.json exports do not contain any target paths");
}

const workspace = await mkdtemp(join(tmpdir(), "mx-ui-package-"));
const packDirectory = join(workspace, "pack");
const consumerDirectory = join(workspace, "consumer");
await mkdir(packDirectory);
await mkdir(consumerDirectory);

try {
  run("pnpm", ["pack", "--pack-destination", packDirectory], {
    timeoutMs: 60_000,
  });

  const archives = (await readdir(packDirectory)).filter((entry) =>
    entry.endsWith(".tgz"),
  );
  if (archives.length !== 1) {
    throw new Error(
      `Expected exactly one package archive, found ${archives.length}`,
    );
  }

  const archivePath = join(packDirectory, archives[0]);
  const archiveStat = await stat(archivePath);
  if (archiveStat.size === 0) {
    throw new Error("Package archive is empty");
  }

  const archiveEntries = new Set(
    capture("tar", ["-tzf", archivePath], { cwd: root, timeoutMs: 30_000 })
      .trim()
      .split("\n")
      .filter(Boolean),
  );
  for (const targetPath of targetPaths) {
    const archiveEntry = `package/${targetPath.replace(/^\.\//, "")}`;
    if (!archiveEntries.has(archiveEntry)) {
      throw new Error(
        `Package archive is missing export target ${archiveEntry}`,
      );
    }
  }

  // Addendum 3 (org decision, 2026-08-30): the consumer install below
  // resolves @nerima-games/mc-kernel, @nerima-games/mc-sim and
  // @nerima-games/mc-audio — all real `dependencies` of the packed tarball —
  // from GitHub Packages. A plain `npm install` in this temp directory has no
  // token of its own (CI's `pnpm config set --location=user` step only
  // configures pnpm's user-level config, which this npm subprocess does not
  // read), so it must be given one explicitly. `${NODE_AUTH_TOKEN}` is the
  // literal npm placeholder syntax, expanded by npm itself from its own
  // process environment at install time — the token value is never written to
  // disk by this script.
  await writeFile(
    join(consumerDirectory, ".npmrc"),
    // Backtick, not a plain quoted string: `\$` escapes the dollar sign so
    // this is literal npm-config placeholder syntax, not a JS interpolation
    // this script forgot to write — npm expands it from ITS OWN process
    // environment at install time.
    `@nerima-games:registry=https://npm.pkg.github.com\n//npm.pkg.github.com/:_authToken=\${NODE_AUTH_TOKEN}\n`,
  );
  await writeFile(
    join(consumerDirectory, "package.json"),
    `${JSON.stringify(
      {
        name: "mx-ui-package-consumer",
        private: true,
        type: "module",
      },
      null,
      2,
    )}\n`,
  );
  run(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", archivePath],
    {
      cwd: consumerDirectory,
      timeoutMs: 180_000,
    },
  );

  // Runtime probe: the packed tarball's root export must resolve, and must
  // expose the CONTRACT-tier names docs/public-api.md §5 lists (the stage
  // registration surface consumed by mc-compose, and the mount surface §4-1
  // describes). It deliberately does not re-probe the "visible but not
  // public" view-model/domain exports (docs/public-api.md §6) — those are
  // exercised by the unit suite against source, not by this boundary check,
  // whose job is "did dist/ ship what src/ promises", not "is the domain
  // logic correct".
  const probe = `
    const packageName = ${JSON.stringify(packageName)};
    const module = await import(packageName);
    if (Object.keys(module).length === 0) {
      throw new Error('The root export has no runtime exports');
    }
    if (typeof module.uiStages !== 'function') {
      throw new Error('The root export does not expose uiStages');
    }
    if (typeof module.makeUiStages !== 'object' && typeof module.makeUiStages !== 'function') {
      throw new Error('The root export does not expose makeUiStages');
    }
    if (typeof module.makeUiFrameState !== 'object' && typeof module.makeUiFrameState !== 'function') {
      throw new Error('The root export does not expose makeUiFrameState');
    }
    if (typeof module.UI_STAGE_IDS !== 'object' || module.UI_STAGE_IDS === null) {
      throw new Error('The root export does not expose UI_STAGE_IDS');
    }
    if (typeof module.UI_STAGE_IDS.hudSync !== 'string' || typeof module.UI_STAGE_IDS.overlaySync !== 'string') {
      throw new Error('UI_STAGE_IDS is missing hudSync/overlaySync');
    }
    if (typeof module.UPSTREAM_STAGE_IDS !== 'object' || typeof module.UPSTREAM_STAGE_IDS.simPhysics !== 'string') {
      throw new Error('The root export does not expose UPSTREAM_STAGE_IDS.simPhysics');
    }
    if (typeof module.makeUiMount !== 'function') {
      throw new Error('The root export does not expose makeUiMount (docs/public-api.md §4-1)');
    }
    if (typeof module.createHudView !== 'function' || typeof module.EXPERIENCE_TRANSITION_MS !== 'number') {
      throw new Error('The root export does not expose the hud-view contract');
    }
    if (typeof module.createCaptionView !== 'function') {
      throw new Error('The root export does not expose createCaptionView');
    }
    if (typeof module.createInventoryView !== 'function') {
      throw new Error('The root export does not expose createInventoryView');
    }
    if (typeof module.createSaveIndicator !== 'function') {
      throw new Error('The root export does not expose createSaveIndicator');
    }
    if (typeof module.applyColorVision !== 'function' || typeof module.colorVisionCell !== 'function') {
      throw new Error('The root export does not expose the accessibility-dom contract');
    }
    // Actually execute the two Effect-valued exports mc-compose runs every
    // frame; RIn is documented as \`never\` (docs/public-api.md §4), so this
    // needs no host services to complete.
    const { Effect } = await import('effect');
    const frameState = await Effect.runPromise(module.makeUiFrameState);
    const stages = module.uiStages(frameState);
    if (!Array.isArray(stages) || stages.length !== 2) {
      throw new Error('uiStages(makeUiFrameState result) did not return the two documented stages');
    }
    const stageIds = stages.map((stage) => stage.id);
    if (!stageIds.includes(module.UI_STAGE_IDS.hudSync) || !stageIds.includes(module.UI_STAGE_IDS.overlaySync)) {
      throw new Error('uiStages did not register UI_STAGE_IDS.hudSync/overlaySync');
    }
    const stagesFromEffect = await Effect.runPromise(module.makeUiStages);
    if (!Array.isArray(stagesFromEffect) || stagesFromEffect.length !== 2) {
      throw new Error('makeUiStages did not resolve to the two documented stages');
    }
    process.stdout.write(\`verified \${packageName} exports: \${packageName}\\n\`);
  `;
  run("node", ["--input-type=module", "--eval", probe], {
    cwd: consumerDirectory,
    timeoutMs: 30_000,
  });

  // Type probe: a TypeScript consumer against the packed declarations, using
  // the same contract-tier names as the runtime probe above.
  const typeConsumerSource = `
import {
  uiStages,
  makeUiStages,
  makeUiFrameState,
  UI_STAGE_IDS,
  UPSTREAM_STAGE_IDS,
  makeUiMount,
  createHudView,
  EXPERIENCE_TRANSITION_MS,
  createCaptionView,
  createInventoryView,
  createSaveIndicator,
  applyColorVision,
  colorVisionCell,
  type UiMount,
  type UiMountOptions,
  type HudView,
} from ${JSON.stringify(packageName)}
import { Effect } from 'effect'

const hudSync: string = UI_STAGE_IDS.hudSync
const overlaySync: string = UI_STAGE_IDS.overlaySync
const simPhysics: string = UPSTREAM_STAGE_IDS.simPhysics
const transitionMs: number = EXPERIENCE_TRANSITION_MS

const program = Effect.gen(function* () {
  const state = yield* makeUiFrameState
  const stages = uiStages(state)
  const stagesFromEffect = yield* makeUiStages
  return { stages, stagesFromEffect }
})

const mountType: (options: UiMountOptions) => UiMount = makeUiMount
const hudViewType: typeof createHudView = createHudView
const captionViewType: typeof createCaptionView = createCaptionView
const inventoryViewType: typeof createInventoryView = createInventoryView
const saveIndicatorType: typeof createSaveIndicator = createSaveIndicator
const colorVisionType: typeof applyColorVision = applyColorVision
const colorVisionCellType: typeof colorVisionCell = colorVisionCell

void hudSync
void overlaySync
void simPhysics
void transitionMs
void program
void mountType
void hudViewType
void captionViewType
void inventoryViewType
void saveIndicatorType
void colorVisionType
void colorVisionCellType
`;
  if (typeConsumerSource.trim().length === 0) {
    throw new Error("TypeScript consumer source must not be empty");
  }
  await writeFile(
    join(consumerDirectory, "consumer.ts"),
    typeConsumerSource.trimStart(),
  );
  await writeFile(
    join(consumerDirectory, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          lib: ["ES2024", "DOM", "DOM.Iterable"],
          noEmit: true,
          skipLibCheck: false,
        },
        files: ["consumer.ts"],
      },
      null,
      2,
    )}\n`,
  );
  run(
    process.execPath,
    [
      typeScriptCompiler,
      "--project",
      join(consumerDirectory, "tsconfig.json"),
      "--pretty",
      "false",
    ],
    { cwd: consumerDirectory, timeoutMs: 30_000 },
  );
  process.stdout.write(`verified ${packageName} declaration consumer typecheck\n`);

  process.stdout.write(`verified package archive ${relative(root, archivePath)}\n`);
} finally {
  await rm(workspace, { recursive: true, force: true });
}
