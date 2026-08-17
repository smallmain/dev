const DIRECTIVE_NAMES = [
  "oxlint-disable",
  "oxlint-enable",
  "oxlint-disable-line",
  "oxlint-disable-next-line",
] as const;

type DirectiveName = (typeof DIRECTIVE_NAMES)[number];

type CommentNode = {
  loc?: unknown;
  value?: unknown;
};

type SourceCode = {
  ast?: {
    comments?: CommentNode[];
  };
  getAllComments?: () => CommentNode[];
};

type RequireDescriptionOptions = {
  ignore?: readonly DirectiveName[];
};

type RuleContext = {
  getSourceCode?: () => SourceCode | undefined;
  options: readonly RequireDescriptionOptions[];
  report: (descriptor: { loc?: unknown; messageId: "missingDescription" }) => void;
  sourceCode?: SourceCode;
};

type DirectiveComment = {
  body: string;
  directive: DirectiveName;
};

const DIRECTIVE_NAME_SET: ReadonlySet<string> = new Set(DIRECTIVE_NAMES);
const DIRECTIVE_PATTERN =
  /^(?<directive>oxlint-(?:disable-next-line|disable-line|disable|enable))\b(?<body>[\s\S]*)$/u;
const DESCRIPTION_PATTERN = /(?:^|\s)--(?<description>[\s\S]*)$/u;

function isDirectiveName(directive: string): directive is DirectiveName {
  return DIRECTIVE_NAME_SET.has(directive);
}

function getSourceCode(context: RuleContext): SourceCode | undefined {
  return context.sourceCode ?? context.getSourceCode?.();
}

function getAllComments(sourceCode: SourceCode | undefined): CommentNode[] {
  if (!sourceCode) {
    return [];
  }

  if (typeof sourceCode.getAllComments === "function") {
    return sourceCode.getAllComments();
  }

  return sourceCode.ast?.comments ?? [];
}

function getCommentText(comment: CommentNode): string {
  return typeof comment.value === "string" ? comment.value.trimStart() : "";
}

function parseDirectiveComment(comment: CommentNode): DirectiveComment | null {
  const match = DIRECTIVE_PATTERN.exec(getCommentText(comment));
  if (!match) {
    return null;
  }

  const directive = match.groups?.directive;
  if (!directive || !isDirectiveName(directive)) {
    return null;
  }

  return {
    directive,
    body: match.groups?.body ?? "",
  };
}

function hasDescription(body: string): boolean {
  const description = DESCRIPTION_PATTERN.exec(body)?.groups?.description;
  return Boolean(description?.trim());
}

const requireDescriptionRule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "require descriptions in Oxlint directive comments",
      recommended: false,
    },
    messages: {
      missingDescription:
        "Unexpected directive comment without a description. Include a description after '--' to explain why the comment is necessary.",
    },
    schema: [
      {
        type: "object",
        properties: {
          ignore: {
            type: "array",
            items: {
              enum: DIRECTIVE_NAMES,
            },
            additionalItems: false,
            uniqueItems: true,
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context: RuleContext) {
    const ignoredDirectives = new Set(context.options[0]?.ignore ?? []);

    return {
      Program() {
        const sourceCode = getSourceCode(context);

        for (const comment of getAllComments(sourceCode)) {
          const directiveComment = parseDirectiveComment(comment);
          if (!directiveComment) {
            continue;
          }

          if (ignoredDirectives.has(directiveComment.directive)) {
            continue;
          }

          if (!hasDescription(directiveComment.body)) {
            context.report({
              loc: comment.loc,
              messageId: "missingDescription",
            });
          }
        }
      },
    };
  },
};

const plugin = {
  meta: {
    name: "comments",
  },
  rules: {
    "require-description": requireDescriptionRule,
  },
};

export default plugin;
