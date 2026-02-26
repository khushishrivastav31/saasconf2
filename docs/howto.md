# How-To Guides

Step-by-step guides for common development tasks.

---

## 1. Add a New API Endpoint

### Backend

**Example:** Add a `GET /api/v1/conferences/{id}/stats` endpoint.

1. **Create the route file** (or add to an existing one):

```python
# backend/app/api/v1/conference_stats.py
from fastapi import APIRouter
from app.core.dependencies import CurrentUserDep, DbSessionDep

router = APIRouter()

@router.get("/stats")
async def get_conference_stats(
    conference_id: int,
    db: DbSessionDep,
    current_user: CurrentUserDep,
):
    # Your logic here
    return {"total_papers": 42}
```

2. **Register the router** in `backend/app/api/v1/router.py`:

```python
from app.api.v1 import conference_stats

api_router.include_router(
    conference_stats.router,
    prefix="/conferences/{conference_id}/stats",
    tags=["Conference Stats"],
)
```

3. **Add auth guards** as needed:

```python
from app.core.dependencies import TenantAdminDep

@router.get("/stats")
async def get_conference_stats(
    conference_id: int,
    db: DbSessionDep,
    current_user: TenantAdminDep,  # Restricts to tenant admin or super admin
):
    ...
```

### Common dependency types

| Dependency | Who can access |
|-----------|----------------|
| `CurrentUserDep` | Any authenticated user |
| `TenantAdminDep` | Tenant admin or super admin |
| `SuperAdminDep` | Super admin only |
| `require_conference_admin(conference_id, db, user)` | Conference admin, tenant admin, or super admin |
| `require_module("cfp")` | Users with the CFP module |

---

## 2. Add a New Database Model

1. **Create the model file**:

```python
# backend/app/models/ticket.py
from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

class Ticket(Base):
    __tablename__ = "tickets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    conference_id: Mapped[int] = mapped_column(ForeignKey("conferences.id", ondelete="CASCADE"))
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(200))
    price: Mapped[int] = mapped_column(Integer, default=0)
```

2. **Export from** `backend/app/models/__init__.py`:

```python
from app.models.ticket import Ticket

__all__ = [
    ...
    "Ticket",
]
```

3. **Create Pydantic schemas**:

```python
# backend/app/schemas/ticket.py
from pydantic import BaseModel

class TicketCreate(BaseModel):
    name: str
    price: int = 0

class TicketUpdate(BaseModel):
    name: str | None = None
    price: int | None = None

class TicketResponse(BaseModel):
    id: int
    conference_id: int
    name: str
    price: int
```

4. **Create a migration** (see section 3 below).

---

## 3. Add a New Migration

```bash
cd backend
alembic revision --autogenerate -m "add_tickets_table"
```

This generates a file like `backend/app/db/migrations/versions/080_add_tickets_table.py`.

### Naming convention

Files are named `NNN_description.py` where `NNN` is the next sequence number. Alembic auto-generates this if you have the naming template configured.

### After creating the migration

1. **Review the generated file** — auto-detect doesn't catch everything (e.g., renamed columns appear as drop+add)
2. **Run it locally**: `alembic upgrade head`
3. **If you added a PostgreSQL extension**, also add it to `backend/tests/conftest.py`:

```python
async def _create_tables() -> None:
    async with test_engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS unaccent"))
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS your_extension"))
        await conn.run_sync(Base.metadata.create_all)
```

### Downgrade

```bash
alembic downgrade -1   # Roll back one step
```

---

## 4. Add a New Frontend Page

1. **Create the page component**:

```tsx
// frontend/src/pages/MyNewPage.tsx
export default function MyNewPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900">My New Page</h1>
    </div>
  );
}
```

2. **Add a route** in `frontend/src/App.tsx`:

```tsx
import MyNewPage from "./pages/MyNewPage";

// Inside the <Route> tree, under ProtectedRoute:
<Route path="my-new-page" element={<MyNewPage />} />
```

3. **Add navigation** — add a menu item in `AdminLayout` or the relevant sidebar.

### Route guard wrappers

| Wrapper | Who can access |
|---------|---------------|
| `<ProtectedRoute>` | Any logged-in user |
| `<AdminRoute>` | Super admin only |
| `<TenantAdminRoute>` | Tenant admin or super admin |
| `<TenantOnlyRoute>` | Tenant admin only (not super admin) |
| `<ModuleRoute moduleCode="cfp">` | Users with the specified module |

