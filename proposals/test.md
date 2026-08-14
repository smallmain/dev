# Testing

English | [简体中文](test.zh.md)

Use Vitest for testing.

## End-to-end tests

CLI commands and Oxlint plugins are both verified end-to-end:

- Set up a real project fixture in a temporary directory, and run the logic under test through real commands and a real toolchain (such as Oxlint, Stylelint, and Git).
- Do not mock or stub the command under test itself or the toolchain it invokes.
- Only when a dependency would produce uncontrollable external side effects (such as installing dependencies over the network) may a minimal stand-in be used at that external boundary, and the stand-in must not change the behavior of the command under test.
