// Only the style rules we enforce: block bodies with an explicit return, and braces on every statement.
module.exports = [
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs' },
    rules: {
      'arrow-body-style': ['error', 'always'],
      curly: ['error', 'all'],
    },
  },
  { ignores: ['node_modules/**', 'test-results/**', '.playwright-mcp/**'] },
];
