# ECMAScript Conditional Constant Specification

English | [简体中文](ecc.zh.md)

## Introduction

This document defines a specification for organizing and automatically generating conditional constants for ECMAScript.

## Background

This specification is defined on top of the [ECMAScript Module Specification](https://tc39.es/ecma262/#sec-modules) and the [Node.js Package Specification](https://nodejs.org/api/packages.html).

It remains compatible with the ECMAScript Module Specification and the Node.js Package Specification.

## Concepts

- Conditional constants are organized in groups.
- Each group always has one `default` conditional constant.
- Only one condition in a group is satisfied at a time.
- Multiple groups of conditional constants may exist.
- A conditional constant has a name that is unique within its group.
- The value of a conditional constant is a boolean.
- Conditional constants are bound to conditional exports/imports.

## Configuration

It is recommended to declare all conditional constants in a separate configuration. This specification does not require that.

A typical configuration example:

```js
{
  conditions: [
    "react-native",
    "node",
    "deno",
  ],
}
```

A typical multi-group configuration example:

```js
{
  conditions: {
    runtime: [
      "react-native",
      "node",
    ],
    platform: [
      "ios",
      "android",
    ],
  }
}
```

The `default` conditional constant always exists and does not need to be declared explicitly.


## Code imports

Conditional constants must be importable with `import { CONDITION_NAME } from "..."`.

- There is no specific requirement for the module identifier.
- The symbol name matches the conditional constant name.
- Symbol names are converted to uppercase, and `-` is converted to `_`.

Using the single-group configuration above as an example:

```ts
declare module "conditional-constant" {
  export const REACT_NATIVE: boolean;
  export const NODE: boolean;
  export const DEFAULT: boolean;
}
```

Using the multi-group configuration above as an example:

```ts
declare module "conditional-constant/runtime" {
  export const REACT_NATIVE: boolean;
  export const NODE: boolean;
  export const DEFAULT: boolean;
}

declare module "conditional-constant/platform" {
  export const IOS: boolean;
  export const ANDROID: boolean;
  export const DEFAULT: boolean;
}
```

## Conditional exports

Each conditional constant must correspond to an export condition.

- The symbol name matches the conditional constant name.
- The `default` condition must be placed last.

Using the single-group configuration above as an example:

`package.json`

```json
{
  "exports": {
    "react-native": "./dist/react-native/index.js",
    "node": "./dist/node/index.js",
    "default": "./dist/default/index.js"
}
```

Using the multi-group configuration above as an example:

`package.json`

```json
{
  "exports": {
    "react-native": {
      "ios": "./dist/react-native/ios/index.js",
      "android": "./dist/react-native/android/index.js",
      "default": "./dist/react-native/default/index.js"
    },
    "node": {
      "ios": "./dist/node/ios/index.js",
      "android": "./dist/node/android/index.js",
      "default": "./dist/node/default/index.js"
    },
    "default": {
      "ios": "./dist/default/ios/index.js",
      "android": "./dist/default/android/index.js",
      "default": "./dist/default/default/index.js"
    }
}
```
