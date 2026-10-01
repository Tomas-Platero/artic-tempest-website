# Artic Tempest Web

Next.js 16 App Router site for raid coordination, recruitment, notifications, and member/admin tooling.

## Quick reference

- **Package manager:** npm
- **Build:** `npm run build`
- **Typecheck:** `npm run type-check`
- **Lint:** `npm run lint`
- **React Doctor:** run `npx -y react-doctor@latest . --verbose` before finishing React changes; fix any issues before you stop.
- **Commit/push flow:** run `git commit` then `git push origin Master`. No review, PR or release steps unless the user explicitly asks for them.
- **Before push:** bump `package.json` version and keep `CHANGELOG.md` aligned with the same release version.
- **Version tagging:** when the version crosses a minor or major boundary (e.g. `1.5.25` → `1.6.0`, or `1.6.x` → `2.0.0`), create an annotated tag on that commit: `git tag -a v<version> -m "v<version>"` and push it with `git push origin v<version>`. Patch-only bumps (e.g. `1.6.0` → `1.6.1`) do not need a tag.
- **Supabase schema changes:** use the Supabase MCP tools only; keep migrations and RLS policy changes server-safe. Never use `supabase db push` or any Supabase CLI command that touches the remote database. All SQL changes go through MCP exclusively.

## Where to look

- `docs/index.md` — canonical docs hub
- `docs/setup-workflow.md` — local setup, scripts, validation, repo rules
- `docs/architecture.md` — codebase boundaries and shared systems
- `docs/features-map.md` — route and product-area map
- `docs/public-content.md` — public pages and content areas
- `docs/access-pages.md` — login, maintenance, banned, and error states
- `docs/help-legal-accessibility.md` — help, legal, accessibility, redirects
- `docs/member-zone-raider.md` — member shell and raid operations
- `docs/admin-config.md` — admin/configuration areas
- `docs/shared-systems.md` — auth, permissions, SEO, layout, indexing
- `docs/operations.md` — env vars, deploy, cron, sitemap, robots
- `docs/support.md` — support/contact guidance

## Rules

- Keep technical artifacts in English unless the user explicitly asks otherwise.
- Use factual, repo-backed instructions only; if something is not in the repo, do not invent it.
- Prefer the smallest safe change that solves the real problem.

## Atlassian workflow (Jira + Confluence)

All task tracking is done in Jira (project ATW). The agent MUST load skill `atlassian-workflow` (`.pi/skills/atlassian-workflow/SKILL.md`) before any implementation, fix, or change.

See that skill for the full Jira workflow (To Do → In Progress → Done), Confluence documentation rules, and the per-change Jira task creation contract.

## Zona Raider: new page checklist

Every new page under `/zona-raider/` MUST follow this checklist before shipping:

### 1. Permission app ID (`src/shared/auth/permissions.ts`)

- Add the new app ID to the `AppId` union type (alphabetical order).
- Use `getAppPermission(roleLevel, 'your-new-app-id')` in the page to gate `canView` and `canEdit`.
- The page receives `{ canView, canEdit, canManage }` — do NOT hardcode role checks (`isOfficer`, `['gm','officer'].includes(...)`) unless there is a very specific non-permission reason.

### 2. Role editor UI (`src/domains/settings/components/role-editor.types.ts`)

- Add the new app to `PERMISSION_GROUPS` under the appropriate group.
  - `"core"` — global settings, maintenance
  - `"integrations"` — Discord, Battle.net, APIs, notifications
  - `"content"` — news, widgets
  - `"raider"` — all `/zona-raider/` tools like roster, stats, vault
- This makes it appear in **Configuración → Roles → [rol]** so admins can toggle Ver / Editar / Admin per role.
- **Super admin bypass**: if a role has `is_super_admin = true`, it automatically gets full access to ALL apps regardless of `app_permissions` rows. The toggle UI is disabled for super admin roles. You do NOT need to seed permission rows for super admin.
- **Cross-check**: after adding, run `SELECT DISTINCT app_id FROM app_permissions` against Supabase to ensure no orphan apps exist in the DB that are not in the UI — they'd be configurable via SQL but invisible in the role editor.

### 3. Seed default permissions (Supabase)

- Insert rows into `app_permissions` for non-super-admin roles: at least `officer`, `raider`, `trial`, `member`.
- Convention (gm is covered by super admin or its own row — seeding is safe either way):

  | Role | View | Edit | Manage |
  | --- | --- | --- | --- |
  | gm | ✅ | ✅ | ✅ |
  | officer | ✅ | ✅ | ✅ |
  | raider | ✅ | ✅ | — |
  | trial | ✅ | — | — |
  | member | ✅ | — | — |

- Use `ON CONFLICT (role_level, app_id) DO NOTHING` so re-runs are safe.

### 4. Navigation menu item

- Admin adds the link in **Configuración → Menú**.
- The link URL is the page route (e.g. `/zona-raider/roster/season-2`).
- Assign visibility roles in the menu editor.

### 5. Server actions auth

- Server mutations (`"use server"` functions) check the session and apply business-level authorization (e.g. users can only edit their own data, officers can edit any data).
- This is IN ADDITION to the page-level `canView`/`canEdit` gate — do not rely on the page gate alone for mutations.

- **External integration RGPD/LOPD rule:** whenever a new third-party service, SDK, or external integration is added to the project, you MUST verify and update the following compliance artifacts in the same commit (or flag the gap explicitly if you cannot complete it):
  1. `src/app/privacidad/_components/privacidad-content-sections.tsx` — add the provider to section 4 (Destinatarios) and note relevant cookies/processing in sections 5-7.
  2. `src/app/cookies/_components/cookie-inventory-section.tsx` — add every cookie set by the new integration to the correct category (técnicas/necesarias, funcionales, analítica, or publicidad), including name, type, purpose, duration, and provider.
  3. If the integration involves data transfers outside the EEA, document the transfer mechanism (SCC, DPF, adequacy decision) in both sections.
  4. If it is a security or anti-bot service (e.g., Turnstile, reCAPTCHA, hCaptcha), classify its cookies as strictly necessary under LSSI-CE art. 22.2 — they do not require user consent.

## AI agent rules

- **Nunca agregues spinners, loadings, skeletons ni fallbacks visuales.** `next/dynamic` sin `loading` prop. Sin `Suspense` fallback. Sin estados de carga. El usuario no quiere ver indicadores de carga.
- **Cuando el usuario diga "sube los cambios" (o variantes como "subir", "push", "commit and push"):** bump de versión en `package.json` + `CHANGELOG.md`, y luego `git commit` → `git push origin Master`. El agente maneja todo el flujo automáticamente.
- **Verification checklist before completing any task:** run `npm run lint`, `npm run type-check`, and `npx -y react-doctor@latest . --verbose`. All three must pass with zero issues. Fix everything — errors AND warnings — no exceptions.
- **CodeGraph:** use `codegraph_explore` / `codegraph_search` (from pi-codegraph-fix extension), NOT the built-in `codegraph` tool (broken on Windows due to path mismatch).
- **Supabase migrations + safety:** load skill `supabase-migration-safety` (`.pi/skills/supabase-migration-safety/SKILL.md`) before ANY migration or SQL execution against prod. The skill enforces 4 gates: destructive pattern scanner → safety wrapper → pre/post verify → user confirmation. **NEVER apply SQL to prod without loading this skill first.**

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
