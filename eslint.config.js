import js from "@eslint/js";
import tseslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", ".agents/**", ".claude/**", "*.config.js", "*.config.ts"] },
  { files: ["src/**/*.ts"], ...js.configs.recommended },
  ...tseslint.configs.recommended.map((config) => ({ ...config, files: ["src/**/*.ts"] })),
  {
    files: ["src/**/*.ts"],
    plugins: { boundaries },
    settings: {
      "import/resolver": {
        typescript: true,
      },
      "boundaries/elements": [
        { type: "telegram-service", pattern: "src/processes/telegram-service/**" },
        { type: "telegram-teleproto-adapter", pattern: "src/adapters/telegram-teleproto/**" },
        { type: "env", pattern: "src/platform/config/env.ts", mode: "file" },
        { type: "rest-of-src", pattern: "src/**" },
      ],
    },
    rules: {
      "boundaries/element-types": [
        "error",
        {
          default: "allow",
          rules: [
            {
              from: "rest-of-src",
              disallow: ["telegram-teleproto-adapter", "env"],
              message:
                "Only telegram-service may import the teleproto adapter or read Telegram credential env vars.",
            },
          ],
        },
      ],
    },
  },
  {
    // Kysely's documented migration convention types `up`/`down` params as `Kysely<any>`
    // so old migration files stay compilable regardless of later schema changes.
    files: ["src/adapters/sqlite/migrations/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
