import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import eslintConfigPrettier from "eslint-config-prettier";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Playwright fixtures use `use` as the injection callback parameter name
    // (per @playwright/test docs). It's unrelated to React's `use` hook, but
    // react-hooks/rules-of-hooks flags it heuristically.
    files: ["smoke/**/*.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
  eslintConfigPrettier,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "smoke/test-results/**",
      "smoke/playwright-report/**",
    ],
  },
];

export default eslintConfig;
