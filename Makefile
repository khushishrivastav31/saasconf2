.PHONY: dev dev-backend dev-frontend test test-backend test-frontend lint lint-backend lint-frontend format build clean help init install-hooks quality dev-clean db-reset

# ─── Setup ─────────────────────────────────────────────────
init: ## First-time project setup (deps, hooks, migrations)
	@echo "Checking required tools..."
	@MISSING=""; \
	command -v pyenv >/dev/null 2>&1 || MISSING="$$MISSING\n  - pyenv (https://github.com/pyenv/pyenv)"; \
	command -v pnpm >/dev/null 2>&1 || MISSING="$$MISSING\n  - pnpm (npm install -g pnpm@10)"; \
	nc -z localhost 5432 2>/dev/null || MISSING="$$MISSING\n  - PostgreSQL on :5432 (brew services start postgresql@15)"; \
	nc -z localhost 6379 2>/dev/null || MISSING="$$MISSING\n  - Redis on :6379 (brew services start redis)"; \
	if [ -n "$$MISSING" ]; then \
		echo "❌ Missing requirements:$$MISSING"; \
		exit 1; \
	fi
	@echo "✅ All requirements met."
	@if command -v pyenv >/dev/null 2>&1; then \
		PYVER=$$(cat .python-version 2>/dev/null || echo "3.12"); \
		if ! pyenv versions --bare | grep -q "^$$PYVER$$"; then \
			echo "Installing Python $$PYVER via pyenv..."; \
			pyenv install --skip-existing $$PYVER; \
		fi; \
	fi
	cd backend && python -m venv venv && venv/bin/pip install -r requirements.txt
	cd frontend && pnpm install
	@if [ ! -f backend/.env ]; then \
		cp backend/.env.example backend/.env; \
		echo "📄 Created backend/.env from .env.example — review it before starting."; \
	fi
	@echo "Setting up database..."
	@sh scripts/setup-db.sh
	@if grep -q "^PII_ENCRYPTION_KEY=$$" backend/.env; then \
		echo "Generating PII_ENCRYPTION_KEY..."; \
		KEY=$$(cd backend && venv/bin/python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"); \
		sed -i '' "s|^PII_ENCRYPTION_KEY=$$|PII_ENCRYPTION_KEY=$$KEY|" backend/.env; \
		echo "  PII_ENCRYPTION_KEY set."; \
	fi
	@echo "Running migrations..."
	cd backend && venv/bin/python -m alembic upgrade head
	@echo "Seeding database..."
	cd backend && venv/bin/python -m app.db.seed
	$(MAKE) install-hooks
	@echo "\n✅ Setup complete. Run 'make dev-up' to start."

install-hooks: ## Install git hooks (pre-commit + husky)
	pre-commit install || echo "pre-commit not installed — run: pip install pre-commit"
	cd frontend && pnpm run prepare 2>/dev/null || true

# ─── Development ────────────────────────────────────────────
dev: ## Start all services with Docker Compose
	docker compose up

dev-up: ## Start backend + frontend natively
	@nc -z localhost 5432 2>/dev/null || { echo "❌ PostgreSQL is not running on localhost:5432. Start it first (e.g. brew services start postgresql@15)"; exit 1; }
	@nc -z localhost 6379 2>/dev/null || { echo "❌ Redis is not running on localhost:6379. Start it first (e.g. brew services start redis)"; exit 1; }
	@echo "✅ PostgreSQL and Redis are up. Starting backend and frontend..."
	@trap 'kill 0; exit 0' INT TERM; \
		(cd backend && venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload) & \
		(cd frontend && pnpm dev) & \
		wait

dev-backend: ## Start backend dev server
	cd backend && source venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

dev-frontend: ## Start frontend dev server
	cd frontend && pnpm dev

dev-clean: ## Remove volumes and restart fresh
	docker compose down -v
	docker compose up

# ─── Testing ────────────────────────────────────────────────
test: test-backend test-frontend ## Run all tests

test-backend: ## Run backend tests with coverage
	cd backend && venv/bin/python -m pytest tests/ -v --cov=app --cov-report=term-missing --cov-fail-under=50

test-frontend: ## Run frontend tests with coverage
	cd frontend && pnpm run test:coverage -- --run

test-e2e: ## Run E2E tests
	cd frontend && npx playwright test

# ─── Code Quality ───────────────────────────────────────────
quality: lint typecheck ## Run all quality checks (lint + typecheck)

lint: lint-backend lint-frontend ## Lint all code

lint-backend: ## Lint backend code
	cd backend && venv/bin/python -m ruff check .

lint-frontend: ## Lint frontend code
	cd frontend && npx eslint src/ --max-warnings 0

format: ## Format all code
	cd backend && venv/bin/python -m ruff format .
	cd frontend && npx prettier --write 'src/**/*.{ts,tsx,css}'

# ─── Type Checking ──────────────────────────────────────────
typecheck: typecheck-backend typecheck-frontend ## Run type checking

typecheck-backend: ## Type check backend
	cd backend && venv/bin/python -m mypy app/

typecheck-frontend: ## Type check frontend
	cd frontend && npx tsc --noEmit

# ─── Build ──────────────────────────────────────────────────
build: ## Build production images
	docker compose -f deploy/staging/docker-compose.yml build

# ─── Database ───────────────────────────────────────────────
migrate: ## Run database migrations
	cd backend && venv/bin/python -m alembic upgrade head

migration: ## Create a new migration (usage: make migration MSG="description")
	cd backend && venv/bin/python -m alembic revision --autogenerate -m "$(MSG)"

db-reset: ## Reset database (WARNING: destroys all data)
	docker compose down -v
	docker compose up -d db
	@echo "Waiting for database..."
	@sleep 3
	cd backend && venv/bin/python -m alembic upgrade head
	@echo "✅ Database reset complete."

db-reset-native: ## Reset local native DB — drop, recreate, migrate, seed (WARNING: destroys all data)
	@echo "⚠️  This will destroy all data in your local database. Continue? [y/N] " && read ans && [ "$$ans" = "y" ] || exit 0
	@sh scripts/setup-db.sh drop
	@sh scripts/setup-db.sh
	@echo "Running migrations..."
	cd backend && venv/bin/python -m alembic upgrade head
	@echo "Seeding database..."
	cd backend && venv/bin/python -m app.db.seed
	@echo "✅ Fresh database ready."

# ─── Cleanup ────────────────────────────────────────────────
clean: ## Clean build artifacts
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	rm -rf frontend/dist frontend/coverage backend/.coverage backend/coverage.xml

# ─── Help ───────────────────────────────────────────────────
help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
