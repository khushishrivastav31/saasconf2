"""FastAPI application entry point."""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.config import get_settings
from app.core.exceptions import (
    SaaSConfException,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
)
from app.api.v1.router import api_router

settings = get_settings()

# Rate limiter
limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler."""
    # Startup
    print(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    yield
    # Shutdown
    print("Shutting down...")


# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Multi-tenant SaaS platform for conference management",
    lifespan=lifespan,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

# Add rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["*"],
)


# Exception handlers
@app.exception_handler(AuthenticationError)
async def authentication_error_handler(
    request: Request, exc: AuthenticationError
) -> JSONResponse:
    """Handle authentication errors."""
    return JSONResponse(
        status_code=401,
        content={"detail": exc.message, "type": "authentication_error"},
    )


@app.exception_handler(AuthorizationError)
async def authorization_error_handler(
    request: Request, exc: AuthorizationError
) -> JSONResponse:
    """Handle authorization errors."""
    return JSONResponse(
        status_code=403,
        content={"detail": exc.message, "type": "authorization_error"},
    )


@app.exception_handler(NotFoundError)
async def not_found_error_handler(
    request: Request, exc: NotFoundError
) -> JSONResponse:
    """Handle not found errors."""
    return JSONResponse(
        status_code=404,
        content={"detail": exc.message, "type": "not_found_error"},
    )


@app.exception_handler(SaaSConfException)
async def saasconf_error_handler(
    request: Request, exc: SaaSConfException
) -> JSONResponse:
    """Handle general application errors."""
    return JSONResponse(
        status_code=400,
        content={"detail": exc.message, "type": "error"},
    )


# Health check endpoint
@app.get("/health")
async def health_check() -> dict:
    """Health check endpoint."""
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
    }


# Include API router
app.include_router(api_router, prefix="/api/v1")