---

## 5. Add a New Conference Tab

Conference detail uses a sidebar navigation defined in `conferenceSections.ts`.

1. **Add the section definition** in `frontend/src/pages/ConferenceDetail/conferenceSections.ts`:

```typescript
// Add to coreSections (always visible) or moduleSections (module-gated):
export const moduleSections: SectionDef[] = [
  ...existingSections,
  {
    id: "my-feature",
    name: "My Feature",
    icon: MyFeatureIcon,
    moduleCode: "my_module",  // Only show if user has this module
  },
];
```

2. **Add the section ID** to the `SectionId` type union:

```typescript
export type SectionId = ... | "my-feature";
```

3. **Create an icon** in `frontend/src/pages/ConferenceDetail/icons.tsx`:

```tsx
export function MyFeatureIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      {/* SVG path */}
    </svg>
  );
}
```

4. **Create the tab component**:

```tsx
// frontend/src/pages/ConferenceDetail/tabs/MyFeatureTab.tsx
export default function MyFeatureTab({ conferenceId }: { conferenceId: string }) {
  return <div>My Feature content</div>;
}
```

5. **Wire it into** `ConferenceDetail/index.tsx` — add the section ID to the content rendering switch.

---

## 6. Add a New Settings Type

Settings follow a consistent pattern: backend model + schema + endpoint + frontend tab using `useSettingsCrud`.

### Backend

1. **Add the model** to `backend/app/models/settings.py`:

```python
class BadgeType(Base):
    __tablename__ = "badge_types"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    conference_id: Mapped[int] = mapped_column(ForeignKey("conferences.id", ondelete="CASCADE"))
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(100))
    color: Mapped[str | None] = mapped_column(String(7), nullable=True)
```

2. **Add schemas** to `backend/app/schemas/settings.py`:

```python
class BadgeTypeCreate(BaseModel):
    name: str
    color: str | None = None

class BadgeTypeUpdate(BaseModel):
    name: str | None = None
    color: str | None = None

class BadgeTypeResponse(BaseModel):
    id: int
    conference_id: int
    name: str
    color: str | None
```

3. **Create the endpoint** in `backend/app/api/v1/settings/badge_types.py`:

```python
from fastapi import APIRouter
from app.core.dependencies import DbSessionDep, TenantAdminDep

router = APIRouter()

@router.get("/badge-types")
async def list_badge_types(conference_id: int, db: DbSessionDep, user: TenantAdminDep):
    ...

@router.post("/badge-types")
async def create_badge_type(conference_id: int, data: BadgeTypeCreate, db: DbSessionDep, user: TenantAdminDep):
    ...

@router.put("/badge-types/{badge_type_id}")
async def update_badge_type(conference_id: int, badge_type_id: int, data: BadgeTypeUpdate, db: DbSessionDep, user: TenantAdminDep):
    ...

@router.delete("/badge-types/{badge_type_id}")
async def delete_badge_type(conference_id: int, badge_type_id: int, db: DbSessionDep, user: TenantAdminDep):
    ...
```

4. **Include the router** in `backend/app/api/v1/settings/__init__.py`:

```python
from app.api.v1.settings.badge_types import router as badge_types_router
router.include_router(badge_types_router)
```

5. **Create a migration**: `alembic revision --autogenerate -m "add_badge_types"`

### Frontend

6. **Create the settings tab** using the `useSettingsCrud` hook:

```tsx
// frontend/src/pages/ConferenceDetail/tabs/settings/BadgeTypesTab.tsx
import { useSettingsCrud } from "../../../../hooks/useSettingsCrud";

interface BadgeType { id: string; name: string; color: string | null; }
interface BadgeTypeCreate { name: string; color?: string; }
interface BadgeTypeUpdate { name?: string; color?: string; }

export default function BadgeTypesTab({ conferenceId }: { conferenceId: string }) {
  const { data, isLoading, createMutation, updateMutation, deleteMutation, error } =
    useSettingsCrud<BadgeType, BadgeTypeCreate, BadgeTypeUpdate>({
      conferenceId,
      endpoint: "badge-types",
      queryKey: "badge-types",
    });

  // Render table with create/edit/delete UI
  ...
}
```

