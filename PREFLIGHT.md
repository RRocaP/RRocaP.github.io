# Preflight Commands for Portfolio Project

This document describes the available preflight commands to ensure code quality before deployment.

## Quick Start

Run the full preflight check suite:
```bash
npm run preflight
```

## Available Commands

### Full Preflight Suite

#### `npm run preflight`
Runs the complete suite of checks in sequence:
1. Type checking (TypeScript & Astro)
2. Linting (ESLint)
3. Build verification

#### `npm run preflight:verbose`
Same as `preflight` but with detailed progress messages:
```bash
🔍 Running type checks...
🔎 Running linter...
🏗️  Building project...
✅ All preflight checks passed!
```

#### `npm run preflight:fix`
Runs preflight with automatic fixing of linting issues:
1. Type checking
2. Linting with auto-fix
3. Build verification

### Individual Checks

#### `npm run check:types`
- Runs Astro's built-in type checker
- Runs TypeScript compiler in no-emit mode
- Checks for type errors across all `.astro`, `.ts`, and `.tsx` files

#### `npm run lint`
- Runs ESLint on all JavaScript, TypeScript, and Astro files
- Reports style and potential issues

#### `npm run lint:fix`
- Same as `lint` but automatically fixes fixable issues

#### `npm run build`
- Builds the production-ready static site
- Catches any build-time errors

#### `npm run test`
- Currently placeholder (no tests configured)
- Ready for future test implementation

## Common Issues and Solutions

### Type Errors
If you encounter type errors:
1. Check that all imports are correct
2. Ensure TypeScript types are properly defined
3. Run `npm run check:types` to see detailed errors

### Lint Errors
For linting issues:
1. Run `npm run lint:fix` to auto-fix formatting
2. Check `.eslintrc.json` for rule configuration
3. Add `// eslint-disable-next-line` for intentional exceptions

### Build Errors
If build fails:
1. Check console for specific error messages
2. Ensure all dependencies are installed: `npm install`
3. Clear cache and rebuild: `rm -rf dist && npm run build`

## Recommended Workflow

1. Before committing:
   ```bash
   npm run preflight:fix
   ```

2. In CI/CD pipeline:
   ```bash
   npm run preflight
   ```

3. For quick checks during development:
   ```bash
   npm run check:types
   ```

## Configuration Files

- **TypeScript**: `tsconfig.json`
- **ESLint**: `.eslintrc.json`
- **Astro**: `astro.config.mjs`

## Adding New Checks

To add new checks to the preflight suite:

1. Add the command to `package.json`:
   ```json
   "scripts": {
     "new-check": "your-command-here"
   }
   ```

2. Update the preflight command:
   ```json
   "preflight": "npm run check:types && npm run lint && npm run new-check && npm run build"
   ```

## Notes

- The preflight suite is designed to catch issues before they reach production
- All checks must pass for a successful preflight
- Consider running `preflight:verbose` in CI for better debugging
- The `--skipLibCheck` flag is used in TypeScript to avoid checking node_modules types