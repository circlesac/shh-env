#!/usr/bin/env bun
/**
 * shh-env - Load secrets from OS keychain as environment variables
 *
 * Usage:
 *   shh-env run [--service <name>] [--env <env>] -- <command> [args...]
 *   shh-env set <KEY> [--service <name>] [--env <env>]
 *   shh-env get <KEY> [--service <name>] [--env <env>]
 *   shh-env delete <KEY> [--service <name>] [--env <env>]
 *   shh-env list [--service <name>] [--env <env>]
 */

import { defineCommand, runMain } from "citty";
import setCommand from "./commands/set";
import getCommand from "./commands/get";
import deleteCommand from "./commands/delete";
import listCommand from "./commands/list";
import runCommand from "./commands/run";

const main = defineCommand({
  meta: {
    name: "shh-env",
    version: "26.2.2",
    description:
      "Load secrets from OS keychain and inject as environment variables",
  },
  subCommands: {
    set: setCommand,
    get: getCommand,
    delete: deleteCommand,
    list: listCommand,
    run: runCommand,
  },
});

runMain(main);
