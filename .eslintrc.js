module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  extends: [
    "eslint:recommended",
    "@typescript-eslint/recommended",
    "@typescript-eslint/recommended-requiring-type-checking",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    project: "./tsconfig.json",
  },
  plugins: ["@typescript-eslint"],
  rules: {
    // Unused variables and arguments - treat as errors
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/no-unused-expressions": "error",

    // Consistent type imports
    "@typescript-eslint/consistent-type-imports": [
      "error",
      {
        prefer: "type-imports",
        fixStyle: "inline-type-imports",
        disallowTypeAnnotations: false,
      },
    ],
    "@typescript-eslint/consistent-type-exports": "error",

    // Strict TypeScript rules
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-non-null-assertion": "error",
    "@typescript-eslint/prefer-nullish-coalescing": "error",
    "@typescript-eslint/prefer-optional-chain": "error",
    "@typescript-eslint/no-unnecessary-type-assertion": "error",
    "@typescript-eslint/no-unnecessary-condition": "error",
    "@typescript-eslint/no-unnecessary-type-constraint": "error",
    "@typescript-eslint/no-unnecessary-type-arguments": "error",

    // Function parameter rules
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      },
    ],

    // Import/export rules
    "@typescript-eslint/no-import-type-side-effects": "error",

    // General code quality
    "no-console": "warn",
    "no-debugger": "error",
    "no-alert": "error",
    "no-var": "error",
    "prefer-const": "error",
    "no-duplicate-imports": "error",

    // TypeScript specific
    "@typescript-eslint/explicit-function-return-type": [
      "error",
      {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
        allowHigherOrderFunctions: true,
        allowDirectConstAssertionInArrowFunctions: true,
        allowConciseArrowFunctionExpressionsStartingWithVoid: true,
      },
    ],
    "@typescript-eslint/explicit-module-boundary-types": "error",
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/await-thenable": "error",
    "@typescript-eslint/no-misused-promises": "error",
    "@typescript-eslint/require-await": "error",
    "@typescript-eslint/return-await": "error",
  },
  ignorePatterns: ["dist/", "node_modules/", "*.js", "*.mjs", "*.cjs"],
};
