import { definePlugin, eslintCompatPlugin } from "@oxlint/plugins";
import type { Plugin } from "@oxlint/plugins";
import { parseSync } from "oxc-parser";
import { ResolverFactory } from "oxc-resolver";
import type { NapiResolveOptions } from "oxc-resolver";

const PLUGIN_NAME = "consistent-esm-default-name";
const DEFAULT_IGNORE_SPECIFIERS = [] as const;
const FORMAT_NAMES = [
  "typescript",
  "preserve",
  "camel",
  "pascal",
  "snake",
  "kebab",
  "flat",
  "upper",
  "lower",
] as const;
const DEFAULT_TEMPLATE = [
  { match: ".*", format: "typescript" },
] as const satisfies readonly TemplateEntry[];
const RESOLVE_OPTIONS = {
  builtinModules: true,
  conditionNames: ["types", "node", "import", "default"],
  extensionAlias: {
    ".cjs": [".cts", ".cjs"],
    ".js": [".ts", ".tsx", ".d.ts", ".js"],
    ".jsx": [".tsx", ".jsx"],
    ".mjs": [".mts", ".mjs"],
  },
  extensions: [
    ".ts",
    ".tsx",
    ".mts",
    ".cts",
    ".d.ts",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".json",
  ],
  mainFields: ["types", "typings", "module", "jsnext:main", "main"],
  mainFiles: ["index"],
  moduleType: true,
  tsconfig: "auto",
} as const satisfies NapiResolveOptions;
const IDENTIFIER_PATTERN = /^[$_\p{ID_Start}][$_\u200c\u200d\p{ID_Continue}]*$/u;
const DIRECTORY_ENTRY_PATTERN = /^\.{1,2}(?:[/\\]\.{1,2})*[/\\]?$/u;
const RESERVED_WORDS = new Set([
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "new",
  "null",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
  "let",
  "static",
  "implements",
  "interface",
  "package",
  "private",
  "protected",
  "public",
]);

type FormatName = (typeof FORMAT_NAMES)[number];

type TemplateEntry = {
  format?: FormatName;
  match: string;
  name?: string;
  prefix?: string;
  strip?: string | readonly string[];
  suffix?: string;
};

type PluginSettings = {
  ignorePaths?: readonly string[];
  ignoreSpecifiers?: readonly string[];
  template?: readonly TemplateEntry[];
};

type Range = readonly [number, number];

type IdentifierNode = {
  name?: unknown;
  range?: unknown;
  type?: unknown;
};

type LiteralNode = {
  value?: unknown;
};

type ImportDefaultSpecifierNode = {
  local?: IdentifierNode;
  range?: unknown;
  type?: unknown;
};

type ImportDeclarationNode = {
  source?: LiteralNode;
  specifiers?: readonly ImportDefaultSpecifierNode[];
};

type AstNode = {
  body?: readonly AstNode[];
  declaration?: AstNode;
  exported?: IdentifierNode | LiteralNode;
  expression?: AstNode;
  id?: IdentifierNode | null;
  local?: IdentifierNode | LiteralNode;
  range?: unknown;
  source?: LiteralNode | null;
  specifiers?: readonly AstNode[];
  type?: unknown;
};

type StaticExportEntry = {
  exportName?: {
    kind?: unknown;
    name?: unknown;
  };
  importName?: {
    kind?: unknown;
    name?: unknown;
  };
  isType?: unknown;
  localName?: {
    kind?: unknown;
    name?: unknown;
  };
  moduleRequest?: {
    value?: unknown;
  } | null;
};

type ParsedModule = {
  program?: AstNode;
  module?: {
    staticExports?: readonly {
      entries?: readonly StaticExportEntry[];
    }[];
  };
};

type ParsedModuleCacheEntry = {
  parsedModule: ParsedModule | null;
  sourceText: string;
};

type TokenNode = {
  range?: unknown;
  type?: unknown;
  value?: unknown;
};

type Reference = {
  identifier?: IdentifierNode;
  resolved?: Variable | null;
};

type Variable = {
  identifiers?: readonly IdentifierNode[];
  name?: string;
  references?: readonly Reference[];
};

type SourceCode = {
  ast?: {
    tokens?: readonly TokenNode[];
  };
  getDeclaredVariables?: (node: unknown) => Variable[];
  text?: string;
};

