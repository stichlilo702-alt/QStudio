import eslint from "@eslint/js";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import globals from "globals";
import prettier from "eslint-config-prettier/flat";

const sourceFiles = ["**/*.{js,mjs,cjs,ts,tsx}"];

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "build/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "**/*.generated.*",
      "**/generated/**",
    ],
  },
  eslint.configs.recommended,
  {
    files: sourceFiles,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
    },
  },
  ...typescriptEslint.configs["flat/recommended"],
  prettier,
];
