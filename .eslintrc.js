module.exports = {
  root: true,
  extends: ['expo'],
  ignorePatterns: ['node_modules', 'dist', '.expo'],
  rules: {
    'import/order': [
      'warn',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'always',
      },
    ],
  },
};
