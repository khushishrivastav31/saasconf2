# Contributing to SaaSConf

Thank you for your interest in contributing to SaaSConf. This guide will help you get started.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

## Getting Started

Refer to the [README](README.md) for quick start instructions on setting up the development environment.

## Development Workflow

1. **Fork and clone** the repository.
2. **Create a feature branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name main
   ```
3. **Make your changes** in the new branch.
4. **Run tests** to ensure everything passes:
   - Backend:
     ```bash
     pytest tests/ -v
     ```
   - Frontend:
     ```bash
     npm run test:run
     npx tsc --noEmit
     ```
5. **Pre-commit hooks** will auto-format your code on commit (Ruff for Python, ESLint + Prettier for TypeScript).
6. **Open a pull request** against `main`.

## Branch Naming

Use the following prefixes for branch names:

- `feature/` -- New features or enhancements
- `fix/` -- Bug fixes
- `refactor/` -- Code refactoring without behavior changes
- `docs/` -- Documentation updates

Examples: `feature/add-speaker-profiles`, `fix/login-redirect-loop`, `refactor/simplify-pricing-logic`

## Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) style:

- `feat:` -- A new feature
- `fix:` -- A bug fix
- `refactor:` -- Code change that neither fixes a bug nor adds a feature
- `docs:` -- Documentation only changes
- `test:` -- Adding or updating tests
- `chore:` -- Maintenance tasks (dependencies, CI, tooling)

Examples:
```
feat: add sponsor logo upload to conference settings
fix: prevent duplicate discount codes in booking matrix
refactor: extract pricing calculation into shared utility
docs: update API endpoint documentation for CFP portal
test: add regression test for volunteer role assignment
chore: upgrade FastAPI to 0.115
```

## Code Style

### Backend (Python)

- Formatter and linter: **Ruff** (configured in `pyproject.toml`)
- Line length: **120 characters**
- Python version: **3.12**
- Pre-commit hooks enforce formatting automatically

### Frontend (TypeScript)

- Linter: **ESLint** (configured in the project)
- Formatter: **Prettier** (configured in the project)
- TypeScript **strict mode** is enabled
- Pre-commit hooks enforce formatting automatically

You do not need to manually run formatters -- the pre-commit hooks handle this for you on each commit.

## Testing Requirements

- **New features** should include tests that cover the primary functionality.
- **Bug fixes** should include a regression test that reproduces the original issue.
- **All tests must pass** before a pull request can be merged.

## Pull Request Process

1. **CI must pass.** Pull requests require passing checks for:
   - Backend tests
   - Frontend tests
   - TypeScript type checking
   - Production build
2. **Keep PRs focused.** Each pull request should address one feature or fix. Avoid combining unrelated changes.
3. **Include a clear description.** Explain what the PR does, why the change is needed, and any relevant context for reviewers.
4. **Link related issues** if applicable (e.g., "Closes #42").

## Questions

If you have questions about contributing, feel free to open a discussion or issue on the repository.
