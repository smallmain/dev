import { spawn } from "node:child_process";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { stdin, stdout } from "node:process";
import { emitKeypressEvents } from "node:readline";
import {
  getAuthor,
  getDependencyVersion,
  packageRootDir,
  type PackageJson,
} from "./package-info.ts";

interface RawCreateOptions {
  yes?: boolean;
  name?: string;
  description?: string;
  zhName?: string;
  zhDescription?: string;
  githubOwner?: string;
  githubRepo?: string;
  runtime?: string;
  nodeVersion?: string;
  css?: string;
  stack?: string[];
  preset?: string;
  packageManager?: string;
  component?: string[];
}

interface CreateContext {
  packageName: string;
  displayName: string;
  description: string;
  zhName: string;
  zhDescription: string;
  githubOwner: string;
  githubRepo: string;
  runtime: Runtime;
  nodeVersion: string;
  cssComponent: CssComponent;
  stacks: string[];
  webPreset: string;
  packageManager: PackageManager;
  webComponents: string[];
}

interface CreateDefaults {
  packageName: string;
  displayName: string;
  description: string;
  zhName: string;
  zhDescription: string;
  githubOwner: string;
  githubRepo: string;
  runtime: Runtime;
  nodeVersion: string;
  cssComponent: CssComponent;
  packageManager: PackageManager;
}

type TemplateValues = Record<string, string>;
type Runtime = "neutral" | "browser" | "nodejs";
type CssComponent = "native" | "css-modules" | "tailwind";
type PackageManager = "npm" | "pnpm";

type FormField =
  | "packageName"
  | "description"
  | "zhName"
  | "zhDescription"
  | "githubOwner"
  | "githubRepo"
  | "nodeVersion"
  | "runtime"
  | "cssComponent"
  | "stacks"
  | "webPreset"
  | "packageManager"
  | "webComponents";
type TextFormField = Exclude<
  FormField,
  "runtime" | "cssComponent" | "stacks" | "webPreset" | "packageManager" | "webComponents"
>;

interface TextFormItem {
  kind: "text";
  field: TextFormField;
  label: string;
}

interface ToggleFormItem {
  kind: "toggle";
  field: "stacks" | "webComponents";
  label: string;
  choices: { label: string; value: string }[];
}

interface SelectFormItem {
  kind: "select";
  field: "runtime" | "cssComponent" | "webPreset" | "packageManager";
  label: string;
  choices: { label: string; value: string }[];
}

type FormItem = TextFormItem | ToggleFormItem | SelectFormItem;
type ChoiceFormItem = ToggleFormItem | SelectFormItem;
type ChoiceFormField = ChoiceFormItem["field"];

interface KeypressKey {
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
}

interface FormState {
  cursor: number;
  message: string;
  choiceCursors: Partial<Record<ChoiceFormField, number>>;
  textCursors: Partial<Record<TextFormField, number>>;
}

const commonTemplateDir = path.join(packageRootDir, "templates/common");
const commonConfigDir = path.join(packageRootDir, "configs/common");
const webNpmPackageTemplateDir = path.join(packageRootDir, "templates/web/npm-package");
const webNpmPackageCssTemplateDir = path.join(packageRootDir, "templates/web/npm-package-css");

const supportedStacks = new Set(["web"]);
const supportedWebPresets = new Set(["npm-package"]);
const supportedWebComponents = new Set(["css", "git-hook", "react", "security", "vitest"]);
const supportedRuntimes = new Set<Runtime>(["neutral", "browser", "nodejs"]);
const supportedCssComponents = new Set<CssComponent>(["native", "css-modules", "tailwind"]);
const supportedPackageManagers = new Set<PackageManager>(["npm", "pnpm"]);
const defaultDevEnginesByPackageManager = {
  npm: {
    packageManager: {
      name: "npm",
      version: "11",
      onFail: "download",
    },
  },
  pnpm: {
    packageManager: {
      name: "pnpm",
      version: "11.8.0",
      onFail: "download",
    },
  },
} satisfies Record<PackageManager, unknown>;

