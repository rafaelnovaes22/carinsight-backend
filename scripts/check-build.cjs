const { existsSync } = require('node:fs');
const { join } = require('node:path');

// Keep the production command aligned with TypeScript's emitted root directory.
const entrypoint = join(__dirname, '..', 'dist', 'main.js');
if (!existsSync(entrypoint)) {
  throw new Error(`Production entrypoint missing: expected ${entrypoint}`);
}
