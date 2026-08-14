# TODO: Config

English | [简体中文](config.zh.md)

Define a development configuration file and use the [c12](https://github.com/unjs/c12) config loader.

## Support

- File name: `sm.config`
- Enable all file formats supported by `c12`
- Loading configuration from the `sm` field in `package.json` is not supported
- `.rc` files are not supported
- Configuration is not loaded from `.env` files
- Disable `giget`
- The `extends` field is supported for inheriting other configuration files

## Configuration format

```ts
interface Config {
  /**
   * Inherit from other configurations.
   */
  extends?: unspecified; // <- Determined by the types supported by `c12`

  /**
   * Web technology stack configuration.
   */
  web?: WebConfig;
}

interface WebConfig {
  /**
   * Platform during development; the default platform at build time.
   *
   * @default "neutral"
   */
  platform?: "node" | "browser" | "neutral";

  /**
   * Extra conditions activated during development.
   *
   * @default Automatically inferred if {@link platform} is provided.
   */
  activeConditions?: string[] | Record<string, string>;
}
```

## `update-config` command

npmpackagejsonlint + publint + attw + knip
