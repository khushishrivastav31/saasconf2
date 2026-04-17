# Release tagging

_Last verified: 2026-04-17_

Cutting a release = bumping the version in two files, creating a `vX.Y.Z` git tag, and pushing it so GitHub creates a release.

## Policy

- **Versioning:** [SemVer 2.0.0](https://semver.org/). `MAJOR.MINOR.PATCH`.
  - `PATCH` = bug fixes, internal refactors, doc updates.
  - `MINOR` = new user-visible features, additive API changes.
  - `MAJOR` = breaking API changes, schema migrations that require coordinated client updates.
- **Pre-1.0 exception:** while the product is pre-1.0, `MINOR` bumps are also allowed to signal breaking internal changes. Shift to strict SemVer at `v1.0.0`.
- **Tag format:** `vX.Y.Z` (with the `v` prefix — GitHub releases expect this).
- **One source of truth per file:** both `backend/pyproject.toml` and `frontend/package.json` must always agree on the current version.
- **Tag only on `main`.** Never tag a feature branch.
- **Tagged commits are immutable.** Do not delete or move tags once pushed.

## Procedure

### 1. Make sure `main` is clean

```bash
git checkout main
git pull --ff-only origin main
git status            # must be empty
```

### 2. Bump the version

Pick `X.Y.Z` per the policy above. Edit **both** files:

- [backend/pyproject.toml](../../backend/pyproject.toml) — `version = "X.Y.Z"` (line 3)
- [frontend/package.json](../../frontend/package.json) — `"version": "X.Y.Z"` (line 4)

### 3. Commit the bump

```bash
git add backend/pyproject.toml frontend/package.json
git commit -m "chore: release vX.Y.Z"
```

### 4. Create the annotated tag

Always annotated (`-a`), never lightweight — annotated tags store the author, date, and message, which GitHub needs to produce a clean release page.

```bash
git tag -a vX.Y.Z -m "Release vX.Y.Z

- highlight 1
- highlight 2
- highlight 3"
```

### 5. Push the commit AND the tag

```bash
git push origin main
git push origin vX.Y.Z
```

Pushing the tag triggers GitHub to create a Release entry. If you use [release-please](https://github.com/googleapis/release-please) later, skip manual steps 2–5 and let the action handle it.

### 6. Verify

```bash
git tag -l                             # vX.Y.Z appears
git show vX.Y.Z | head                 # annotated, points at HEAD of main
```

Then check GitHub → **Releases** tab — the new release should be listed, pointing at the correct commit.

## First-time tagging (`v0.1.0`)

SaaSConf is currently at `0.1.0` in both version files but has no matching git tag. Before any release-gated automation is added (changelog generation, release-please), create the tag:

```bash
git checkout main
git pull --ff-only origin main
git tag -a v0.1.0 -m "Release v0.1.0 — baseline tag for SaaSConf

Baseline tag captured at the start of the 2026-04 audit implementation.
See docs/audit-report-2026-04.md for the rolling change log."
git push origin v0.1.0
```

This single tag exists only to anchor `HEAD` as the "before audit" reference point. Subsequent tags follow the regular procedure.

## Rolling back a bad tag

If a tag was pushed too early or points at a broken commit:

1. **Do not delete it.** Deleted tags confuse collaborators who already pulled.
2. Cut a new `vX.Y.Z+1` PATCH release with the fix.
3. In the GitHub Release UI, add a banner to the bad release: `⚠️ Superseded by vX.Y.Z+1 — do not deploy this version.`

The only exception: a tag pushed within the last few minutes that nobody else has fetched. Even then, prefer a new tag over `git tag -d`.
