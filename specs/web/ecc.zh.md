# ECMAScript Conditional Constant Specification

[English](ecc.md) | 简体中文

## 简介

本文为 ECMAScript 制定了一种条件常量的组织与自动化生成规范。

## 引言

该规范在 [ECMAScript Module Specification](https://tc39.es/ecma262/#sec-modules) 和 [Node.js Package Specification](https://nodejs.org/api/packages.html) 的基础上进行制定。

保证与 ECMAScript Module Specification 和 Node.js Package Specification 的兼容性。

## 概念

- 条件常量以组的形式组织。
- 每组固定有一个 `default` 条件常量。
- 每组同时只有一个条件会被满足。
- 可以存在多组条件常量。
- 条件常量存在一个组内唯一的名称。
- 条件常量的值为布尔值。
- 条件常量与条件导出/条件导入是绑定关联的。

## 配置

推荐使用单独的配置声明所有的条件常量，规范对此没有任何要求。

一个典型的配置示例如下：

```js
{
  conditions: [
    "react-native",
    "node",
    "deno",
  ],
}
```

一个典型的多组配置示例：

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

`default` 条件常量固定存在，无需显式声明。


## 代码导入

条件常量必须能够通过 `import { CONDITION_NAME } from "..."` 的方式导入。

- 模块标识符没有特定要求。
- 符号名称与条件常量名称一致。
- 符号名称统一被转换为全大写，`-` 被转换为 `_`。

以上面单组的配置举例：

```ts
declare module "conditional-constant" {
  export const REACT_NATIVE: boolean;
  export const NODE: boolean;
  export const DEFAULT: boolean;
}
```

以上面多组条件配置举例：

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

## 条件导出

每个条件常量都必须对应一个导出条件。

- 符号名称与条件常量名称一致。
- `default` 条件必须放在最后。

以上面单组的配置举例：

`package.json`

```json
{
  "exports": {
    "react-native": "./dist/react-native/index.js",
    "node": "./dist/node/index.js",
    "default": "./dist/default/index.js"
}
```

以上面多组的配置举例：

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
