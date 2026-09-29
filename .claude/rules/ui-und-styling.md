---
paths:
  - "app/**/*.tsx"
  - "app/**/*.scss"
  - "components/**"
  - "styles/**"
  - "lib/useDictation.ts"
---

# Pages, Components & Styling

## Server / Client split

- Pages are async Server Components: `getSessionUser()` → `redirect("/login")`, ownership via `getNotebookForUser` → `notFound()`, load data, serialize dates to ISO strings, pass as `initialX` props to one Client Component. Reference: `app/(app)/notebook/[notebookId]/page.tsx` + `NotebookView.tsx`.
- Client Components never fetch initial data or check auth; they call `app/api/` (or the Notebook-CRUD Server Actions) and poll job status (see `jobs-worker.md`).
- `app/(app)/layout.tsx` does no auth; protection is middleware + page guard.
- Item types shared between page and view are exported from the view (`NotebookView.tsx`); payload types of modals are exported next to the modal (`AudioOptions`, `ReportGeneratePayload`, …).
- `NotebookView.tsx` is already very large — put new self-contained UI into `components/` instead of growing it further.

## Components

- One folder per component in `components/<Name>/` with `<Name>.tsx` + `<Name>.module.scss` (PascalCase for new files; some older SCSS files are lowercase, leave them).
- Modals live together in `components/popup/`: `"use client"`, controlled via `onClose`/`onCreate` callbacks, `role="dialog" aria-modal="true"`, overlay click closes, inner `onClick={(e) => e.stopPropagation()}`.
- `lib/useDictation.ts`: Web Speech API (`de-DE`, Chrome/Edge only); `supported` comes from `useSyncExternalStore` with server snapshot `false` for SSR safety.
- `eslint-plugin-react-hooks` 7 forbids synchronous `setState` in effects (`react-hooks/set-state-in-effect`). Syncing state from changed props happens during render with a stored previous value (see `NotebookTitle.tsx`), browser capabilities via `useSyncExternalStore`.

## Styling

- SCSS Modules everywhere (`components/**`, `app/login/login.module.scss`, `app/(app)/notebook/notebook.module.scss`). Only exception: the home page `app/(app)/notebook-home.scss` is plain global SCSS, scoped under `.nlm` with `nlm-*` class names — don't add new global stylesheets.
- `styles/globals.scss` holds only resets, the base font and the icon defaults. No colors there.
- The app is dark-only. Design tokens are CSS custom properties defined locally on the page root (`.shell` in `notebook.module.scss`, `.nlm` in `notebook-home.scss`): `var(--bg)`, `var(--surface)`, `var(--text)`, `var(--text-muted)`, `var(--accent)`, `var(--radius-*)`. Reuse them instead of new hex values.
- Font: Google Sans via `next/font/local` in `app/layout.tsx` as `--font-google-sans`; inputs/buttons use `font-family: inherit`.
- Icons only from `material-symbols` (`import "material-symbols"` in the page/component) as `<span className="material-symbols-outlined">icon_name</span>`. Weight/fill/size defaults are in `globals.scss`.
- Breakpoints are desktop-first `max-width`. No shared breakpoint variables exist yet; stick to the values already used in the file you edit.
- Dates in the UI: `Intl.DateTimeFormat("de-DE")`.
