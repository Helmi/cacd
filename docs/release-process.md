# Release Process

This document describes the Semver versioning and release process for CACD.

## Version Management

- **Single source of truth**: Root `package.json` version field
- **TUI**: Reads version automatically via `meow` CLI framework
- **WebUI**: Version injected at build time via Vite's `define` option
- **Client package.json**: Stays at `0.0.0` (not published, doesn't matter)

## Release Workflow

### Prerequisites

1. Ensure all changes are committed
2. Ensure you're on `main` branch and up to date
3. Follow [Conventional Commits](https://www.conventionalcommits.org/) format

### Standard Release Process

1. **Bump version and generate changelog**:
   ```bash
   bun run release
   ```
   This runs `standard-version` which:
   - Analyzes commits since last release
   - Bumps version based on commit types (feat → minor, fix → patch, BREAKING → major)
   - Generates/updates `CHANGELOG.md`
   - Creates a release commit with tag

2. **Review the changes**:
   - Check `CHANGELOG.md` for accuracy
   - Verify `package.json` version is correct
   - Review the release commit

3. **Push the release**:
   ```bash
   git push --follow-tags origin main
   ```
   The `--follow-tags` flag pushes both commits and tags.

4. **GitHub Actions will**:
   - Build and test on tag push
   - Publish to npm
   - Create GitHub Release with changelog

### Manual Version Bumps

If you need to force a specific version bump:

```bash
# Patch release (0.1.0 → 0.1.1)
bun run release:patch

# Minor release (0.1.0 → 0.2.0)
bun run release:minor

# Major release (0.1.0 → 1.0.0)
bun run release:major
```

### First Release

If this is your first release, you may need to create an initial tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

## How Version Injection Works

### WebUI (Vite)

Version is injected at build time in `client/vite.config.ts`:

```typescript
define: {
  'import.meta.env.VITE_APP_VERSION': JSON.stringify(version),
}
```

Components access it via:
```typescript
import.meta.env.VITE_APP_VERSION
```

### TUI (CLI)

The `meow` CLI framework automatically reads version from `package.json` when `--version` flag is used.

## Changelog Generation

`standard-version` uses `.versionrc.json` configuration to:
- Parse Conventional Commits
- Group changes by type (Features, Bug Fixes, etc.)
- Hide internal changes (chore, style, test, build, ci)
- Format changelog with Prettier

## GitHub Releases

The GitHub Actions workflow (`npm-publish.yml`) automatically:
1. Builds and tests on tag push
2. Publishes to npm
3. Creates a GitHub Release using `CHANGELOG.md` content

## Troubleshooting

### Version not updating in WebUI

Ensure you rebuild after version changes:
```bash
bun run build
```

### Changelog not generating correctly

Check that commits follow Conventional Commits format:
- `feat:` for new features
- `fix:` for bug fixes
- `BREAKING CHANGE:` in commit body for major versions

### Need to skip a release

If you need to skip a release but keep versioning:
```bash
standard-version --skip.tag --skip.commit
```
