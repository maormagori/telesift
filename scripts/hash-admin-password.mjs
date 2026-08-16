#!/usr/bin/env node
// One-off operator tool: prompts for the app UI's admin password and prints a
// scrypt$<salt>$<hash> string for .env. Not part of the running `app` process —
// mirrors scripts/generate-telegram-session.mjs's "run once, paste the output,
// throw the process away" pattern. Never commit the printed string.

import { randomBytes, scryptSync } from "node:crypto";

const KEY_CTRL_C = 0x03;
const KEY_BACKSPACE = 0x7f;
const SCRYPT_KEY_LENGTH = 64;

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
  const password = await askHidden("Admin password: ");
  if (!password) throw new Error("Password must not be empty");
  const confirmation = await askHidden("Confirm password: ");
  if (password !== confirmation) throw new Error("Passwords did not match");

  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEY_LENGTH);

  console.log("\nPut this in your local .env as APP_ADMIN_PASSWORD_HASH:\n");
  console.log(`scrypt$${salt.toString("hex")}$${hash.toString("hex")}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