export async function runCreateCommand(
  options: RawCreateOptions,
  packageJson: PackageJson,
): Promise<void> {
  const context = await resolveCreateContext(options, packageJson);
  const targetDir = process.cwd();
  const templateValues = createTemplateValues(context, packageJson);

  await ensureGitRepository(targetDir);
  await renderTemplateDirectory(commonTemplateDir, targetDir, templateValues);
  await renderTemplateDirectory(commonConfigDir, targetDir, templateValues);
  await renderTemplateDirectory(webNpmPackageTemplateDir, targetDir, templateValues);
  await writeJson(
    path.join(targetDir, "package.json"),
    createProjectPackageJson(context, packageJson),
  );
  await writeVsCodeConfig(targetDir, context);

  if (hasCssComponent(context)) {
    await renderTemplateDirectory(webNpmPackageCssTemplateDir, targetDir, templateValues);
  }

  console.log(`Installing dependencies with ${context.packageManager}...`);
  await runCommand(context.packageManager, ["install"], targetDir);

  console.log(`Created ${context.packageName} in ${targetDir}`);
}

async function resolveCreateContext(
  options: RawCreateOptions,
  packageJson: PackageJson,
): Promise<CreateContext> {
  const yes = options.yes === true;
  const cwdName = path.basename(process.cwd());
  const defaultPackageName = toPackageName(cwdName);
  const packageName = options.name ?? defaultPackageName;
  const defaults: CreateDefaults = {
    packageName,
    displayName: toDisplayName(packageName),
    description: options.description ?? "Description.",
    zhName: options.zhName ?? "名称",
    zhDescription: options.zhDescription ?? "描述。",
    githubOwner: options.githubOwner ?? "smallmain",
    githubRepo: options.githubRepo ?? toRepoName(packageName),
    runtime: resolveRuntime(options.runtime),
    nodeVersion: options.nodeVersion ?? createDefaultNodeVersion(packageJson),
    cssComponent: resolveCssComponent(options.css),
    packageManager: resolvePackageManager(options.packageManager),
  };
  const defaultContext: CreateContext = {
    ...defaults,
    stacks: resolveOptionValues(options.stack, ["web"], supportedStacks, "stack"),
    webPreset: resolveOptionValue(options.preset, "npm-package", supportedWebPresets, "preset"),
    webComponents: resolveOptionValues(
      options.component,
      ["git-hook", "vitest"],
      supportedWebComponents,
      "component",
    ),
  };

  if (yes || !stdin.isTTY || !stdout.isTTY) {
    validateCreateContext(defaultContext);
    return defaultContext;
  }

  const context = await runCreateForm(defaultContext);
  validateCreateContext(context);

  return {
    ...context,
    displayName: toDisplayName(context.packageName),
  };
}

function normalizeOptions(values: string[] | undefined): string[] {
  return [
    ...new Set(
      (values ?? [])
        .flatMap(value => value.split(","))
        .map(value => value.trim())
        .filter(Boolean),
    ),
  ];
}

function resolveOptionValues(
  values: string[] | undefined,
  defaultValues: string[],
  supportedValues: Set<string>,
  label: string,
): string[] {
  const resolvedValues = normalizeOptions(values);

  if (resolvedValues.length === 0) {
    return defaultValues;
  }

  validateOptions(resolvedValues, supportedValues, label);
  return resolvedValues;
}

function resolveOptionValue(
  value: string | undefined,
  defaultValue: string,
  supportedValues: Set<string>,
  label: string,
): string {
  if (!value) {
    return defaultValue;
  }

  validateOptions([value], supportedValues, label);
  return value;
}

function resolveRuntime(value: string | undefined): Runtime {
  if (!value) {
    return "neutral";
  }

  validateOptions([value], supportedRuntimes, "runtime");
  return value as Runtime;
}

function resolveCssComponent(value: string | undefined): CssComponent {
  const cssComponent = value ?? "native";

  validateOptions([cssComponent], supportedCssComponents, "css component");
  return cssComponent as CssComponent;
}

function resolvePackageManager(value: string | undefined): PackageManager {
  const packageManager = value ?? "pnpm";

  validateOptions([packageManager], supportedPackageManagers, "package manager");
  return packageManager as PackageManager;
}

function validateOptions(values: string[], supportedValues: Set<string>, label: string): void {
  const unsupportedValues = values.filter(value => !supportedValues.has(value));

  if (unsupportedValues.length > 0) {
    throw new Error(`Unsupported ${label}: ${unsupportedValues.join(", ")}.`);
  }
}

