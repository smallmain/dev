import { Command } from "commander";
import { runCreateCommand } from "./create.ts";
import { runSetGitHookCommand } from "./git-hook.ts";
import { runLintCommand } from "./lint.ts";
import { readPackageJson } from "./package-info.ts";
import { runStagedRunCommand } from "./staged-run.ts";

function collectOption(value: string, previousValues: string[]): string[] {
  return [...previousValues, value];
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
    .option("--name <name>", "Package name.")
    .option("--description <description>", "English description.")
    .option("--zh-name <name>", "Chinese display name.")
    .option("--zh-description <description>", "Chinese description.")
    .option("--github-owner <owner>", "GitHub repository owner.")
    .option("--github-repo <repo>", "GitHub repository name.")
    .option("--runtime <runtime>", "Runtime environment. Supports neutral, browser, nodejs.")
    .option("--node-version <version>", "Node.js version when runtime is nodejs.")
    .option("--css <css>", "CSS mode when component css is enabled. Supports native, css-modules, tailwind.")
    .option(
      "--stack <stack>",
      "Tech stack. Repeat or use commas for multiple values.",
      collectOption,
      [],
    )
    .option("--preset <preset>", "Preset. Currently supports npm-package.")
    .option(
      "--component <component>",
      "Component. Supports git-hook, vitest, css, react, security. Repeat or use commas for multiple values.",
      collectOption,
      [],
    )
    .action(options => runCreateCommand(options, packageJson));

  program
    .command("lint [files...]")
    .description("Run project lint tools.")
    .option("--fix", "Automatically fix problems.")
    .action((files: string[], options: { fix?: boolean }) => runLintCommand(files, options));

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
