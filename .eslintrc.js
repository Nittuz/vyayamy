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
    // Architectural boundary: the Supabase client lives behind src/auth and
    // src/sync. Everything else uses the auth facade (src/auth/authActions) or
    // the queries layer — so the network surface the app depends on stays small
    // and auditable (#35). Allowed dirs opt out in overrides below.
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@/auth/supabase',
            message:
              'Import the Supabase client only in src/auth or src/sync. Use the auth facade (@/auth/authActions) or the queries layer elsewhere.',
          },
        ],
      },
    ],
  },
  overrides: [
    {
      // Jest globals (jest/describe/test/expect/beforeEach/...) in the setup file
      // and test suites. Without this, `npm run lint` is red on jest references
      // and any CI gate built on it is dead on arrival (#82).
      files: ['jest.setup.js', '**/__tests__/**', '**/*.test.{ts,tsx}'],
      env: { jest: true, node: true },
    },
    {
      // src/auth and src/sync ARE the boundary — they may import the client.
      files: ['src/auth/**', 'src/sync/**'],
      rules: { 'no-restricted-imports': 'off' },
    },
  ],
};
