import { Command } from "commander";
import {
  runCheckCommand,
  runCheckCommitMessageCommand,
  runCheckFormatCommand,
  runCheckLintCommand,
} from "./check.ts";
import { runCreateCommand } from "./create.ts";
import { runSetGitHookCommand } from "./git-hook.ts";
import { readPackageJson } from "./package-info.ts";
import { runStagedRunCommand } from "./staged-run.ts";

function collectOption(value: string, previousValues: string[]): string[] {
  return [...previousValues, value];
}

function getCheckSubcommandFixOption(
  options: { fix?: boolean },
  command: Command,
): boolean | undefined {
  const ownOptions = options;
  const parentOptions = command.parent?.opts<{ fix?: boolean }>();

  return ownOptions.fix ?? parentOptions?.fix;
}

async function main(): Promise<void> {
  const packageJson = await readPackageJson();
  const program = new Command();

  program
    .name("sm")
    .description("SmallMain development scaffolding CLI.")
    .version(packageJson.version ?? "0.0.0");

  program
    .command("create")
    .description("Create a project in the current working directory.")
    .option("-y, --yes", "Use defaults and skip prompts.")
    .option("--name <name>", "Package Name.")
    .option("--description <description>", "Package Description.")
    .option("--zh-name <name>", "Chinese display name.")
    .option("--zh-description <description>", "Chinese description.")
    .option("--github-owner <owner>", "GitHub Owner.")
    .option("--github-repo <repo>", "GitHub Repo.")
    .option("--runtime <runtime>", "Runtime environment. Supports neutral, browser, nodejs.")
    .option("--node-version <version>", "Node.js version when runtime is nodejs.")
    .option(
      "--css <css>",
      "CSS mode when component css is enabled. Supports native, css-modules, tailwind.",
    )
    .option("--preset <preset>", "Preset. Currently supports npm-package.")
    .option("--package-manager <package-manager>", "Package manager. Supports npm, pnpm.")
    .option(
      "--component <component>",
      "Optional component. Supports git-hook, react, css, security. Repeat or use commas for multiple values.",
      collectOption,
      [],
    )
    .action(options => runCreateCommand(options, packageJson));

  const checkCommand = program
    .command("check [files...]")
    .description("Run project checks.")
    .option("--no-lint", "Skip linter checks.")
    .option("--no-format", "Skip formatter checks.")
    .option("--fix", "Automatically fix problems.")
    .action((files: string[], options: { lint?: boolean; format?: boolean; fix?: boolean }) =>
      runCheckCommand(files, options),
    );

  checkCommand
    .command("lint [files...]")
    .description("Run project linter checks.")
    .option("--fix", "Automatically fix problems.")
    .action((files: string[], options: { fix?: boolean }, command: Command) =>
      runCheckLintCommand(files, { fix: getCheckSubcommandFixOption(options, command) }),
    );

  checkCommand
    .command("format [files...]")
    .description("Run project formatter checks.")
    .option("--fix", "Automatically fix problems.")
    .action((files: string[], options: { fix?: boolean }, command: Command) =>
      runCheckFormatCommand(files, { fix: getCheckSubcommandFixOption(options, command) }),
    );

  checkCommand
    .command("commit-message [file]")
    .description("Check a commit message.")
    .option("--text <message>", "Check the passed commit message text.")
    .action((file: string | undefined, options: { text?: string }) =>
      runCheckCommitMessageCommand(file, options),
    );

  program
    .command("staged-run [command] [globs...]")
    .description("Run a command against staged files matched by Git pathspecs.")
    .option("--update-index", "Run git update-index --again after the command succeeds.")
    .action((command: string | undefined, globs: string[], options: { updateIndex?: boolean }) =>
      runStagedRunCommand(command, globs, options),
    );

  program
    .command("set-git-hook")
    .description("Install the sm pre-commit Git hook.")
    .option("--force", "Overwrite an existing non-sm pre-commit hook.")
    .action((options: { force?: boolean }) => runSetGitHookCommand(options));

  await program.parseAsync();
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
