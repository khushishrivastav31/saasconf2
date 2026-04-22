# UI Conventions

## Dark mode (class-based via `ThemeContext`)

New components must ship with `dark:` variants. Use this mapping — don't invent new pairs.

| Purpose | Light | Dark |
|---|---|---|
| Surface (primary) | `bg-white` | `dark:bg-gray-800` |
| Surface (page) | `bg-gray-50` | `dark:bg-gray-900` |
| Surface (subtle) | `bg-gray-100` | `dark:bg-gray-800` |
| Text (primary) | `text-gray-900` | `dark:text-gray-100` |
| Text (secondary) | `text-gray-700` / `text-gray-600` | `dark:text-gray-300` *(never `gray-400`)* |
| Text (muted) | `text-gray-500` | `dark:text-gray-400` |
| Border (default) | `border-gray-200` | `dark:border-gray-700` |
| Border (strong) | `border-gray-300` | `dark:border-gray-600` |
| Hover (surface) | `hover:bg-gray-50` | `dark:hover:bg-gray-700` |
| Form inputs | — | `dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100` |
| Semantic tint | `bg-red-50` (and siblings) | `dark:bg-red-900/30` *(always use `/30` opacity)* |

## Responsive design

Portal surfaces (applicant, registration) are **mobile-first**. Admin surfaces are **desktop-first**.

- **Breakpoints** — `sm:` (640px) for stacking, `lg:` (1024px) for sidebar. Skip `md:` unless you have a specific need.
- **Touch targets** — `min-h-[44px]` on interactive elements in portal surfaces.
- **Button groups** — always `flex-wrap`. Never rely on horizontal overflow.
- **Fixed widths** — avoid in portal layouts; prefer `max-w-*` + percentage.
