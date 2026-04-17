import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist", "src/types/api.generated.ts"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
    },
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // New in react-hooks v7 (React Compiler rules) — disable to maintain v5 status quo
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/globals": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
      // Ratchet strategy: rule stays at "warn", max at 400. CI + `npm run lint`
      // use `--max-warnings <N>` where N is the current count of files over 400
      // LOC. Adding a new 400+ LOC file or growing an existing one raises the
      // count past N and fails CI. When files get split, lower N to lock in
      // the win. Target is eventually N=0. lint-staged stays at
      // `--max-warnings 0` so any *newly staged* file must be under 400 LOC.
      // See audit step 38 in docs/audit-report-2026-04.md.
      "max-lines": [
        "warn",
        { max: 400, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  {
    // Tests can be long (fixtures, many scenarios). max-lines targets prod code.
    files: ["**/__tests__/**", "**/*.test.{ts,tsx}"],
    rules: {
      "max-lines": "off",
    },
  },
);