type Fix = unknown;

type Fixer = {
  replaceTextRange: (range: Range, text: string) => Fix;
};

type ReportDescriptor = {
  data?: Record<string, string>;
  fix?: (fixer: Fixer) => Fix | Fix[] | null;
  messageId: string;
  node?: unknown;
};

type RuleContext = {
  cwd?: string;
  getCwd?: () => string;
  getFilename?: () => string;
  getPhysicalFilename?: () => string;
  getSourceCode?: () => SourceCode | undefined;
  options?: readonly unknown[];
  report: (descriptor: ReportDescriptor) => void;
  settings?: Record<string, unknown>;
  sourceCode?: SourceCode;
};

type DerivedNameInput = {
  baseName: string;
  matchText: string;
};

type ImportTarget = DerivedNameInput & {
  path: string | null;
};

type FsModule = {
  lstatSync: (filePath: string) => { isDirectory: () => boolean; isFile: () => boolean };
  readFileSync: (filePath: string, encoding: "utf8") => string;
};

type PathModule = {
  matchesGlob?: (path: string, pattern: string) => boolean;
};

declare const process:
  | {
      cwd?: () => string;
      getBuiltinModule?: {
        (specifier: "node:fs"): FsModule;
        (specifier: "node:path"): PathModule;
      };
    }
  | undefined;

const parsedModuleCache = new Map<string, ParsedModuleCacheEntry>();

function getSourceCode(context: RuleContext): SourceCode | undefined {
  return context.sourceCode ?? context.getSourceCode?.();
}

function getFilename(context: RuleContext): string | null {
  const filename = context.getPhysicalFilename?.() ?? context.getFilename?.();

  return filename && filename !== "<text>" && filename !== "<input>" ? filename : null;
}

function isTemplateEntry(value: unknown): value is TemplateEntry {
  return typeof value === "object" && value !== null && typeof (value as TemplateEntry).match === "string";
}

function getPluginSettings(context: RuleContext): PluginSettings {
  const settings = context.settings?.[PLUGIN_NAME];
  if (typeof settings !== "object" || settings === null) {
    return {};
  }

  const candidate = settings as PluginSettings;
  return {
    ignorePaths: Array.isArray(candidate.ignorePaths)
      ? candidate.ignorePaths.filter((value): value is string => typeof value === "string")
      : undefined,
    ignoreSpecifiers: Array.isArray(candidate.ignoreSpecifiers)
      ? candidate.ignoreSpecifiers.filter((value): value is string => typeof value === "string")
      : undefined,
    template: Array.isArray(candidate.template) ? candidate.template.filter(isTemplateEntry) : undefined,
  };
}

function compileRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, "u");
  } catch {
    return null;
  }
}

function isIgnoredSpecifier(specifier: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => compileRegex(pattern)?.test(specifier) ?? false);
}

