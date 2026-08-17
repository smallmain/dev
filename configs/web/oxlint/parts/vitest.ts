import { defineConfig } from "oxlint";
import { scriptExtGlob, testSuffixGlob } from "../../shared/file-extension.js";

export default defineConfig({
  overrides: [
    {
      files: [`**/*.${testSuffixGlob}.${scriptExtGlob}`],
      plugins: ["vitest"],
      rules: {
        "vitest/consistent-test-filename": [
          "error",
          {
            allTestPattern: ".*\\.(test|spec)\\.(?:[mc])?[jt]sx?$",
            pattern: ".*\\.test\\.(?:[mc])?[jt]sx?$",
          },
        ],

        "vitest/consistent-each-for": [
          "warn",
          {
            test: "for",
            it: "for",
            describe: "each",
            suite: "each",
          },
        ],

        "vitest/no-disabled-tests": "warn",
        "vitest/no-focused-tests": "warn",

        "vitest/consistent-test-it": ["warn", { fn: "test", withinDescribe: "it" }],
        "vitest/consistent-vitest-vi": ["warn", { fn: "vi" }],

        "vitest/no-alias-methods": "warn",
        "vitest/no-commented-out-tests": "warn",
        "vitest/no-duplicate-hooks": "warn",
        "vitest/no-identical-title": "warn",
        "vitest/no-import-node-test": "error",
        "vitest/no-interpolation-in-snapshots": "error",
        "vitest/no-mocks-import": "error",
        "vitest/no-test-prefixes": "warn",
        "vitest/no-test-return-statement": "warn",
        "vitest/no-unneeded-async-expect-function": "warn",

        "vitest/prefer-called-exactly-once-with": "warn",
        "vitest/prefer-called-with": "warn",
        "vitest/prefer-comparison-matcher": "warn",
        "vitest/prefer-each": "warn",
        "vitest/prefer-equality-matcher": "warn",
        "vitest/prefer-expect-resolves": "warn",
        "vitest/prefer-expect-type-of": "warn",
        "vitest/prefer-hooks-in-order": "warn",
        "vitest/prefer-hooks-on-top": "warn",
        "vitest/prefer-import-in-mock": "warn",
        "vitest/prefer-importing-vitest-globals": "warn",
        "vitest/prefer-mock-promise-shorthand": "warn",
        "vitest/prefer-mock-return-shorthand": "warn",
        "vitest/prefer-snapshot-hint": ["warn", "multi"],
        "vitest/prefer-spy-on": "warn",
        "vitest/prefer-strict-boolean-matchers": "warn",
        "vitest/prefer-strict-equal": "warn",
        "vitest/prefer-to-be": "warn",
        "vitest/prefer-to-be-object": "warn",
        "vitest/prefer-to-contain": "warn",
        "vitest/prefer-to-have-been-called-times": "warn",
        "vitest/prefer-to-have-length": "warn",
        "vitest/prefer-todo": "warn",

        "vitest/require-mock-type-parameters": ["warn", { checkImportFunctions: true }],
        "vitest/require-to-throw-message": "warn",
      },
    },
  ],
});
