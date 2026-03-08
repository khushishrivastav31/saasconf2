"""
Portal Template Downloads

Provides downloadable default templates for portal customization.
"""

from fastapi import APIRouter, Response

router = APIRouter(prefix="/portal-templates", tags=["Portal Templates"])

# Default CSS template for public registration portal
DEFAULT_PORTAL_CSS = """
/* ==========================================================================
   SaaSConf Public Registration Portal - Default CSS Template
   ========================================================================== */

/* IMPORTANT: All selectors are scoped to .portal-registration to avoid
   conflicts with the main application CSS. Do not remove this wrapper. */

.portal-registration {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  line-height: 1.6;
  color: #1f2937;
}

/* ==========================================================================
   Layout & Containers
   ========================================================================== */

.portal-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 2rem 1rem;
}

.portal-container {
  max-width: 800px;
  margin: 0 auto;
}

.portal-card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  padding: 2rem;
  margin-bottom: 2rem;
}

/* ==========================================================================
   Typography
   ========================================================================== */

.portal-heading {
  font-size: 2rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.5rem;
}

.portal-subheading {
  font-size: 1.25rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 1rem;
}

.portal-text {
  font-size: 1rem;
  color: #4b5563;
  margin-bottom: 1rem;
}

.portal-small-text {
  font-size: 0.875rem;
  color: #6b7280;
}

/* ==========================================================================
   Form Elements
   ========================================================================== */

.portal-form-group {
  margin-bottom: 1.5rem;
}

.portal-label {
  display: block;
  font-weight: 500;
  color: #374151;
  margin-bottom: 0.5rem;
}

.portal-label-required::after {
  content: " *";
  color: #dc2626;
}

.portal-input,
.portal-select,
.portal-textarea {
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  font-size: 1rem;
  transition: all 0.2s;
}

.portal-input:focus,
.portal-select:focus,
.portal-textarea:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.portal-input-error {
  border-color: #dc2626;
}

.portal-error-message {
  color: #dc2626;
  font-size: 0.875rem;
  margin-top: 0.25rem;
}

/* ==========================================================================
   Buttons
   ========================================================================== */

.portal-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  font-weight: 600;
  border-radius: 0.5rem;
  transition: all 0.2s;
  cursor: pointer;
  border: none;
  min-height: 44px; /* Touch-friendly */
}

.portal-button-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.portal-button-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.portal-button-secondary {
  background: white;
  color: #667eea;
  border: 2px solid #667eea;
}

.portal-button-secondary:hover {
  background: #f3f4f6;
}

.portal-button-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.portal-button-group {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: space-between;
}

/* ==========================================================================
   Progress Indicator
   ========================================================================== */

.portal-progress {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.portal-progress-step {
  flex: 1;
  text-align: center;
  position: relative;
}

.portal-progress-step-number {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #e5e7eb;
  color: #9ca3af;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.portal-progress-step-active .portal-progress-step-number {
  background: #667eea;
  color: white;
}

.portal-progress-step-completed .portal-progress-step-number {
  background: #10b981;
  color: white;
}

.portal-progress-step-label {
  font-size: 0.75rem;
  color: #6b7280;
}

/* ==========================================================================
   Pricing Summary
   ========================================================================== */

.portal-pricing-summary {
  background: #f9fafb;
  border-radius: 0.5rem;
  padding: 1.5rem;
  margin-top: 1.5rem;
}

.portal-pricing-row {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid #e5e7eb;
}

.portal-pricing-total {
  font-size: 1.25rem;
  font-weight: 700;
  margin-top: 0.5rem;
  padding-top: 1rem;
  border-top: 2px solid #d1d5db;
}

/* ==========================================================================
   Attendee List
   ========================================================================== */

.portal-attendee-item {
  background: #f3f4f6;
  border-radius: 0.5rem;
  padding: 1rem;
  margin-bottom: 1rem;
}

.portal-attendee-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.portal-attendee-number {
  font-weight: 600;
  color: #374151;
}

.portal-attendee-remove {
  color: #dc2626;
  cursor: pointer;
  font-size: 0.875rem;
}

/* ==========================================================================
   Stripe Elements
   ========================================================================== */

.portal-stripe-element {
  padding: 0.75rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  background: white;
}

.portal-stripe-element--focus {
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.portal-stripe-element--invalid {
  border-color: #dc2626;
}

/* ==========================================================================
   Success/Confirmation
   ========================================================================== */

.portal-success-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 1rem;
  color: #10b981;
}

.portal-success-message {
  text-align: center;
  font-size: 1.125rem;
  color: #059669;
  margin-bottom: 1rem;
}

/* ==========================================================================
   Responsive Design
   ========================================================================== */

@media (max-width: 640px) {
  .portal-card {
    padding: 1.5rem;
  }

  .portal-heading {
    font-size: 1.5rem;
  }

  .portal-button-group {
    flex-direction: column;
  }

  .portal-button {
    width: 100%;
  }

  .portal-progress {
    font-size: 0.75rem;
  }

  .portal-progress-step-number {
    width: 32px;
    height: 32px;
  }
}

/* ==========================================================================
   Dark Mode Support (optional)
   ========================================================================== */

@media (prefers-color-scheme: dark) {
  .portal-page {
    background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);
  }

  .portal-card {
    background: #1f2937;
    color: #f3f4f6;
  }

  .portal-heading,
  .portal-subheading {
    color: #f9fafb;
  }

  .portal-text {
    color: #d1d5db;
  }

  .portal-input,
  .portal-select,
  .portal-textarea {
    background: #374151;
    border-color: #4b5563;
    color: #f3f4f6;
  }

  .portal-pricing-summary {
    background: #374151;
  }

  .portal-attendee-item {
    background: #374151;
  }
}
"""


@router.get("/default-registration-portal.css")
async def get_default_portal_css() -> Response:
    """
    Download default CSS template for public registration portal.

    Returns a starter CSS template that conference admins can customize
    to match their brand. This template includes all standard portal classes
    and provides a good starting point for customization.

    Returns:
        Response with CSS content (Content-Type: text/css)
    """
    return Response(
        content=DEFAULT_PORTAL_CSS,
        media_type="text/css",
        headers={
            "Content-Disposition": "attachment; filename=default-registration-portal.css",
            "Cache-Control": "public, max-age=86400",
        },
    )