function splitSpecifierPath(specifier: string): string {
  const queryIndex = specifier.search(/[?#]/u);

  return queryIndex === -1 ? specifier : specifier.slice(0, queryIndex);
}

function normalizePathSeparators(value: string): string {
  return value.replaceAll("\\", "/");
}

function stripTrailingSlashes(value: string): string {
  if (/^[A-Za-z]:\/$/u.test(value) || value === "/") {
    return value;
  }

  return value.replace(/\/+$/u, "");
}

function dirname(value: string): string {
  const normalized = stripTrailingSlashes(normalizePathSeparators(value));
  const index = normalized.lastIndexOf("/");
  if (index === -1) {
    return ".";
  }

  if (index === 0) {
    return "/";
  }

  return normalized.slice(0, index);
}

function basename(value: string): string {
  const normalized = stripTrailingSlashes(normalizePathSeparators(value));
  const index = normalized.lastIndexOf("/");

  return index === -1 ? normalized : normalized.slice(index + 1);
}

function extensionName(value: string): string {
  const base = basename(value);
  const index = base.lastIndexOf(".");

  return index > 0 ? base.slice(index) : "";
}

function basenameWithoutExtension(value: string): string {
  const extension = extensionName(value);

  return extension ? value.slice(0, -extension.length) : value;
}

function joinPath(...parts: string[]): string {
  const [first = "", ...rest] = parts.map(normalizePathSeparators);
  const joined = rest.reduce((current, part) => {
    if (!part) {
      return current;
    }

    if (!current || part.startsWith("/")) {
      return part;
    }

    return `${stripTrailingSlashes(current)}/${part.replace(/^\/+/u, "")}`;
  }, first);

  return joined || ".";
}

function normalizeAbsolutePath(value: string): string {
  const normalized = normalizePathSeparators(value);
  const rootMatch = /^(?:[A-Za-z]:)?\//u.exec(normalized);
  const root = rootMatch?.[0] ?? "";
  const rest = root ? normalized.slice(root.length) : normalized;
  const segments: string[] = [];

  for (const segment of rest.split("/")) {
    if (!segment || segment === ".") {
      continue;
    }

    if (segment === "..") {
      segments.pop();
      continue;
    }

    segments.push(segment);
  }

  return `${root}${segments.join("/")}` || root || ".";
}

function relativePath(fromDirectory: string, toPath: string): string {
  const fromSegments = normalizeAbsolutePath(fromDirectory).split("/").filter(Boolean);
  const toSegments = normalizeAbsolutePath(toPath).split("/").filter(Boolean);

  while (fromSegments.length > 0 && toSegments.length > 0 && fromSegments[0] === toSegments[0]) {
    fromSegments.shift();
    toSegments.shift();
  }

  return [...fromSegments.map(() => ".."), ...toSegments].join("/") || ".";
}

function resolvePath(fromDirectory: string, toPath: string): string {
  const normalizedToPath = normalizePathSeparators(toPath);

  return normalizeAbsolutePath(
    /^(?:[A-Za-z]:)?\//u.test(normalizedToPath)
      ? normalizedToPath
      : joinPath(fromDirectory, normalizedToPath),
  );
}

function getCwd(context: RuleContext): string {
  return context.cwd ?? context.getCwd?.() ?? process?.cwd?.() ?? ".";
}

function matchesGlob(value: string, pattern: string): boolean {
  const matchesGlob = process?.getBuiltinModule?.("node:path").matchesGlob;
  if (matchesGlob) {
    return matchesGlob(value, pattern);
  }

  const escapedPattern = pattern
    .replace(/[.+^${}()|[\]\\]/gu, "\\$&")
    .replaceAll("\\*\\*", ".*")
    .replaceAll("\\*", "[^/]*");

  return new RegExp(`^${escapedPattern}$`, "u").test(value);
}

function isIgnoredPath(filePath: string | null, patterns: readonly string[] | undefined, context: RuleContext): boolean {
  if (!filePath || !patterns || patterns.length === 0) {
    return false;
  }

  const normalizedPath = normalizePathSeparators(filePath);
  const relativeToCwd = relativePath(getCwd(context), normalizedPath);

  return patterns.some(pattern => matchesGlob(normalizedPath, pattern) || matchesGlob(relativeToCwd, pattern));
}

function getFs(): FsModule | undefined {
  return process?.getBuiltinModule?.("node:fs");
}

function readJsonFile(filePath: string): Record<string, unknown> | null {
  const fs = getFs();
  if (!fs) {
    return null;
  }

  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;

    return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function readTextFile(filePath: string): string | null {
  const fs = getFs();
  if (!fs) {
    return null;
  }

  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function resolveImportSpecifier(specifier: string, importerFilename: string): string | null {
  const specifierPath = splitSpecifierPath(specifier);

  try {
    const resolver = new ResolverFactory(RESOLVE_OPTIONS);
    const result = resolver.resolveFileSync(importerFilename, specifierPath);

    return typeof result.path === "string" ? normalizeAbsolutePath(result.path) : null;
  } catch {
    return null;
  }
}

function isIndexBasename(value: string): boolean {
  return value === "index" || value.startsWith("index.");
}

function packageNameToBaseName(packageName: string): string {
  const normalizedName = packageName.trim();
  if (!normalizedName) {
    return "";
  }

  return normalizedName.split("/").at(-1) ?? normalizedName;
}

function readPackageName(directory: string): string | null {
  const packageJsonPath = joinPath(directory, "package.json");
  const packageJson = readJsonFile(packageJsonPath);

  return typeof packageJson?.name === "string" ? packageNameToBaseName(packageJson.name) : null;
}

function getDirectoryEntryBaseName(specifierPath: string, importerFilename: string): string {
  const importerDirectory = dirname(importerFilename);
  const targetDirectory = resolvePath(importerDirectory, specifierPath);
  const packageName = readPackageName(targetDirectory);

  return packageName || basename(targetDirectory);
}

function deriveImportTarget(specifier: string, importerFilename: string): ImportTarget {
  const specifierPath = splitSpecifierPath(specifier);
  const targetPath = resolveImportSpecifier(specifier, importerFilename);

  if (DIRECTORY_ENTRY_PATTERN.test(specifierPath)) {
    return {
      baseName: getDirectoryEntryBaseName(specifierPath, importerFilename),
      matchText: specifier,
      path: targetPath,
    };
  }

  const normalizedPath = normalizePathSeparators(specifierPath).replace(/\/+$/u, "");
  const fileBasename = basename(normalizedPath);
  const isIndex = isIndexBasename(fileBasename);
  const baseName = isIndex
    ? basename(dirname(normalizedPath))
    : basenameWithoutExtension(fileBasename);

  return {
    baseName,
    matchText: specifier,
    path: targetPath,
  };
}

function deriveExportNameInput(filename: string): DerivedNameInput {
  const normalizedFilename = normalizePathSeparators(filename);
  const fileBasename = basename(normalizedFilename);
  const isIndex = isIndexBasename(fileBasename);
  const baseName = isIndex
    ? basename(dirname(normalizedFilename))
    : basenameWithoutExtension(fileBasename);

  return {
    baseName,
    matchText: filename,
  };
}

function splitWords(value: string): string[] {
  return value
    .replace(/([a-z\d])([A-Z])/gu, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/gu, "$1 $2")
    .split(/[^A-Za-z\d]+/u)
    .filter(Boolean);
}

function isIdentifierStartChar(char: string): boolean {
  return /^[$_\p{ID_Start}]$/u.test(char);
}

function isIdentifierPartChar(char: string): boolean {
  return /^[$_\u200c\u200d\p{ID_Continue}]$/u.test(char);
}

function moduleSpecifierToTypeScriptIdentifier(moduleSpecifier: string, forceCapitalize = false): string {
  const withoutExtension = basenameWithoutExtension(moduleSpecifier);
  const baseName = basename(withoutExtension.endsWith("/index") ? withoutExtension.slice(0, -"/index".length) : withoutExtension);
  let result = "";
  let lastCharWasValid = true;

  for (const char of baseName) {
    const isFirst = result.length === 0;
    const valid = isFirst ? isIdentifierStartChar(char) : isIdentifierPartChar(char);

    if (valid) {
      let nextChar = char;
      if (!lastCharWasValid || (forceCapitalize && isFirst)) {
        nextChar = nextChar.toUpperCase();
      }

      result += nextChar;
    }

    lastCharWasValid = valid;
  }

  const fallback = result || "_";

  return RESERVED_WORDS.has(fallback) ? `_${fallback}` : fallback;
}

function capitalize(value: string): string {
  return value ? `${value[0]?.toUpperCase() ?? ""}${value.slice(1).toLowerCase()}` : "";
}

function formatName(value: string, format: FormatName = "preserve"): string {
  if (format === "typescript") {
    return moduleSpecifierToTypeScriptIdentifier(value);
  }

  if (format === "preserve") {
    return value;
  }

  if (format === "upper") {
    return value.toUpperCase();
  }

  if (format === "lower") {
    return value.toLowerCase();
  }

  const words = splitWords(value);
  if (words.length === 0) {
    return "";
  }

  switch (format) {
    case "camel":
      return `${words[0]?.toLowerCase() ?? ""}${words.slice(1).map(capitalize).join("")}`;
    case "pascal":
      return words.map(capitalize).join("");
    case "snake":
      return words.map(word => word.toLowerCase()).join("_");
    case "kebab":
      return words.map(word => word.toLowerCase()).join("-");
    case "flat":
      return words.map(word => word.toLowerCase()).join("");
    default:
      return value;
  }
}

function applyStripPatterns(value: string, strip: TemplateEntry["strip"]): string {
  const patterns = typeof strip === "string" ? [strip] : strip ?? [];

  return patterns.reduce((current, pattern) => {
    const regex = compileRegex(pattern);

    return regex ? current.replace(regex, "") : current;
  }, value);
}

function getTemplateEntries(settings: PluginSettings): readonly TemplateEntry[] {
  return settings.template ?? DEFAULT_TEMPLATE;
}

function getExpectedName(input: DerivedNameInput, template: readonly TemplateEntry[]): string {
  const entry = template.find(({ match }) => compileRegex(match)?.test(input.matchText) ?? false);

  if (!entry) {
    return input.baseName;
  }

  if (typeof entry.name === "string") {
    return entry.name;
  }

  const strippedName = applyStripPatterns(input.baseName, entry.strip);
  const formattedName = formatName(strippedName, entry.format);

  return `${entry.prefix ?? ""}${formattedName}${entry.suffix ?? ""}`;
}

function isIdentifierNode(node: unknown): node is IdentifierNode {
  return (
    typeof node === "object" &&
    node !== null &&
    "name" in node &&
    typeof (node as IdentifierNode).name === "string"
  );
}

function getIdentifierName(node: unknown): string | null {
  return isIdentifierNode(node) && typeof node.name === "string" ? node.name : null;
}

function getLiteralValue(node: unknown): unknown {
  return typeof node === "object" && node !== null && "value" in node
    ? (node as LiteralNode).value
    : undefined;
}

function getNodeRange(node: unknown): Range | null {
  if (typeof node !== "object" || node === null || !("range" in node)) {
    return null;
  }

  const range = (node as { range?: unknown }).range;

  return Array.isArray(range) &&
    range.length === 2 &&
    typeof range[0] === "number" &&
    typeof range[1] === "number"
    ? [range[0], range[1]]
    : null;
}

function isValidBindingIdentifier(name: string): boolean {
  return IDENTIFIER_PATTERN.test(name) && !RESERVED_WORDS.has(name);
}

function isIdentifierLikeToken(token: TokenNode): boolean {
  return token.type === "Identifier" || token.type === "JSXIdentifier";
}

function rangeKey(range: Range): string {
  return `${range[0]}:${range[1]}`;
}

function hasIdentifierConflict(sourceCode: SourceCode, expectedName: string): boolean {
  return (sourceCode.ast?.tokens ?? []).some(
    token => isIdentifierLikeToken(token) && token.value === expectedName,
  );
}

function rangeTextMatches(sourceCode: SourceCode, range: Range, name: string): boolean {
  return !sourceCode.text || sourceCode.text.slice(range[0], range[1]) === name;
}

function getSafeRenameRanges(
  sourceCode: SourceCode | undefined,
  specifier: ImportDefaultSpecifierNode,
  actualName: string,
  expectedName: string,
): Range[] | null {
  if (
    !sourceCode ||
    !sourceCode.getDeclaredVariables ||
    !isValidBindingIdentifier(expectedName) ||
    hasIdentifierConflict(sourceCode, expectedName)
  ) {
    return null;
  }

  const variables = sourceCode.getDeclaredVariables(specifier);
  if (variables.length !== 1) {
    return null;
  }

  const variable = variables[0];
  if (!variable || variable.name !== actualName || !Array.isArray(variable.references)) {
    return null;
  }

  const ranges = new Map<string, Range>();
  for (const identifier of variable.identifiers ?? []) {
    if (getIdentifierName(identifier) !== actualName) {
      return null;
    }

    const range = getNodeRange(identifier);
    if (!range || !rangeTextMatches(sourceCode, range, actualName)) {
      return null;
    }

    ranges.set(rangeKey(range), range);
  }

  for (const reference of variable.references) {
    if (reference.resolved && reference.resolved !== variable) {
      return null;
    }

    const identifier = reference.identifier;
    if (getIdentifierName(identifier) !== actualName) {
      return null;
    }

    const range = getNodeRange(identifier);
    if (!range || !rangeTextMatches(sourceCode, range, actualName)) {
      return null;
    }

    ranges.set(rangeKey(range), range);
  }

  return ranges.size > 0 ? [...ranges.values()] : null;
}

function getDefaultImportSpecifier(
  node: ImportDeclarationNode,
): ImportDefaultSpecifierNode | null {
  return (
    node.specifiers?.find(specifier => specifier.type === "ImportDefaultSpecifier") ?? null
  );
}

function unwrapExpression(node: AstNode | undefined): AstNode | undefined {
  let current = node;

  while (
    current &&
    (current.type === "ChainExpression" ||
      current.type === "ParenthesizedExpression" ||
      current.type === "TSAsExpression" ||
      current.type === "TSNonNullExpression" ||
      current.type === "TSSatisfiesExpression" ||
      current.type === "TSTypeAssertion")
  ) {
    current = current.expression;
  }

  return current;
}

function getExportedDeclarationName(node: AstNode | undefined): string | null {
  const declaration = unwrapExpression(node);
  if (!declaration) {
    return null;
  }

  if (declaration.type === "Identifier") {
    return getIdentifierName(declaration);
  }

  if (
    (declaration.type === "FunctionDeclaration" || declaration.type === "ClassDeclaration") &&
    declaration.id
  ) {
    return getIdentifierName(declaration.id);
  }

  return null;
}

function isDefaultExportName(node: unknown): boolean {
  return getIdentifierName(node) === "default" || getLiteralValue(node) === "default";
}

function getLocalExportName(node: unknown): string | null {
  const literalValue = getLiteralValue(node);

  return getIdentifierName(node) ?? (typeof literalValue === "string" ? literalValue : null);
}

function getNamedDefaultExportName(node: AstNode): string | null {
  if (node.source) {
    return null;
  }

  for (const specifier of node.specifiers ?? []) {
    if (isDefaultExportName(specifier.exported)) {
      return getLocalExportName(specifier.local);
    }
  }

  return null;
}

function isDefaultExportEntry(entry: StaticExportEntry): boolean {
  return (
    (entry.exportName?.kind === "Default" || entry.exportName?.name === "default") &&
    entry.isType !== true
  );
}

function getEntryLocalDefaultName(entry: StaticExportEntry): string | null {
  const localName = entry.localName;
  if (
    localName &&
    typeof localName.name === "string" &&
    localName.name &&
    localName.name !== "default" &&
    localName.kind !== "None"
  ) {
    return localName.name;
  }

  const importName = entry.importName;
  if (
    !entry.moduleRequest &&
    importName &&
    typeof importName.name === "string" &&
    importName.name &&
    importName.name !== "default" &&
    importName.kind !== "None"
  ) {
    return importName.name;
  }

  return null;
}

function getDefaultReExportSpecifier(entry: StaticExportEntry): string | null {
  if (!isDefaultExportEntry(entry) || !entry.moduleRequest) {
    return null;
  }

  const importName = entry.importName;
  if (importName?.name !== "default") {
    return null;
  }

  return typeof entry.moduleRequest.value === "string" ? entry.moduleRequest.value : null;
}

function parseModule(filePath: string): ParsedModule | null {
  const sourceText = readTextFile(filePath);
  if (sourceText === null) {
    return null;
  }

  const cached = parsedModuleCache.get(filePath);
  if (cached && cached.sourceText === sourceText) {
    return cached.parsedModule;
  }

  try {
    const parsedModule = parseSync(filePath, sourceText, {
      astType: "ts",
      preserveParens: true,
      sourceType: "module",
    }) as ParsedModule;

    parsedModuleCache.set(filePath, { parsedModule, sourceText });

    return parsedModule;
  } catch {
    parsedModuleCache.set(filePath, { parsedModule: null, sourceText });

    return null;
  }
}

function getDefaultExportNameFromParsedModule(
  parsedModule: ParsedModule,
  filePath: string,
  seen: Set<string>,
): string | null {
  for (const staticExport of parsedModule.module?.staticExports ?? []) {
    for (const entry of staticExport.entries ?? []) {
      if (!isDefaultExportEntry(entry)) {
        continue;
      }

      const localName = getEntryLocalDefaultName(entry);
      if (localName) {
        return localName;
      }

      const reExportSpecifier = getDefaultReExportSpecifier(entry);
      if (reExportSpecifier) {
        const reExportPath = resolveImportSpecifier(reExportSpecifier, filePath);
        const reExportName = reExportPath ? getDefaultExportNameFromFile(reExportPath, seen) : null;
        if (reExportName) {
          return reExportName;
        }
      }
    }
  }

  for (const statement of parsedModule.program?.body ?? []) {
    const actualName =
      statement.type === "ExportDefaultDeclaration"
        ? getExportedDeclarationName(statement.declaration)
        : statement.type === "ExportNamedDeclaration"
          ? getNamedDefaultExportName(statement)
          : null;

    if (actualName) {
      return actualName;
    }
  }

  return null;
}

function getDefaultExportNameFromFile(filePath: string, seen = new Set<string>()): string | null {
  const normalizedPath = normalizeAbsolutePath(filePath);
  if (seen.has(normalizedPath)) {
    return null;
  }

  seen.add(normalizedPath);

  const parsedModule = parseModule(normalizedPath);
  if (!parsedModule) {
    return null;
  }

  return getDefaultExportNameFromParsedModule(parsedModule, normalizedPath, seen);
}

function getExpectedImportName(
  importTarget: ImportTarget,
  template: readonly TemplateEntry[],
): string {
  if (importTarget.path) {
    const exportedName = getDefaultExportNameFromFile(importTarget.path);
    if (exportedName) {
      return exportedName;
    }
  }

  return getExpectedName(importTarget, template);
}

const defaultImportNameRule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "enforce default import names matching TypeScript auto-import naming",
      recommended: false,
    },
    fixable: "code",
    messages: {
      unexpected:
        "Default import name '{{actualName}}' should be '{{expectedName}}' for '{{specifier}}'.",
    },
    schema: [],
  },

  createOnce(context: RuleContext) {
    return {
      ImportDeclaration(node: ImportDeclarationNode) {
        const settings = getPluginSettings(context);
        const ignoredPaths = settings.ignorePaths;
        const ignoredSpecifiers = settings.ignoreSpecifiers ?? DEFAULT_IGNORE_SPECIFIERS;
        const template = getTemplateEntries(settings);
        const filename = getFilename(context);
        const specifier = node.source?.value;
        if (!filename || typeof specifier !== "string" || isIgnoredSpecifier(specifier, ignoredSpecifiers)) {
          return;
        }

        const importTarget = deriveImportTarget(specifier, filename);
        if (isIgnoredPath(importTarget.path, ignoredPaths, context)) {
          return;
        }

        const defaultImport = getDefaultImportSpecifier(node);
        const actualName = getIdentifierName(defaultImport?.local);
        if (!defaultImport || !actualName) {
          return;
        }

        const expectedName = getExpectedImportName(importTarget, template);
        if (actualName === expectedName) {
          return;
        }

        context.report({
          node: defaultImport,
          messageId: "unexpected",
          data: {
            actualName,
            expectedName,
            specifier,
          },
          fix(fixer) {
            const ranges = getSafeRenameRanges(
              getSourceCode(context),
              defaultImport,
              actualName,
              expectedName,
            );

            return ranges?.map(range => fixer.replaceTextRange(range, expectedName)) ?? null;
          },
        });
      },
    };
  },
};

const defaultExportNameRule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "enforce default export names matching TypeScript fallback module names",
      recommended: false,
    },
    messages: {
      unexpected:
        "Default export name '{{actualName}}' should be '{{expectedName}}' for this file.",
    },
    schema: [],
  },

  createOnce(context: RuleContext) {
    return {
      Program(node: AstNode) {
        const settings = getPluginSettings(context);
        const ignoredPaths = settings.ignorePaths;
        const template = getTemplateEntries(settings);
        const filename = getFilename(context);
        if (!filename || isIgnoredPath(filename, ignoredPaths, context)) {
          return;
        }

        const expectedName = getExpectedName(deriveExportNameInput(filename), template);

        for (const statement of node.body ?? []) {
          const actualName =
            statement.type === "ExportDefaultDeclaration"
              ? getExportedDeclarationName(statement.declaration)
              : statement.type === "ExportNamedDeclaration"
                ? getNamedDefaultExportName(statement)
                : null;

          if (actualName && actualName !== expectedName) {
            context.report({
              node: statement,
              messageId: "unexpected",
              data: {
                actualName,
                expectedName,
              },
            });
          }
        }
      },
    };
  },
};

const plugin = eslintCompatPlugin(definePlugin({
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    "default-import-name": defaultImportNameRule,
    "default-export-name": defaultExportNameRule,
  },
} as Plugin));

export default plugin;
