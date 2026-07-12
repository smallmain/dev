import { buildCli } from "./cli-e2e-utils.ts";

export default async function globalSetup(): Promise<void> {
  await buildCli();
}
