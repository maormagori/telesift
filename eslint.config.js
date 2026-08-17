import js from "@eslint/js";
import tseslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      ".agents/**",
      ".claude/**",
      "*.config.js",
      "*.config.ts",
      "src/processes/app/web/dist/**",
    ],
  },
  { files: ["src/**/*.ts"], ignores: ["src/processes/app/web/**"], ...js.configs.recommended },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["src/**/*.ts"],
    ignores: ["src/processes/app/web/**"],
  })),
  {
    files: ["src/**/*.ts"],
    ignores: ["src/processes/app/web/**"],
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
  // The app UI is a browser-targeted Vite/React SPA, not part of the NodeNext backend
  // build (see tsconfig.json's exclude) — it gets its own lighter, non-type-checked ruleset.
  { files: ["src/processes/app/web/**/*.{ts,tsx}"], ...js.configs.recommended },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["src/processes/app/web/**/*.{ts,tsx}"],
  })),
  {
    files: ["src/processes/app/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // This rule targets React Compiler-era codebases and flags plain
      // fetch-on-mount effects (including setState reached via an awaited
      // helper) as if they ran synchronously. Not a fit for this v1 UI.
      "react-hooks/set-state-in-effect": "off",
    },
  },
);