The `useSettingsCrud` hook handles:
- `GET /conferences/{id}/settings/{endpoint}` — list items
- `POST /conferences/{id}/settings/{endpoint}` — create
- `PUT /conferences/{id}/settings/{endpoint}/{itemId}` — update
- `DELETE /conferences/{id}/settings/{endpoint}/{itemId}` — delete
- React Query cache invalidation on mutations
- Error state management

7. **Register the tab** in `SettingsTab.tsx` — add it to the settings sub-tab navigation.

---

## 7. Add Search to an Endpoint

Use the `unaccent_ilike` helper for accent-insensitive, case-insensitive search.

```python
from app.core.search import unaccent_ilike

@router.get("/")
async def list_items(
    db: DbSessionDep,
    current_user: CurrentUserDep,
    search: str | None = None,
):
    query = select(MyModel).where(MyModel.tenant_id == current_user.tenant_id)

    if search:
        query = query.where(
            unaccent_ilike(MyModel.name, search)
            | unaccent_ilike(MyModel.description, search)
        )

    result = await db.execute(query)
    return result.scalars().all()
```

The helper wraps both the column and the search term with PostgreSQL's `unaccent()` function and uses `ILIKE` with `%` wildcards, so "cafe" matches "Cafe", "muller" matches "Muller", etc.

---

## 8. Add File Upload to an Endpoint

Use the file validation utilities from `app.core.file_validation`:

```python
from fastapi import UploadFile
from app.core.file_validation import validate_upload, sanitize_filename, strip_image_metadata

@router.post("/upload")
async def upload_file(file: UploadFile, db: DbSessionDep, user: CurrentUserDep):
    # 1. Validate MIME type via magic bytes (not just the extension)
    validate_upload(file, entity_type="attachment")

    # 2. Sanitize the filename (strips path traversal, dangerous extensions)
    safe_name = sanitize_filename(file.filename or "upload")

    # 3. Read file data
    file_data = await file.read()

    # 4. Strip EXIF metadata from images (privacy protection)
    content_type = file.content_type or "application/octet-stream"
    if content_type.startswith("image/"):
        file_data = strip_image_metadata(file_data, content_type)

    # 5. Store in database or filesystem
    ...
```

### For download endpoints

Use `safe_content_disposition` for non-ASCII filenames:

```python
from app.core.file_validation import safe_content_disposition

@router.get("/download/{id}")
async def download_file(id: int, db: DbSessionDep):
    attachment = ...
    return Response(
        content=attachment.file_data,
        media_type=attachment.content_type,
        headers={"Content-Disposition": safe_content_disposition(attachment.filename)},
    )
```

---

## 9. Add a New Conference Module

Modules gate access to features for tenants.

1. **Add the module to the database**. In the seed script (`backend/app/db/seed.py`) or via the admin UI:

```python
Module(code="my_module", name="My Module", description="Description here")
```

2. **Add a `require_module` guard** on backend endpoints:

```python
from app.core.dependencies import require_module

@router.get("/my-feature")
async def my_feature(
    db: DbSessionDep,
    current_user: CurrentUserDep = Depends(require_module("my_module")),
):
    ...
```

3. **Add frontend route guard** in `App.tsx`:

```tsx
<Route
  path="modules/my-module"
  element={
    <ModuleRoute moduleCode="my_module">
      <MyModulePage />
    </ModuleRoute>
  }
/>
```

4. **Add conference sidebar entry** in `conferenceSections.ts`:

```typescript
{
  id: "my-module",
  name: "My Module",
  icon: MyModuleIcon,
  moduleCode: "my_module",
},
```

5. **Assign the module** to a tenant via Admin > Modules in the UI.

---

## 10. Run Tests

### Backend tests

```bash
cd backend

# Run all tests
pytest tests/ -v

# Run specific test file
pytest tests/test_auth.py -v

# Run with coverage
pytest tests/ -v --cov=app --cov-report=term-missing

# Run specific test
pytest tests/test_auth.py::test_login_success -v
```

**Requirements:**
- PostgreSQL running (test DB: `saasconf_test`)
- Redis running
- Environment variables: `DATABASE_URL`, `JWT_SECRET_KEY`, `REDIS_URL`

### Frontend unit tests