function validateCreateContext(context: CreateContext): void {
  const requiredFields: Array<[string, string]> = [
    ["Package name", context.packageName],
    ["English description", context.description],
    ["Chinese Name", context.zhName],
    ["Chinese Description", context.zhDescription],
    ["GitHub owner", context.githubOwner],
    ["GitHub repository", context.githubRepo],
  ];
  const missingField = requiredFields.find(([, value]) => value.trim().length === 0);

  if (missingField) {
    throw new Error(`${missingField[0]} is required.`);
  }

  validateOptions(context.stacks, supportedStacks, "stack");
  validateOptions([context.webPreset], supportedWebPresets, "preset");
  validateOptions(context.webComponents, supportedWebComponents, "component");
  validateOptions([context.runtime], supportedRuntimes, "runtime");
  validateOptions([context.cssComponent], supportedCssComponents, "css component");
  validateOptions([context.packageManager], supportedPackageManagers, "package manager");

  if (!context.stacks.includes("web")) {
    throw new Error("At least one supported stack is required. Currently only web is supported.");
  }

  if (context.runtime === "nodejs") {
    validateNodeVersion(context.nodeVersion);
  }
}

function validateNodeVersion(version: string): void {
  if (!/^(?:\d+|\d+\.\d+\.\d+)$/.test(version.trim())) {
    throw new Error("Node version must be like 22 or 22.1.1.");
  }
}

async function runCreateForm(initialContext: CreateContext): Promise<CreateContext> {
  const context = { ...initialContext };
  const state: FormState = {
    cursor: 0,
    message:
      "Enter: create  Esc/Ctrl+C: cancel  Up/Down: field  Left/Right: option  Space: toggle/select",
    choiceCursors: {},
    textCursors: {},
  };
  const previousRawMode = stdin.isRaw;

  emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();
  stdout.write("\x1B[?25l");

  return new Promise((resolve, reject) => {
    const getItems = (): FormItem[] => createFormItems(context);
    const cleanup = (): void => {
      stdin.off("keypress", onKeypress);
      stdin.setRawMode(previousRawMode);
      stdout.write("\x1B[?25h");
      stdout.write("\n");
    };
    const render = (): void => {
      const items = getItems();
      state.cursor = Math.min(state.cursor, items.length - 1);
      renderCreateForm(context, items, state);
    };
    const submit = (): void => {
      try {
        validateCreateContext(context);
        cleanup();
        resolve(context);
      } catch (error) {
        state.message = error instanceof Error ? error.message : String(error);
        render();
      }
    };
    const onKeypress = (character: string | undefined, key: KeypressKey): void => {
      const items = getItems();
      state.cursor = Math.min(state.cursor, items.length - 1);
      const item = items[state.cursor];

      if ((key.ctrl && key.name === "c") || key.name === "escape") {
        cleanup();
        reject(new Error("Create cancelled."));
        return;
      }

      if (key.name === "up") {
        state.cursor = (state.cursor + items.length - 1) % items.length;
        render();
        return;
      }

      if (key.name === "down" || key.name === "tab") {
        state.cursor = (state.cursor + 1) % items.length;
        render();
        return;
      }

      if (key.name === "return") {
        submit();
        return;
      }

      if (item.kind === "text") {
        if (handleTextKeypress(context, item.field, state, character, key)) {
          render();
        }
        return;
      }

      if ((item.kind === "toggle" || item.kind === "select") && key.name === "space") {
        if (item.kind === "toggle") {
          toggleFocusedFormValue(context, item, state);
        } else {
          moveChoiceCursor(context, item, state, 1);
        }
        render();
        return;
      }

      if (
        (item.kind === "toggle" || item.kind === "select") &&
        (key.name === "left" || key.name === "right")
      ) {
        moveChoiceCursor(context, item, state, key.name === "left" ? -1 : 1);
        render();
        return;
      }

      return;
    };

    stdin.on("keypress", onKeypress);
    render();
  });
}

