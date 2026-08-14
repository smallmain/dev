# TODO: Config

[English](config.md) | 简体中文

定义一种开发配置文件，并使用 [c12](https://github.com/unjs/c12) 配置加载器。

## 支持性

- 文件名：`sm.config`
- 开启 `c12` 支持的所有文件格式
- 不支持从 `package.json` 的 `sm` 字段中加载配置
- 不支持 `.rc` 文件
- 不从 `.env` 文件中加载配置
- 禁用 `giget`
- 支持 `extends` 字段继承其他配置文件

## 配置格式

```ts
interface Config {
  /**
   * Inherit from other configurations.
   */
  extends?: unspecified; // <- 根据 `c12` 支持的类型决定

  /**
   * Web technology stack configuration.
   */
  web?: WebConfig;
}

interface WebConfig {
  /**
   * 开发时的平台；构建时的默认平台。
   *
   * @default "neutral"
   */
  platform?: "node" | "browser" | "neutral";

  /**
   * 开发时激活的额外条件。
   *
   * @default 如果提供了 {@link platform} 则自动推断。
   */
  activeConditions?: string[] | Record<string, string>;
}
```

## `update-config` 命令

npmpackagejsonlint + publint + attw + knip
