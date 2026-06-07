# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

No test suite is configured.

## Architecture

Next.js 16 App Router project. German-language UI — all user-facing strings are in German.

**Component conventions**

- Shared, reusable components live in `components/<ComponentName>/`.
- Each component ships with a co-located CSS Module (`.module.scss`).
- Each component is in a seperate folder with the \*.module.scss
- Icons come exclusively from `material-symbols/outlined.css` via `<span className="material-symbols-outlined">icon_name</span>`. Global icon styles (weight, fill, size) are set in `styles/globals.scss`.

**Styling**

- SCSS Modules for scoped styles; plain SCSS for global/page-level styles.
- No CSS-in-JS, no Tailwind.
- `styles/globals.scss` contains the only global resets and base styles.

NEXT_PUBLIC Variablen werden in .env gespeichert.
Alle Secrets werden in .env.template gespeichert. Hier steht nur die Variable ohne einen Wert.
Der eigentlich Wert liegt in einer anderen .env Datei ab