function createFormItems(context: CreateContext): FormItem[] {
  const items: FormItem[] = [
    { kind: "text", field: "packageName", label: "Package name" },
    { kind: "text", field: "description", label: "Description" },
    { kind: "text", field: "zhName", label: "Chinese Name" },
    { kind: "text", field: "zhDescription", label: "Chinese Description" },
    { kind: "text", field: "githubOwner", label: "GitHub owner" },
    { kind: "text", field: "githubRepo", label: "GitHub repo" },
    {
      kind: "toggle",
      field: "stacks",
      label: "Stack",
      choices: [{ label: "Web", value: "web" }],
    },
    {
      kind: "select",
      field: "webPreset",
      label: "Preset",
      choices: [{ label: "Package", value: "npm-package" }],
    },
    {
      kind: "select",
      field: "packageManager",
      label: "Package Manager",
      choices: [
        { label: "pnpm", value: "pnpm" },
        { label: "npm", value: "npm" },
      ],
    },
    {
      kind: "select",
      field: "runtime",
      label: "Runtime",
      choices: [
        { label: "Neutral", value: "neutral" },
        { label: "Browser", value: "browser" },
        { label: "Node.js", value: "nodejs" },
      ],
    },
  ];

  if (context.runtime === "nodejs") {
    items.push({ kind: "text", field: "nodeVersion", label: "Node version" });
  }

  items.push({
    kind: "toggle",
    field: "webComponents",
    label: "Components",
    choices: [
      { label: "Git Hook", value: "git-hook" },
      { label: "Vitest", value: "vitest" },
      { label: "CSS", value: "css" },
      { label: "React", value: "react" },
      { label: "Security", value: "security" },
    ],
  });

  if (hasCssComponent(context)) {
    items.push({
      kind: "select",
      field: "cssComponent",
      label: "CSS",
      choices: [
        { label: "Native", value: "native" },
        { label: "CSS Modules", value: "css-modules" },
        { label: "Tailwind CSS", value: "tailwind" },
      ],
    });
  }

  return items;
}

function renderCreateForm(context: CreateContext, items: FormItem[], state: FormState): void {
  const lines = [
    "\x1B[2J\x1B[H",
    "Create Package",
    "",
    ...items.map((item, index) => renderFormItem(context, item, index === state.cursor, state)),
    "",
    state.message,
  ];

  stdout.write(lines.join("\n"));
}

function renderFormItem(
  context: CreateContext,
  item: FormItem,
  active: boolean,
  state: FormState,
): string {
  const marker = active ? ">" : " ";
  const label = item.label.padEnd(20, " ");

  if (item.kind === "text") {
    const value = context[item.field];
    const renderedValue = active
      ? renderTextWithCursor(value, getTextCursor(context, item.field, state))
      : value;

    return `${marker} ${label} ${renderedValue}`;
  }

  if (item.kind === "toggle") {
    const focusedIndex = getChoiceCursor(context, item, state);
    const choices = item.choices
      .map((choice, index) => {
        const checked = context[item.field].includes(choice.value) ? "x" : " ";
        return renderChoice(`[${checked}] ${choice.label}`, active && index === focusedIndex);
      })
      .join("  ");

    return `${marker} ${label} ${choices}`;
  }

  const focusedIndex = getChoiceCursor(context, item, state);
  const choices = item.choices
    .map((choice, index) => {
      const checked = context[item.field] === choice.value ? "x" : " ";
      return renderChoice(`[${checked}] ${choice.label}`, active && index === focusedIndex);
    })
    .join("  ");

  return `${marker} ${label} ${choices}`;
}

function handleTextKeypress(
  context: CreateContext,
  field: TextFormField,
  state: FormState,
  character: string | undefined,
  key: KeypressKey,
): boolean {
  if (isLineStartKey(key)) {
    moveTextCursorTo(context, field, state, 0);
    return true;
  }

  if (isLineEndKey(key)) {
    moveTextCursorToEnd(context, field, state);
    return true;
  }

  if (isWordLeftKey(key)) {
    moveTextCursorTo(
      context,
      field,
      state,
      findPreviousWordCursor(context[field], getTextCursor(context, field, state)),
    );
    return true;
  }

  if (isWordRightKey(key)) {
    moveTextCursorTo(
      context,
      field,
      state,
      findNextWordCursor(context[field], getTextCursor(context, field, state)),
    );
    return true;
  }

  if (isDeleteLineBeforeCursorKey(key)) {
    deleteTextBeforeCursorToStart(context, field, state);
    return true;
  }

  if (isDeleteLineAfterCursorKey(key)) {
    deleteTextAfterCursorToEnd(context, field, state);
    return true;
  }

  if (isDeleteWordBeforeCursorKey(key)) {
    deleteTextBeforeCursorTo(
      context,
      field,
      state,
      findPreviousWordCursor(context[field], getTextCursor(context, field, state)),
    );
    return true;
  }

  if (isDeleteWordAtCursorKey(key)) {
    deleteTextAtCursorTo(
      context,
      field,
      state,
      findNextWordCursor(context[field], getTextCursor(context, field, state)),
    );
    return true;
  }

  if (key.name === "left" || key.name === "right") {
    moveTextCursor(context, field, state, key.name === "left" ? -1 : 1);
    return true;
  }

  if (key.name === "backspace") {
    deleteTextBeforeCursor(context, field, state);
    return true;
  }

  if (key.name === "delete") {
    deleteTextAtCursor(context, field, state);
    return true;
  }

  if (character && !key.ctrl && !key.meta && character >= " ") {
    insertTextAtCursor(context, field, state, character);
    return true;
  }

  return false;
}

