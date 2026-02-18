.PHONY: dev dev-backend dev-frontend test test-backend test-frontend lint lint-backend lint-frontend format build clean help init install-hooks quality dev-clean db-reset

# ─── Setup ─────────────────────────────────────────────────
init: ## First-time project setup (deps, hooks, migrations)
	cd backend && python -m venv venv && venv/bin/pip install -r requirements.txt
	cd frontend && npm ci
	$(MAKE) install-hooks
	@echo "\n✅ Setup complete. Run 'make dev' to start."

install-hooks: ## Install git hooks (pre-commit + husky)
	pre-commit install || echo "pre-commit not installed — run: pip install pre-commit"
	cd frontend && npm run prepare 2>/dev/null || true

# ─── Development ────────────────────────────────────────────
dev: ## Start all services with Docker Compose
	docker compose up

dev-backend: ## Start backend dev server
	cd backend && source venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

dev-frontend: ## Start frontend dev server
	cd frontend && npm run dev

dev-clean: ## Remove volumes and restart fresh
	docker compose down -v
	docker compose up

# ─── Testing ────────────────────────────────────────────────
test: test-backend test-frontend ## Run all tests

test-backend: ## Run backend tests with coverage
	cd backend && venv/bin/python -m pytest tests/ -v --cov=app --cov-report=term-missing --cov-fail-under=50

test-frontend: ## Run frontend tests with coverage
	cd frontend && npm run test:coverage -- --run

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

# ─── Cleanup ────────────────────────────────────────────────
clean: ## Clean build artifacts
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	rm -rf frontend/dist frontend/coverage backend/.coverage backend/coverage.xml

# ─── Help ───────────────────────────────────────────────────
help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
