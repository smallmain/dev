import { Config } from "stylelint";

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
    "plugin/no-low-performance-animation-properties": [true, { ignore: "paint-properties" }],
  },
} satisfies Config;
