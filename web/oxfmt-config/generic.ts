import { defineConfig } from "oxfmt";

export default defineConfig({
  arrowParens: "avoid",
  jsdoc: {
    commentLineStrategy: "keep",
    descriptionWithDot: true,
    preferCodeFences: true,
  },
  quoteProps: "preserve",
  sortImports: {
    newlinesBetween: false,
    partitionByComment: true,
  },
  sortTailwindcss: {
    functions: ["clsx", "cn"],
  },
});
