import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
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
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    settings: {
      react: { version: "17.0" },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      "react/display-name": "off",
      "react/no-unescaped-entities": "off",
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
