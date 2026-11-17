import js from "@eslint/js";
import globals from "globals";
import eslintReact from "@eslint-react/eslint-plugin";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      ".rea/**",
      "public/**",
      "tmp/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["src/**/*.{js,jsx}"],
    ...eslintReact.configs.recommended,
    rules: {
      ...eslintReact.configs.recommended.rules,
      // eslint-plugin-react-hooks owns the hook rules; avoid double reports.
      "@eslint-react/exhaustive-deps": "off",
      "@eslint-react/rules-of-hooks": "off",
      "@eslint-react/set-state-in-effect": "off",
      "@eslint-react/static-components": "off",
    },
  },
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-unused-vars": ["warn", { varsIgnorePattern: "^_", argsIgnorePattern: "^_" }],
    },
  },
  {
    files: [
      "vite.config.js",
      "vitest.config.js",
      "playwright.config.js",
      "eslint.config.js",
      "scripts/**/*.mjs",
      "e2e/**/*.js",
    ],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    // Playwright fixtures receive a `use` callback that is not a React hook.
    files: ["e2e/**/*.js"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
];