function getTextCursor(context: CreateContext, field: TextFormField, state: FormState): number {
  const valueLength = getTextChars(context[field]).length;
  const savedCursor = state.textCursors[field];

  if (savedCursor === undefined) {
    return valueLength;
  }

  return clamp(savedCursor, 0, valueLength);
}

function moveTextCursor(
  context: CreateContext,
  field: TextFormField,
  state: FormState,
  direction: number,
): void {
  state.textCursors[field] = clamp(
    getTextCursor(context, field, state) + direction,
    0,
    getTextChars(context[field]).length,
  );
}

function moveTextCursorTo(
  context: CreateContext,
  field: TextFormField,
  state: FormState,
  cursor: number,
): void {
  state.textCursors[field] = clamp(cursor, 0, getTextChars(context[field]).length);
}

function moveTextCursorToEnd(context: CreateContext, field: TextFormField, state: FormState): void {
  moveTextCursorTo(context, field, state, getTextChars(context[field]).length);
}

function insertTextAtCursor(
  context: CreateContext,
  field: TextFormField,
  state: FormState,
  text: string,
): void {
  const chars = getTextChars(context[field]);
  const cursor = getTextCursor(context, field, state);
  const insertedChars = getTextChars(text);

  chars.splice(cursor, 0, ...insertedChars);
  context[field] = chars.join("");
  state.textCursors[field] = cursor + insertedChars.length;
  updateDerivedTextFields(context, field);
}

function deleteTextBeforeCursor(
  context: CreateContext,
  field: TextFormField,
  state: FormState,
): void {
  const chars = getTextChars(context[field]);
  const cursor = getTextCursor(context, field, state);

  if (cursor === 0) {
    return;
  }

  chars.splice(cursor - 1, 1);
  context[field] = chars.join("");
  state.textCursors[field] = cursor - 1;
  updateDerivedTextFields(context, field);
}

function deleteTextBeforeCursorToStart(
  context: CreateContext,
  field: TextFormField,
  state: FormState,
): void {
  deleteTextBeforeCursorTo(context, field, state, 0);
}

function deleteTextBeforeCursorTo(
  context: CreateContext,
  field: TextFormField,
  state: FormState,
  startCursor: number,
): void {
  const chars = getTextChars(context[field]);
  const cursor = getTextCursor(context, field, state);
  const normalizedStartCursor = clamp(startCursor, 0, cursor);

  chars.splice(normalizedStartCursor, cursor - normalizedStartCursor);
  context[field] = chars.join("");
  state.textCursors[field] = normalizedStartCursor;
  updateDerivedTextFields(context, field);
}

function deleteTextAtCursor(context: CreateContext, field: TextFormField, state: FormState): void {
  const chars = getTextChars(context[field]);
  const cursor = getTextCursor(context, field, state);

  if (cursor >= chars.length) {
    return;
  }

  chars.splice(cursor, 1);
  context[field] = chars.join("");
  state.textCursors[field] = cursor;
  updateDerivedTextFields(context, field);
}

function deleteTextAfterCursorToEnd(
  context: CreateContext,
  field: TextFormField,
  state: FormState,
): void {
  deleteTextAtCursorTo(context, field, state, getTextChars(context[field]).length);
}

function deleteTextAtCursorTo(
  context: CreateContext,
  field: TextFormField,
  state: FormState,
  endCursor: number,
): void {
  const chars = getTextChars(context[field]);
  const cursor = getTextCursor(context, field, state);
  const normalizedEndCursor = clamp(endCursor, cursor, chars.length);

  chars.splice(cursor, normalizedEndCursor - cursor);
  context[field] = chars.join("");
  state.textCursors[field] = cursor;
  updateDerivedTextFields(context, field);
}

function updateDerivedTextFields(context: CreateContext, field: TextFormField): void {
  if (field === "packageName") {
    context.displayName = toDisplayName(context.packageName);
  }
}

function renderTextWithCursor(value: string, cursor: number): string {
  const chars = getTextChars(value);
  const normalizedCursor = clamp(cursor, 0, chars.length);

  return `${chars.slice(0, normalizedCursor).join("")}_${chars.slice(normalizedCursor).join("")}`;
}