```bash
cd frontend

# Run all tests
npm test

# Run in watch mode
npm test -- --watch

# Run with coverage
npm run test:coverage

# Run specific file
npx vitest run src/hooks/useAuth.test.ts
```

### Frontend E2E tests

```bash
cd frontend

# Install browsers
npx playwright install chromium

# Run E2E tests
npx playwright test

# Run with UI
npx playwright test --ui

# Run specific test
npx playwright test e2e/accent-search.spec.ts
```

**Requirements:**
- Set E2E environment variables (see `.github/workflows/staging.yml` for the full list)
- Staging environment running (E2E tests run against the live staging server)

### Type checking

```bash
cd frontend
npx tsc --noEmit
```

---

## 11. Add Pagination to an Endpoint

Use the `paginate` helper from `app.core.pagination`:

```python
from app.core.pagination import paginate, PaginatedResult

@router.get("/items")
async def list_items(
    db: DbSessionDep,
    current_user: CurrentUserDep,
    page: int = 1,
    page_size: int = 25,
    search: str | None = None,
):
    query = select(MyModel).where(MyModel.tenant_id == current_user.tenant_id)

    if search:
        query = query.where(unaccent_ilike(MyModel.name, search))

    result: PaginatedResult = await paginate(db, query, page=page, page_size=page_size)
    return result  # Returns {"items": [...], "total": N, "page": 1, "page_size": 25}
```

---

## 12. Common Gotchas

### Pydantic validators run on response objects

If you add a `@field_validator` to a Pydantic schema, it runs on both input (request) AND output (response) construction. If existing database data doesn't pass the new validator, the API will return 500 errors when listing those records.

**Solution:** Either make validators lenient on output, or migrate existing data first.

### RLS and test sessions

Tests bypass RLS by setting `app.is_super_admin = 'true'` in the PostgreSQL session. If your tests need to verify RLS behavior, you'll need to explicitly set the RLS context:

```python
await session.execute(
    text("SELECT set_config('app.is_super_admin', 'false', true)")
)
await session.execute(
    text("SELECT set_config('app.current_tenant_id', :tid, true)"),
    {"tid": str(tenant_id)}
)
```

### DateTime always with timezone

Never use `datetime.utcnow()` — it returns naive datetimes. Always use:

```python
from app.core.utils import utcnow
now = utcnow()
```

### Phone validation

The phone validator requires `+` prefix with country code (E.164 format). Invalid phone numbers in the database will cause 500 errors when the Pydantic response schema validates them. See `docs/i18n.md` for details.

---

## 13. Generate DOCX/PDF Documents

The sponsor contract system demonstrates the pattern for server-side document generation.

### Converting uploaded documents to HTML

```python
import io
import mammoth
from striprtf.striprtf import rtf_to_text

def convert_docx_to_html(file_data: bytes) -> str:
    result = mammoth.convert_to_html(io.BytesIO(file_data))
    return result.value  # HTML string

def convert_rtf_to_html(file_data: bytes) -> str:
    text = rtf_to_text(file_data.decode("utf-8", errors="replace"))
    paragraphs = text.strip().split("\n\n")
    return "".join(f"<p>{p.replace(chr(10), '<br>')}</p>" for p in paragraphs if p.strip())
```

### Generating DOCX from HTML

```python
from html2docx import html2docx

def generate_docx(html_content: str) -> bytes:
    buf = html2docx(html_content, title="Document")
    return buf.getvalue()
```

### Generating PDF from HTML

```python
from fpdf import FPDF
import re

def generate_pdf(html_content: str) -> bytes:
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=11)
    # Strip HTML tags for plain text rendering
    text = re.sub(r"<[^>]+>", "", html_content)
    text = text.encode("latin-1", "replace").decode("latin-1")
    pdf.multi_cell(0, 6, text)
    return pdf.output()
```

### Serving documents for download

```python
from fastapi.responses import Response
from app.core.file_validation import safe_content_disposition

@router.get("/download")
async def download_document(...):
    docx_bytes = generate_docx(html_content)
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": safe_content_disposition("contract.docx"),
            "Content-Length": str(len(docx_bytes)),
        },
    )
```

**Dependencies** (all in `requirements.txt`): `mammoth`, `fpdf2`, `striprtf`, `python-docx`, `html2docx`
