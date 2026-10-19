/**
 * ESLint Configuration for SuiteScript 2.1
 */
module.exports = {
  env: {
    es2021: true,
    node: true,
    jest: true,
    amd: true
  },
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module'
  },
  globals: {
    define: 'readonly',
    require: 'readonly',
    log: 'readonly'
  },
  rules: {
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': 'off',
    'semi': ['error', 'always'],
    'quotes': ['error', 'single', { avoidEscape: true }],
    'indent': ['error', 2, { SwitchCase: 1 }],
    'comma-dangle': ['error', 'never'],
    'no-trailing-spaces': 'error',
    'eol-last': ['error', 'always'],
    'no-multiple-empty-lines': ['error', { max: 2, maxEOF: 1 }],
    'prefer-const': 'error',
    'no-var': 'error'
  }
};
