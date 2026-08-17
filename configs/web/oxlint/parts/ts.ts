import { defineConfig } from "oxlint";
import { tsExtGlob } from "../../shared/file-extension.js";

export default defineConfig({
  overrides: [
    {
      files: [`**/*.${tsExtGlob}`],
      rules: {
        "constructor-super": "off",
        "no-class-assign": "off",
        "no-const-assign": "off",
        "no-dupe-class-members": "off",
        "no-dupe-keys": "off",
        "no-func-assign": "off",
        "no-import-assign": "off",
        "no-new-native-nonconstructor": "off",
        "no-obj-calls": "off",
        "no-redeclare": "off",
        "no-setter-return": "off",
        "no-this-before-super": "off",
        "no-undef": "off",
        "no-unsafe-negation": "off",
        "no-with": "off",
        "valid-typeof": "off",
        "use-isnan": "off",
        "no-delete-var": "off",

        "import/named": "off",
        "import/default": "off",
        "import/namespace": "off",

        "react/jsx-no-undef": "off",
        "react/jsx-no-duplicate-props": "off",
        "react/react-in-jsx-scope": "off",

        "oxc/bad-array-method-on-arguments": "off",
        "oxc/bad-object-literal-comparison": "off",

        "promise/no-new-statics": "off",
        "promise/valid-params": "off",

        // noImplicitReturns: true
        "getter-return": "off",
        "typescript/consistent-return": "off",
        // allowUnreachableCode: false
        "no-unreachable": "off",
        // noFallthroughCasesInSwitch: true
        "no-fallthrough": "off",
        // noUnusedLocals: true and noUnusedParameters: true
        "no-unused-vars": "off",
        "no-unused-private-class-members": "off",
        // allowUnusedLabels: false
        "no-unused-labels": "off",
        // strictPropertyInitialization: true
        "no-use-before-define": "off",
        // strictNullChecks: true
        "no-unsafe-optional-chaining": "off",
      },
    },
  ],
});