function getTextChars(value: string): string[] {
  return Array.from(value);
}

function findPreviousWordCursor(value: string, cursor: number): number {
  const chars = getTextChars(value);
  let index = clamp(cursor, 0, chars.length);

  while (index > 0 && isWordSeparator(chars[index - 1] ?? "")) {
    index -= 1;
  }

  while (index > 0 && !isWordSeparator(chars[index - 1] ?? "")) {
    index -= 1;
  }

  return index;
}

function findNextWordCursor(value: string, cursor: number): number {
  const chars = getTextChars(value);
  let index = clamp(cursor, 0, chars.length);

  while (index < chars.length && !isWordSeparator(chars[index] ?? "")) {
    index += 1;
  }

  while (index < chars.length && isWordSeparator(chars[index] ?? "")) {
    index += 1;
  }

  return index;
}

function isWordSeparator(value: string): boolean {
  return !/[\p{L}\p{N}_]/u.test(value);
}

function isLineStartKey(key: KeypressKey): boolean {
  return (
    key.name === "home" ||
    (hasModifierKey(key) && key.name === "a") ||
    (key.meta === true && key.name === "left")
  );
}

function isLineEndKey(key: KeypressKey): boolean {
  return (
    key.name === "end" ||
    (hasModifierKey(key) && key.name === "e") ||
    (key.meta === true && key.name === "right")
  );
}

function isWordLeftKey(key: KeypressKey): boolean {
  return hasModifierKey(key) && key.name === "b";
}

function isWordRightKey(key: KeypressKey): boolean {
  return hasModifierKey(key) && key.name === "f";
}

function isDeleteLineBeforeCursorKey(key: KeypressKey): boolean {
  return hasModifierKey(key) && key.name === "u";
}

function isDeleteLineAfterCursorKey(key: KeypressKey): boolean {
  return hasModifierKey(key) && key.name === "k";
}

function isDeleteWordBeforeCursorKey(key: KeypressKey): boolean {
  return hasModifierKey(key) && (key.name === "w" || key.name === "backspace");
}

function isDeleteWordAtCursorKey(key: KeypressKey): boolean {
  return hasModifierKey(key) && key.name === "delete";
}

