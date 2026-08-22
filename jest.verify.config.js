/**
 * Config for the live API verification only (`npm run verify:api`).
 *
 * Deliberately avoids the `jest-expo` preset. That preset installs Expo's
 * WinterCG `fetch` over Node's, backed by a stub native module whose responses
 * carry no `status` — fine for unit tests that never touch the network, fatal
 * for the one suite whose entire purpose is a real HTTP call.
 *
 * It also skips `babel-preset-expo`, which rewrites `process.env` reads into an
 * ESM module under `node_modules` that nothing here transforms. `src/api`
 * imports no React Native and needs no Expo transform — stripping TypeScript is
 * the whole job.
 */
module.exports = {
  testEnvironment: 'node',
  rootDir: __dirname,
  testMatch: ['<rootDir>/src/api/__tests__/live-server.test.ts'],
  transform: {
    '^.+\.[jt]sx?$': [
      'babel-jest',
      {
        // Node 21 runs every syntax feature here natively, so the only
        // transforms needed are stripping the types and turning ES modules
        // into the CommonJS that Jest's runtime loads.
        presets: ['@babel/preset-typescript'],
        plugins: ['@babel/plugin-transform-modules-commonjs'],
      },
    ],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
