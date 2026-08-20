import type { Config } from "stylelint";

export const genericIgnoreFiles = [
  "**/node_modules/**",
  "**/coverage/**",
  "**/dist/**",
  "**/out-tsc/**",
  "**/temp/**",
  "**/tmp/**",
  "**/vendor/**",
  "**/*.min.css",
];

export default {
  extends: [
    "stylelint-config-standard",
    "stylelint-config-modern",
    "stylelint-config-clean-order",
    "stylelint-config-html",
    "stylelint-plugin-logical-css/configs/recommended",
  ],
  plugins: ["stylelint-high-performance-animation", "stylelint-plugin-logical-css"],
  reportDescriptionlessDisables: true,
  reportInvalidScopeDisables: true,
  reportNeedlessDisables: true,
  reportUnscopedDisables: true,
  overrides: [
    {
      files: ["*.md", "**/*.md", "*.mdx", "**/*.mdx"],
      customSyntax: "postcss-markdown",
    },
  ],

  rules: {
    // we can do it!
    // "color-no-hex": null,
    // "function-disallowed-list": null,

    "display-notation": "short",
    "relative-selector-nesting-notation": "explicit",
    "value-keyword-layout-mappings": [
      "flow-relative",
      { ignoreProperties: ["caption-side", "offset-anchor", "offset-position"] },
    ],

    "logical-css/require-logical-keywords": null,
    "logical-css/require-logical-properties": null,
    "logical-css/require-logical-units": null,

    "color-no-invalid-hex": true,
    "function-linear-gradient-no-nonstandard-direction": true,
    "function-no-unknown": [true, { ignoreFunctions: ["theme", "screen"] }],
    "unit-no-unknown": true,
    "selector-no-invalid": true,
    "selector-no-deprecated": true,
    "function-url-no-scheme-relative": true,
    "function-url-scheme-disallowed-list": ["javascript", "vbscript"],
    "font-weight-notation": ["numeric", { ignore: ["relative"] }],
    "selector-max-id": [0, { ignoreContextFunctionalPseudoClasses: ["where"] }],
    "selector-no-qualifying-type": [true, { ignore: ["attribute"], severity: "warning" }],
    "declaration-no-important": [true, { severity: "warning" }],
    "time-min-milliseconds": [100, { ignore: ["delay"], severity: "warning" }],

    "plugin/no-low-performance-animation-properties": [true, { ignore: "paint-properties" }],
  },
} satisfies Config;
