# ✦ Preflight Commands

The preflight script for this project runs the following checks:

## Main Command

```bash
npm run preflight
```

This runs:
1. **Type checking** - Validates TypeScript and Astro component types
2. **Build** - Ensures the project builds successfully

## Available Variations

### Verbose Output
```bash
npm run preflight:verbose
```
Shows progress messages:
- 🔍 Running type checks...
- 🏗️  Building project...
- ✅ All preflight checks passed!

### With Auto-fix
```bash
npm run preflight:fix
```
Currently identical to `preflight` (ready for future linting auto-fix)

### Full Suite (includes linting and tests)
```bash
npm run preflight:full
```
Runs the complete suite including:
1. Type checking
2. Linting (ESLint)
3. Tests (placeholder)
4. Build

## Individual Commands

- `npm run check:types` - Run TypeScript and Astro type checking
- `npm run build` - Build the static site
- `npm run lint` - Run ESLint (requires configuration)
- `npm run test` - Run tests (not configured yet)

## Success Criteria

All checks must pass for the preflight to succeed. Any errors will stop the process and show the specific issue.

## Usage in CI/CD

```yaml
# Example GitHub Actions workflow
- name: Run preflight checks
  run: npm run preflight:verbose
```