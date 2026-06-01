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
    // React Compiler rules (eslint-plugin-react-hooks v6, newly enabled by
    // eslint-config-expo in SDK 56). They false-positive on legitimate
    // Reanimated/gesture patterns (reading shared values / refs during render,
    // worklet mutations). Kept as warnings so they stay visible without blocking.
    'react-hooks/refs': 'warn',
    'react-hooks/immutability': 'warn',
    'react-hooks/purity': 'warn',
    'react-hooks/set-state-in-effect': 'warn',
  },
};