function hasModifierKey(key: KeypressKey): boolean {
  return key.ctrl === true || key.meta === true;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toggleFormValue(
  context: CreateContext,
  field: ToggleFormItem["field"],
  value: string,
): void {
  const values = context[field];

  context[field] = values.includes(value)
    ? values.filter(item => item !== value)
    : [...values, value];
}

function toggleFocusedFormValue(
  context: CreateContext,
  item: ToggleFormItem,
  state: FormState,
): void {
  const focusedIndex = getChoiceCursor(context, item, state);
  const value = item.choices[focusedIndex]?.value;

  if (value) {
    toggleFormValue(context, item.field, value);
  }
}

function moveChoiceCursor(
  context: CreateContext,
  item: ChoiceFormItem,
  state: FormState,
  direction: number,
): void {
  const currentIndex = getChoiceCursor(context, item, state);
  const nextIndex = (currentIndex + direction + item.choices.length) % item.choices.length;

  state.choiceCursors[item.field] = nextIndex;

  if (item.kind !== "select") {
    return;
  }

  const nextValue = item.choices[nextIndex]?.value ?? item.choices[0]?.value ?? context[item.field];

  if (item.field === "runtime") {
    context.runtime = resolveRuntime(nextValue);
    return;
  }

  if (item.field === "cssComponent") {
    context.cssComponent = nextValue as CssComponent;
    return;
  }

  if (item.field === "packageManager") {
    context.packageManager = resolvePackageManager(nextValue);
    return;
  }

  context.webPreset = nextValue;
}

function getChoiceCursor(context: CreateContext, item: ChoiceFormItem, state: FormState): number {
  const savedIndex = state.choiceCursors[item.field];

  if (savedIndex !== undefined && savedIndex >= 0 && savedIndex < item.choices.length) {
    return savedIndex;
  }

  if (item.kind === "select") {
    const selectedIndex = item.choices.findIndex(choice => choice.value === context[item.field]);

    return selectedIndex >= 0 ? selectedIndex : 0;
  }

  return 0;
}

function renderChoice(choice: string, focused: boolean): string {
  return focused ? `\x1B[7m${choice}\x1B[27m` : choice;
}

function createProjectPackageJson(context: CreateContext, packageJson: PackageJson): unknown {
  const author = getAuthor(packageJson);
  const scripts: Record<string, string> = {
    lint: "sm lint",
    "lint:fix": "sm lint --fix",
  };

  if (hasGitHookComponent(context)) {
    scripts.prepare = "sm set-git-hook";
  }

  if (context.webComponents.includes("vitest")) {
    scripts.test = "vitest";
  }

  const devDependencies: Record<string, string> = {
    "@smallmains/dev": createDevPackageVersion(packageJson),
    oxfmt: getDependencyVersion(packageJson, "oxfmt"),
    oxlint: getDependencyVersion(packageJson, "oxlint"),
    "oxlint-tsgolint": getDependencyVersion(packageJson, "oxlint-tsgolint"),
    typescript: getDependencyVersion(packageJson, "typescript"),
  };

  if (hasCssComponent(context)) {
    devDependencies.stylelint = getDependencyVersion(packageJson, "stylelint");
  }

  if (context.webComponents.includes("vitest")) {
    devDependencies.vitest = getDependencyVersion(packageJson, "vitest");
  }

  if (context.runtime === "nodejs") {
    devDependencies["@types/node"] = getDependencyVersion(packageJson, "@types/node");
  }

  const projectPackageJson: Record<string, unknown> = {
    name: context.packageName,
    version: "1.0.0",
    description: context.description,
    homepage: `https://github.com/${context.githubOwner}/${context.githubRepo}`,
    bugs: {
      url: `https://github.com/${context.githubOwner}/${context.githubRepo}/issues`,
    },
    license: "MIT",
    author,
    repository: {
      type: "git",
      url: `git+https://github.com/${context.githubOwner}/${context.githubRepo}.git`,
    },
    funding: packageJson.funding,
    scripts,
    devDependencies,
    devEngines: createDevEngines(context.packageManager, packageJson),
  };

  if (context.runtime === "nodejs") {
    projectPackageJson.engines = {
      node: createNodeEngineVersion(context.nodeVersion),
    };
  }

  return projectPackageJson;
}

function createTemplateValues(context: CreateContext, packageJson: PackageJson): TemplateValues {
  const author = getAuthor(packageJson);
  const oxlintParts = createOxlintParts(context);
  const oxlintNamedImports = oxlintParts.length > 0 ? `, { ${oxlintParts.join(", ")} }` : "";
  const oxlintExtends = oxlintParts.length > 0 ? `, ${oxlintParts.join(", ")}` : "";

  return {
    packageName: context.packageName,
    displayName: context.displayName,
    description: context.description,
    zhName: context.zhName,
    zhDescription: context.zhDescription,
    githubOwner: context.githubOwner,
    githubRepo: context.githubRepo,
    authorName: author.name,
    authorEmail: author.email,
    authorUrl: author.url,
    licenseYear: String(new Date().getFullYear()),
    packageManager: context.packageManager,
    typescriptConfig: createTypeScriptConfigName(context.runtime),
    stylelintConfig: createStylelintConfigName(context.cssComponent),
    oxlintNamedImports,
    oxlintExtends,
  };
}

async function renderTemplateDirectory(
  sourceDir: string,
  targetDir: string,
  values: TemplateValues,
): Promise<void> {
  const entries = await readdir(sourceDir, { withFileTypes: true });

  await mkdir(targetDir, { recursive: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, resolveTemplateOutputName(entry.name));

    if (entry.isDirectory()) {
      await renderTemplateDirectory(sourcePath, targetPath, values);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const content = renderTemplate(await readFile(sourcePath, "utf8"), values);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, content);
  }
}

function renderTemplate(content: string, values: TemplateValues): string {
  let renderedContent = content;

  for (const [key, value] of Object.entries(values)) {
    renderedContent = renderedContent.replaceAll(`{{${key}}}`, value);
  }

  return renderedContent;
}

function resolveTemplateOutputName(name: string): string {
  return name.endsWith(".tmpl") ? name.slice(0, -".tmpl".length) : name;
}

async function writeVsCodeConfig(targetDir: string, context: CreateContext): Promise<void> {
  const settings: Record<string, unknown> = {
    "[javascript][typescript][javascriptreact][typescriptreact]": {
      "editor.defaultFormatter": "oxc.oxc-vscode",
    },
    "[markdown][mdx]": {
      "editor.defaultFormatter": "oxc.oxc-vscode",
    },
    "[json][jsonc][jsonl][snippets][yaml]": {
      "editor.defaultFormatter": "oxc.oxc-vscode",
    },
  };
  const recommendations = ["editorconfig.editorconfig", "oxc.oxc-vscode"];

  if (hasCssComponent(context)) {
    settings["[html][css][scss][less]"] = {
      "editor.defaultFormatter": "oxc.oxc-vscode",
    };
    settings["[vue]"] = {
      "editor.defaultFormatter": "oxc.oxc-vscode",
    };
    settings["stylelint.validate"] = [
      "css",
      "postcss",
      "html",
      "vue",
      "svelte",
      "astro",
      "markdown",
      "mdx",
    ];
    recommendations.push("stylelint.vscode-stylelint");
  }

  if (context.webComponents.includes("vitest")) {
    recommendations.push("vitest.explorer");
  }

  const vscodeDir = path.join(targetDir, ".vscode");
  await mkdir(vscodeDir, { recursive: true });
  await writeJson(path.join(vscodeDir, "settings.json"), settings);
  await writeJson(path.join(vscodeDir, "extensions.json"), { recommendations });
}

async function ensureGitRepository(targetDir: string): Promise<void> {
  if (await pathExists(path.join(targetDir, ".git"))) {
    return;
  }

  if (await commandSucceeds("git", ["rev-parse", "--is-inside-work-tree"], targetDir)) {
    return;
  }

  console.log("Initializing Git repository...");
  await runCommand("git", ["init"], targetDir);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", code => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}.`));
    });
  });
}

