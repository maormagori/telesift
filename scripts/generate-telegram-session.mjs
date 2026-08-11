#!/usr/bin/env node
// One-off operator tool: logs in interactively (phone/code/2FA) and prints a
// TELEGRAM_SESSION string for .env. Not part of telegram-service itself —
// v1 deliberately keeps login out of the running service (see AGENTS.md,
// Security and Secrets). Run it, paste the printed string into your local
// .env, then throw this process away. Never commit the printed string.

import { createInterface } from "node:readline/promises";
import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions/index.js";

const rl = createInterface({ input: process.stdin, output: process.stdout });

async function ask(question) {
  return (await rl.question(question)).trim();
}

const KEY_CTRL_C = 0x03;
const KEY_BACKSPACE = 0x7f;

async function askHidden(question) {
  process.stdout.write(question);
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode?.(true);
    stdin.resume();
    let value = "";
    const onData = (chunk) => {
      if (chunk.length === 1 && chunk[0] === KEY_CTRL_C) process.exit(1);
      if (chunk.length === 1 && chunk[0] === KEY_BACKSPACE) {
        value = value.slice(0, -1);
        return;
      }
      const char = chunk.toString("utf8");
      if (char === "\r" || char === "\n") {
        stdin.setRawMode?.(wasRaw ?? false);
        stdin.off("data", onData);
        process.stdout.write("\n");
        resolve(value);
        return;
      }
      value += char;
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const apiId = Number(await ask("API ID (from my.telegram.org): "));
  if (!Number.isInteger(apiId)) throw new Error("API ID must be an integer");
  const apiHash = await ask("API hash (from my.telegram.org): ");
  const phoneNumber = await ask("Phone number (international format, e.g. +15551234567): ");

  const client = new TelegramClient(new StringSession(""), apiId, apiHash, { connectionRetries: 5 });

  await client.start({
    phoneNumber: () => Promise.resolve(phoneNumber),
    phoneCode: async () => ask("Login code Telegram just sent you: "),
    password: async (hint) => askHidden(`2FA password${hint ? ` (hint: ${hint})` : ""}: `),
    onError: async (error) => {
      console.error("Login error:", error.message);
      return true; // stop on error rather than retrying forever
    },
  });

  const session = client.session.save();
  await client.disconnect();
  rl.close();

  console.log("\nLogin succeeded. Put this in your local .env as TELEGRAM_SESSION:\n");
  console.log(session);
  console.log("\nThis string grants full access to the Telegram account. Never commit it or share it.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
