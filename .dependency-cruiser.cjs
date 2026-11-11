// Package-boundary lint. The rules live in tools/boundaries/rules.cjs so a test can exercise
// exactly the same rules against fixtures. Run with `pnpm lint:boundaries`.
const { forbidden } = require('./tools/boundaries/rules.cjs');

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden,
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types'],
    },
    // Only the repo's own build output. A pattern like "(^|/)dist/" would also hide npm packages
    // whose entry point lives in node_modules/<pkg>/dist/, and with it every allowlist violation.
    exclude: { path: '^(apps|packages|tools)/[^/]+/(dist|coverage|\\.vite)/' },
  },
};