function commandSucceeds(command: string, args: string[], cwd: string): Promise<boolean> {
  return new Promise(resolve => {
    const child = spawn(command, args, {
      cwd,
      stdio: "ignore",
    });

    child.on("error", () => resolve(false));
    child.on("exit", code => resolve(code === 0));
  });
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function toPackageName(value: string): string {
  const normalizedValue = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9._~-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");

  return normalizedValue || "my-package";
}

function toRepoName(packageName: string): string {
  return packageName.split("/").at(-1) ?? packageName;
}

function toDisplayName(packageName: string): string {
  return toRepoName(packageName)
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(word => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function createDevPackageVersion(packageJson: PackageJson): string {
  return packageJson.version ? `^${packageJson.version}` : "latest";
}

function createDevEngines(packageManager: PackageManager, packageJson: PackageJson): unknown {
  if (hasPackageManagerDevEngine(packageJson.devEngines, packageManager)) {
    return packageJson.devEngines;
  }

  return defaultDevEnginesByPackageManager[packageManager];
}

function hasPackageManagerDevEngine(devEngines: unknown, packageManager: PackageManager): boolean {
  if (!isRecord(devEngines)) {
    return false;
  }

  const packageManagerDevEngine = devEngines.packageManager;

  if (Array.isArray(packageManagerDevEngine)) {
    return packageManagerDevEngine.some(value => isPackageManagerDevEngine(value, packageManager));
  }

  return isPackageManagerDevEngine(packageManagerDevEngine, packageManager);
}

function isPackageManagerDevEngine(value: unknown, packageManager: PackageManager): boolean {
  return isRecord(value) && value.name === packageManager;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasCssComponent(context: CreateContext): boolean {
  return context.webComponents.includes("css");
}

function hasGitHookComponent(context: CreateContext): boolean {
  return context.webComponents.includes("git-hook");
}

function createStylelintConfigName(cssComponent: CssComponent): string {
  if (cssComponent === "css-modules") {
    return "css-modules";
  }

  if (cssComponent === "tailwind") {
    return "tailwind";
  }

  return "generic";
}

function createOxlintParts(context: CreateContext): string[] {
  return [
    context.runtime === "nodejs" ? "nodejs" : "",
    context.webComponents.includes("react") ? "react" : "",
    context.webComponents.includes("security") ? "security" : "",
    context.webComponents.includes("vitest") ? "vitest" : "",
  ].filter(Boolean);
}

function createTypeScriptConfigName(runtime: Runtime): string {
  if (runtime === "browser") {
    return "browser";
  }

  if (runtime === "nodejs") {
    return "nodejs";
  }

  return "generic";
}

function createNodeEngineVersion(version: string): string {
  const normalizedVersion = version.trim();

  return normalizedVersion.includes(".") ? normalizedVersion : `^${normalizedVersion}`;
}

function createDefaultNodeVersion(packageJson: PackageJson): string {
  const configuredVersion = packageJson.engines?.node?.match(/\d+(?:\.\d+\.\d+)?/)?.[0];

  return configuredVersion ?? "24";
}
