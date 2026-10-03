# Changelog

## 1.12.4

- feat(reclutamiento): la exigencia de Discord se ve en el formulario (ATW-50) — el aviso aparece sobre los pasos: en verde «Estás en el Discord de Artic Tempest» cuando la pertenencia se confirmó contra el guild, y en ámbar «No hemos podido comprobar tu Discord» con el botón de invitación cuando no se pudo consultar. El caso ámbar es el del *fail-open*: no se bloquea a nadie, pero se dice en lugar de dejarlo invisible, porque entonces el aplicante es justo el que puede acabar incomunicado.
- fix(discord): la invitación pública estaba **caducada** (ATW-50) — la URL centralizada apuntaba a `discord.gg/artictempest`, que la API responde con `404 Unknown Invite`; el mismo valor inválido estaba hardcodeado en `baneado` y en el `sameAs` del JSON-LD del layout público, así que un baneado que pulsara «Contactar con oficiales» veía una invitación inválida y el structured data declaraba a Google un Discord inexistente. Los tres usan ahora `DISCORD_PUBLIC_INVITE_URL`, verificado contra la API: redirige a `hvYQtdK7UM`, apunta al guild `1251201368467701791` y no caduca. La trampa que lo escondía: `curl -I` devuelve 200 en una invitación rota, porque Discord sirve una página HTML igualmente.

- feat(reclutamiento): vista previa para staff del paso de Discord (ATW-50) — el paso que obliga a unirse al servidor solo lo ve quien **no** está dentro, así que ningún oficial puede comprobarlo: verificado que los cinco miembros del staff (GM incluido) están en el servidor, luego con su cuenta esa pantalla no aparece nunca. Es correcto por diseño, pero dejaba el paso sin forma de verificarse. `/reclutamiento/apply?preview=discord`, solo con permiso de administración, renderiza la pantalla con un aviso de que es una vista previa, y el botón «Ver paso de Discord» aparece junto a «Simular Apply» en la pantalla de miembro del roster. **Es solo render**: no exime de la barrera y el envío sigue bloqueado si no estás dentro.

## 1.12.3

- fix(reclutamiento): la simulación de apply ya no se salta la barrera de Discord (ATW-50) — el modo `?simulate=true` eximía de la comprobación de pertenencia al servidor, así que **el oficial que probaba el flujo se saltaba el paso nuevo y no llegaba a verlo nunca**: justo la persona a la que había que enseñárselo. La exención no aportaba nada en la práctica, porque un oficial ya está en el servidor y habría pasado la barrera igualmente; su único efecto real era ocultar el gate. Ahora la única exención es `isTest`, que existe para el self-test diario: el cron envía desde la cuenta del dueño del personaje de prueba, que puede no estar en el servidor, y bloquearlo tumbaría la monitorización de Statuspage. Verificado que `recruitment_test_channel_id` está configurado en producción, así que el self-test sigue exento por esa vía (commit `5b1b06f0` → `1.12.2`).

## 1.12.2

- style(reclutamiento): el bloqueo por no estar en el servidor explica el motivo (ATW-50) — tanto la pantalla de `/reclutamiento/apply` como el error 403 de la API dicen ahora explícitamente que estar en el servidor es **obligatorio porque es el canal por el que un oficial se pone en contacto con el aplicante**, en lugar de dejarlo implícito. Ajuste de copy sobre el cambio de 1.12.1, que todavía no estaba desplegado.

## 1.12.1

- feat(reclutamiento): exigir estar en el servidor de Discord antes de aplicar (ATW-50) — Discord no ofrece ninguna forma de saltarse la privacidad de DMs de un usuario, así que un aplicante que no comparte servidor con el bot no puede recibir ningún aviso. Medido sobre los avisos reales de producción: **3/3 destinatarios que están en el servidor tienen su DM con mensajes y 0/4 de los que están fuera lo tienen vacío**, abriéndose el canal de DM correctamente en ambos casos — el bloqueo está en la entrega, no en abrir el canal. Como más de la mitad de los destinatarios estaban fuera, se elige el arreglo estructural en vez de seguir detectando el fallo después: quien no esté en el servidor ya no puede enviar la solicitud. La barrera vive en `submitApplicationCore` y no solo en la página, para que un POST directo a `/api/recruitment/submit` no pueda saltársela (responde 403 con un mensaje claro), y la página muestra una pantalla con el enlace de invitación público en lugar del formulario. La barrera **no** se aplica al self-test ni a la simulación de admin, para no tumbar la monitorización diaria de Statuspage: el cron envía desde la cuenta del dueño del personaje de prueba, que no tiene por qué estar en el servidor. Falla **abierta** cuando no se puede consultar Discord —un corte no puede dejar el formulario inutilizable— y cerrada solo ante una respuesta negativa confirmada, porque el chat web sigue siendo la fuente de verdad del mensaje.
- chore(reclutamiento): el enlace de invitación público se centraliza en `DISCORD_PUBLIC_INVITE_URL` — estaba duplicado a mano en `baneado/page.tsx` y en el layout público con dos formatos distintos de la misma URL.

## 1.12.0

- feat(reclutamiento): certeza de entrega de los avisos por Discord y panel de entrevistas (ATW-46) — la web guardaba el mensaje del chat de entrevista y publicaba un evento «fire and forget»: el bot lo consumía, intentaba el DM y marcaba `processed = true` pasase lo que pasase, así que un aviso fallido no dejaba rastro en ningún sitio. Verificado en producción: el aplicante en entrevista no está en el servidor (Discord devuelve `404 Unknown Member`) y el canal de DM del bot con él estaba vacío — el mensaje del 2026-10-02 nunca llegó y nadie se enteró. Nueva tabla `recruitment_discord_deliveries`, con RLS de lectura solo-staff y sin política anónima (el bot reporta por API con bearer token), que registra el estado real (`queued`/`sent`/`failed`/`skipped_no_discord`), los intentos, el código de error de Discord, el `discord_message_id` y el `delivered_at`. `POST /api/recruitment/chat` y el PATCH de `recruitment_applications` ya esperan la publicación del evento y devuelven el estado; sin Discord vinculado queda como `skipped_no_discord` en vez de un éxito silencioso, y si el evento no se puede encolar queda como `failed` con `event_publish_failed` (ATW-47).
- feat(reclutamiento): el bot reporta el resultado real del DM (ATW-49) — `artictempest-bot` pasa la fila del evento al handler, `sendDM` devuelve el resultado en vez de tragárselo y el bridge lo envía a `POST /api/bot/recruitment/deliveries/report` (bearer token de `public_api_tokens`), así que el error 50007 deja de ser un `console.warn` perdido. Un evento que el bot nunca reporta se queda visible como «Sin confirmar», nunca como enviado. Requiere el cambio correspondiente en `artictempest-bot` ya desplegado.
- feat(reclutamiento): pestaña «Entrevistas» en Configuración → Reclutamiento (ATW-48) — cola de candidaturas en fase de entrevista con los días en fase, quién escribió el último mensaje, si el staff debe responder, el estado de entrega del último aviso y el alcance del aplicante («Alcanzable» / «No alcanzable» / «Sin comprobar»). Badge de entrega por mensaje y botón «Reintentar» en el chat. Discord no ofrece ninguna forma de saltarse la privacidad de DMs de un usuario, así que cuando el aplicante no está en el servidor se ofrece «Generar invitación» (un solo uso, 7 días): meterlo en el servidor es lo único que desbloquea la conversación.
- fix(reclutamiento): el reenvío del embed de Discord ya no construye su destino desde `req.url` — el host de la petición es controlable por cabecera y a ese destino se le reenvía la cookie de sesión, así que la URL se resuelve contra el origen configurado y se rechaza cualquier destino distinto. La sincronización además deja de poder convertir en 500 un cambio de estado ya aplicado.

## 1.11.48

- fix(bnet, raider.io): la ficha de una solicitud ya carga los datos externos del personaje cuando el reino lleva apóstrofo o acento (ATW-44) — el slug de reino y el nombre del personaje se construían a mano en cada punto de llamada, con reglas distintas y todas incorrectas: Raider.IO recibía `zul'jin` (responde 400) y Battle.net recibía el reino sin acentos (`pozzo-delleternita`, 404) y el nombre sin acentos (`aihar` en vez de `aiharä`, 404), así que cualquier personaje con acento también se quedaba sin datos de Battle.net. Ahora un único módulo compartido (`src/shared/integrations/wow-realm-slug.ts`) aplica en el borde de cada cliente las reglas medidas contra las dos APIs — Blizzard conserva los acentos y elimina el apóstrofo; Raider.IO conserva los acentos y los espacios — e incluye saneo de subrogados sueltos para que un nombre corrupto no haga fallar `encodeURIComponent`.
- fix(bot): el endpoint de payload de Discord ya no propaga una excepción si la URL de la petición no se puede interpretar — en ese caso omite el anuncio en lugar de devolver un 500.

## 1.11.47

- fix(reclutamiento): el self-test del cron ya no envía el DM «Solicitud recibida» al aplicante de prueba (ATW-43) — las solicitudes creadas contra el canal de test (`/api/recruitment/self-test` y el cron `check-recruitment`) publican el evento `recruitment.application.created` con `isTest: true`; el bot lo consume igualmente (lo marca procesado, cobertura del test intacta) pero salta el DM al dueño del personaje de prueba. Requiere el cambio correspondiente en `artictempest-bot` ya desplegado.

## 1.11.46

- chore(deps): actualizado el rango seguro de dependencias (ATW-42) — next 16.3.6, @next/third-parties y @next/bundle-analyzer 16.3.6, @sentry/nextjs 10.75.3, @supabase/ssr 0.12.7, @supabase/supabase-js 2.117.2, @tabler/icons-react 3.48, dompurify 3.4.16, jose 6.2.12, react/react-dom 19.3.0, @types/react(-dom) 19.3, zod 4.6.5, swr 2.5.1, tailwind-merge 3.7, oxlint 1.85, prettier 3.9.9, playwright 1.63 y resto de patch/minor de devDeps. Excluidos majors con breaking changes (@sentry/nextjs v11, framer-motion v13, vitest v5, dotenv v18). Validado: lint, type-check, 626 tests, build y react-doctor 100/100; npm audit sin vulnerabilidades.

## 1.11.45

- style(settings, privacidad): normalización de formato con prettier — reordenación de imports, indentación y saltos de línea en el editor de menú y las páginas de privacidad; sin cambios funcionales.
- chore(openspec): inicializada la configuración de OpenSpec/SDD (`openspec/config.yaml`).

## 1.11.44

- docs(privacidad): los programas de afiliación figuran como destinatarios (ATW-41) — Instant Gaming (Aliasing DMCC, Dubái; sin decisión de adecuación, amparado en el consentimiento explícito del art. 49.1.a RGPD), Proton VPN (Proton AG, Suiza, con decisión de adecuación) y RestedXP. Se explica que actúan como responsables independientes, que reciben la IP y el referrer solo al aceptar publicidad o pulsar sus enlaces, y que sin consentimiento no se carga nada suyo. Actualizada la fecha de última actualización de la política.

## 1.11.43

- fix(publicidad): ningún anuncio de terceros se pide antes del consentimiento (ATW-40) — los banners de afiliados (Instant Gaming, Proton VPN, RestedXP) y el loader `instant-gaming.com/api/banner/partner/loader.js` solo se cargan con consentimiento de marketing, así que ya no aparecen las cookies `ig_pid`, `ig_tz`, `abt_reco*` ni `__cf_bm` de esos dominios en la primera visita. El bloque «Publicidad» desaparece con ellos, sin dejar huecos vacíos.
- fix(cookies): la política de CookieYes se monta dentro de la sección de declaración y se vuelve a montar si el script llega con la página ya cargada.

## 1.11.42

- fix(consentimiento): Cookiebot CMP sustituido por CookieYes (ATW-39) — el banner se carga desde `cdn-cookieyes.com` y la política de cookies de `/cookies` (con el inventario completo) la genera CookieYes, así que desaparecen el script `uc.js`, la declaración `cd.js`, los atributos `data-cookieconsent`, los preconnect y los dominios CSP de Cookiebot. La variable pasa a `NEXT_PUBLIC_COOKIEYES_ID`, con la clave de sitio embebida como valor por defecto para que el banner nunca deje de cargar en producción.
- fix(consentimiento): el consentimiento se lee de la cookie `cookieyes-consent` (`analytics`/`performance` → analítica, `advertisement` → marketing) y GA/AdSense escuchan los eventos de CookieYes (`cookieyes_consent_update`, `cookieyes_banner_load`) en lugar de los de Cookiebot. La política se monta dentro de la sección de declaración y no añade un segundo `<h1>`.
- docs(privacidad): CookieYes Limited sustituye a Cybot A/S como destinatario, cookie de consentimiento y plataforma de la política de cookies.

## 1.11.41

- feat(menu): el editor de un elemento del menú tiene página propia (ATW-38) — se acabó la ventana emergente: «Editar» abre `/zona-raider/configuracion/menu/<id>` y «+» / «Añadir» abren `/zona-raider/configuracion/menu/nuevo` con el contexto de la fila (tipo, categoría padre y posición). Para entrar hace falta permiso de edición en «Menú».
- feat(menu): todos los campos a pantalla completa — nombre, ruta (con selector de página), icono, categoría padre, App ID, visibilidad, activo, descripción del mega menú, clase CSS, ID de elemento y los permisos por rol — con los botones «Crear elemento» / «Guardar cambios» y «Cancelar» al final. Cancelar no guarda nada y, si el guardado falla, se muestra el error sin perder lo escrito. Al mover un elemento a otra categoría, la posición se recalcula en el nivel de destino.
- fix(menu): los botones «Expandir» y «Colapsar» del árbol vuelven a funcionar de verdad.

## 1.11.40

- feat(menu): el editor de un elemento del menú es ahora una ventana centrada con todas las opciones a la vista (ATW-37) — nombre, ruta (con selector de página), icono, categoría padre, App ID, visibilidad, activo, descripción del mega menú, clase CSS, ID de elemento y los permisos por rol, en una sola ventana con los botones siempre visibles. Se acabaron el panel lateral que tapaba el árbol y el scroll largo.

## 1.11.39

- feat(menu): crear elementos del menú en un solo paso (ATW-36) — «Añadir» y el nuevo botón «+» de cada fila abren el editor con un borrador: solo se guarda al pulsar «Crear», así que cancelar no deja nada suelto. El nombre aparece listo para escribir encima, un enlace creado con «+» queda justo debajo de la fila pulsada, crear dentro de una categoría la deja abierta, y el menú se muestra desplegado al entrar (los botones «Expandir»/«Colapsar» vuelven a funcionar).
- fix(menu): la API de administración solo reenvía columnas reales de `navigation_items`, de modo que los campos internos del borrador nunca pueden llegar a la tabla.

## 1.11.38

- fix(menu): repair the visibility permissions panel in Configuración → Menú (ATW-35) — the role grid now shows each role's name (`app_roles.level` / `label`, instead of the non-existent `role_level` / `display_name`), stored roles are pre-selected when the sheet opens (the admin API nests them as `navigation_item_roles`), a failed save reports the server error instead of a false “Cambios guardados” toast, and duplicated items keep their roles. Role sync no longer deletes the previous rows before inserting the new ones, and half-written role rows can no longer hide a menu item from every role.

## 1.11.37

- chore: apply formatter to `sync-engine.server.ts` and `accounts-client.tsx` (line wrapping, no behavior change)

## 1.11.36

- fix(recruitment): derive the recruitment settings tab from the `?tab=` query so the recruits badge in the public and Zona Raider menus always opens "Bandeja de Entrada" instead of staying on "Vacantes de Clase" (ATW-34)

## 1.11.35

- feat(admin): stream "Sincronizar Discord" progress (NDJSON) so the accounts page shows "Sincronizando X/Y…" while the sequential Discord lookups run, instead of looking frozen (ATW-33)

## 1.11.34

- fix(admin): serialize the "Sincronizar Discord" (raider rules) sync instead of firing all member lookups in parallel — parallel requests hit Discord's 1 req/s rate limit and returned 429 "You are being rate limited" for most raiders (ATW-33)

## 1.11.33

- fix(bot): only sync `profiles.role_level` for members who already have a profile (have logged into the web) — stop creating empty profiles for Discord members who never logged in (ATW-33)

## 1.11.32

- feat(bot): add `/api/bot/sync-roles` so the Discord bot can push guild members' roles and keep `profiles.role_level` in sync with Discord (ATW-33) — batched, diff-based upsert to avoid Supabase pool pressure

## 1.11.31

- fix(membership): add the missing Discord `Raider` role mapping and correct `Trial` to the `trial` level (ATW-33) — the sync engine's priority map was also missing `trial`, so trial members could be mis-ranked

## 1.11.30

- fix(auth): re-sync the profile role from Discord on every sign-in instead of freezing the first resolved role (ATW-33) — a stale/invalidated Discord token could leave a user stuck at `invitado` (no Zona Raider menu/access) even after re-login with a fresh OAuth token

## 1.11.29

- fix: switch Cookiebot CMP to `data-blockingmode="manual"` (ATW-33 follow-up) — the site already gates ads/analytics via Consent Mode v2 + `hasMarketingConsent`/`hasAnalyticsConsent`, so Cookiebot auto-blocking was redundant and its script reordering still broke App Router hydration after login

## 1.11.28

- fix: load Cookiebot CMP with `strategy="beforeInteractive"` instead of `afterInteractive` so the consent script stops interfering with App Router hydration (ATW-33) — fixes `Unexpected server data: missing bootstrap script` (Sentry ARTICTEMPEST-WEB-Q), which froze the app after login and blocked navigation to Zona Raider

## 1.11.27

- feat: add Aikido security badge to the landing footer "Web responsable" section (ATW-32) — static banner under the WebCarbon widget and `app.aikido.dev` allowed in the CSP `img-src`

## 1.11.26

- security: fix 4 Aikido issues in artic-tempest-website (ATW-31) — apply `Strict-Transport-Security` globally to all routes; bump `dompurify` 3.4.13 → 3.4.15 and `jsdom` 29 → 30, and force `undici` ^8.10.2 and `es-toolkit` ^1.51.0 via overrides to clear AIKIDO-2026-54683 and AIKIDO-2026-523264

## 1.11.25

- fix: build NextAuth options per-request instead of at module load in `[...nextauth]/route.ts` (ATW-28) — a transient Supabase read failure during a Vercel cold start no longer crashes the whole auth route with `Falta configuración de Discord en app_discord` (Sentry ARTICTEMPEST-WEB-12)

## 1.11.24

- chore: remove the last `/api/download` integration prefix from `proxy-route-access.ts` (ATW-26) — the executable download route was already dropped, so no route is exposed anymore

## 1.11.23

- perf: raise the rate-limit `VERIFY_INTERVAL` from 10 to 50 so the middleware hits the Supabase `check_rate_limit` RPC 5x less often (ATW-27 follow-up) — reduces write pressure on the free-tier DB pool that was causing "Gateway Timeout" spikes

## 1.11.22

- fix: recruitment submit no longer misreports a Supabase query error (e.g. Gateway Timeout) as "El personaje seleccionado no pertenece a tu cuenta" (ATW-27) — `submitApplicationCore` now returns 503 with the real error when the character lookup fails, and only returns the 400 "character doesn't belong to your account" when the row genuinely doesn't exist

## 1.11.21

- refactor: split the recruitment detail header out of `RecruitmentDetailContent` (ATW-26) — removing the executable download pushed that component past the 300-line limit and react-doctor dropped from 100 to 98; the header block now lives in `recruitment-detail-header.tsx` with its shared helpers in `recruitment-detail-view-state.ts`, and react-doctor is back to 100 with 0 diagnostics

## 1.11.9

- fix: repaired the broken install (ATW-18) — Dependabot bumped only `@tiptap/core` to 3.30.5 while the rest of the family stayed on 3.30.0, leaving incompatible `@tiptap/pm` peers; `npm ci` failed with ERESOLVE (Lint CI job red) and local `node_modules` did not match `package.json`. The whole `@tiptap/*` family is now aligned on 3.31.3
- chore: security dependency upgrades — `vitest` / `@vitest/mocker` 4.1.10 → 4.1.11 (GHSA-82fw-gwwq-j7x9, path traversal in redirect mocks) and `@tiptap/*` 3.30.x → 3.31.3 (GHSA-j95f-988m-3j2f ReDoS, GHSA-cp6q-959q-f8rh prototype pollution); `npm audit` goes from 23 vulnerabilities (1 high, 22 moderate) to 0
- fix: react-doctor cleanup (ATW-19) — accessible names for the 53 icon-only buttons, and the duplicated JSX trees extracted into shared components (`news-card-body`, `roster-modal`, `admin-section-header`); react-doctor goes from 84 to 28 diagnostics, score 88 → 92 (the remaining 28 are component-complexity refactors, tracked in ATW-20)
- chore: every external link opened from the UI now goes through `openExternalUrl()`, which only opens validated absolute `http(s)` URLs (blocks `javascript:`/`data:` from database or configuration values)

## 1.11.8

- chore: security dependency upgrades — next 16.3.0 → 16.3.4 (CVE-2026-32740 AVIF/libheif) and fast-uri 3.1.5 → 3.1.6 via overrides (SSRF/validation CVEs)

## 1.11.7

- fix: /progreso "Mejor progreso" no longer shows 100% always — non-kill pulls where Raider.io reports 0% remaining (phase-reset/special wipes) are ignored, so real best progress is shown; "Último pull" label renamed to "En progreso"

## 1.11.6

- feature: footer now credits the site build — "Creado con ❤ por TomasPlatero.com", linking to <https://TomasPlatero.com>

## 1.11.5

- fix: check-streamers cron no longer treats a transient decapi.me avatar 400 as a full outage — the `decapi_avatar` check is now informational (non-blocking), so only the page and uptime checks can trigger a "Streamers degradado" incident (ATW-16)

## 1.11.4

- fix: check-progreso cron now retries each probe once with backoff and runs them in parallel, so a transient Raider.io timeout on the heavy guild-profile endpoint no longer triggers a false "Progreso degradado" incident (ATW-15)

## 1.11.3

- feature: normativa raider — WowUtils addon added as mandatory (CurseForge link), "Cámara semanal" now links to its Discord channel, and joining the Viserio/WowUtils group is now mandatory

## 1.11.2

- fix: cron verify-members no longer writes the non-existent `vertex_sync_at` column (was silently rejecting the profiles update → Discord refresh tokens not persisted and role sync broken); invalidates Discord tokens on 400 and surfaces update errors
- chore: ignore `.pi-lens/` tooling directory

## 1.11.1

- feature: heartbeat crons now auto-create a Statuspage incident (investigating) and a Jira issue (Error, label "incident") on confirmed failure, with per-check dedup and automatic resolution on recovery
- feature: new `monitor_incidents` table tracks incident state (Statuspage id, Jira key, failure counters) — service-role only
- refactor: extracted shared `reportHeartbeat()` orchestrator in `src/shared/integrations/statuspage/monitor.ts`
- chore: added `atlassian-workflow` skill documenting the ATW Jira workflow and Confluence rules

## 1.11.0

- feature: feedback form (Centro de Ayuda) creates Jira issues directly in project ATW via OAuth 2.0 (3LO)
- feature: image/screenshot attachments on the feedback form, uploaded straight to the Jira issue
- refactor: replaced the Jira Service Management help-center redirect with the native form → Jira Software integration
- fix: CSP now allows challenges.cloudflare.com (Turnstile widget was blocked)
- fix: Turnstile verification only active in production (dev works without captcha)
- chore: removed legacy /ayuda guides (primeros-pasos, zona-raider)

## 1.10.11

- security: hide Supabase Storage origin in RSS feed and sitemap via same-origin image proxy (ATW-5)

## 1.10.10

- feature: Statuspage service monitoring — heartbeat crons for web, reclutamiento, progreso and streamers (ATW-4)

## 1.10.9

- fix: Sentry now ignores MetaMask browser extension errors (false positives on /login)

## 1.10.8

- feature: Discord poll/encuesta rendering in Zona Raider announcements card (ATW-1)
- fix: CSP now includes `unsafe-eval` in development mode for React dev debugging

## 1.10.5

- security: global CSP via middleware — all routes now include Content-Security-Policy header
- refactor: extracted CSP builder to shared module (src/shared/security/csp.ts)

## 1.10.4

- fix: removed output: standalone from Next.js config to fix Vercel deployment (ENOENT next-server.js.nft.json)

## 1.10.3

- security: fixed GM demotion race condition — atomic role update via RPC with FOR UPDATE lock
- db: added update_user_role RPC function (migration 00000000000002)

## 1.10.2

- security: fixed path traversal in Supabase Storage operations via sanitizePath helper
- security: fixed sensitive data exposure — officer notes and discord refresh tokens now stripped for view-only users
- security: fixed WoWAudit API key exposure — masked in server response, input uses type=password
- security: fixed MASK handling bug in credentials endpoint (was deleting key instead of skipping)
- security: fixed stored XSS in recruitment chat attachment URLs via URL protocol validation
- security: suppressed X-Powered-By header (poweredByHeader: false)

## 1.10.1

- security: fixed timing attack in cron-auth (=== → crypto.timingSafeEqual)
- security: added path traversal guards in upload-image and upload routes
- fix: wrapped unsafe Buffer.from and new URL calls in try/catch (cron-auth, verify-members)

## 1.9.10

- chore: Next.js 16.3.0 — 90% menos RAM en dev, builds cacheados, SSR +22%, prefetch inlining
- fix(media): agregado displayName a FreshCacheProvider en tests de use-media-files
- fix(media): desactivado no-img-element en mocks de next/image (tests)

## 1.9.9

- test: vitest config actualizado — jsdom, globals, setupFiles, env vars
- test: mocks globales para server-only, supabase-admin, IntersectionObserver, ResizeObserver
- test: reparados 96 tests fallidos en 17 archivos (upload-zone, use-media-files, response-headers, media-picker, file-view, file-detail-sheet, navigation, API routes, storage, cookie-security)
- chore: eliminadas migraciones obsoletas de supabase (rate_limits, media_library)
- chore: eliminado repomix.config.json y .repomixignore

## 1.9.8

- perf: Cookiebot movido a afterInteractive, Consent Mode v2 ya bloquea todo por defecto (~56KB JS + ~11KB CSS fuera del critical path)
- perf: LandingFooter convertido a dynamic import, elimina ~53KB del bundle principal
- fix(api): /api/raiderio añadido a PUBLIC_ROUTES, anónimos ya no reciben 401

## 1.9.7

- fix(seo): metadescripción única para /noticias en vez de la genérica del sitio, elimina duplicado detectado por crawler

## 1.9.6

- feat(home): card de Season 2 "Abismo Venenoso" full-width en progreso, progreso oculto hasta datos de Raider.io
- feat(home): nombres de raids centrados verticalmente en cards con borde de texto
- fix(seo): og:image con width/height/alt, locale es_ES en home, twitter:site @artictempestWoW
- fix(seo): descripcion del sitio ampliada a 155 caracteres, og:image redimensionada a 1200x630
- fix(seo): H1 visible con texto descriptivo en hero, favicon con sizes explicitos 32x32 y 16x16
- perf: eliminado inlineCss experimental que generaba HTML de 1.17 MB por pagina
- fix(hero): corregido typo "Somos es una" -> "Somos una"

## 1.9.5

- fix(carbon-badge): reemplazado SWR por fetch directo con refresh horario; TTL de localStorage reducido de 7 días a 24h para evitar datos stale

## 1.9.4

- fix(roster): donut Recharts minimalista — PieChart + Pie con `fill` en datos, sin Cell ni ChartContainer
- feat(roster): hover bidireccional donut ↔ leyenda

## 1.9.3

- fix(roster): reemplazado Recharts por SVG puro en el donut de stats — elimina hydration mismatch y error "Maximum update depth exceeded"
- fix(roster): segmentos del donut solapan 1px para evitar gaps de anti-aliasing

## 1.9.2

- style(cuenta): botones "Marcar" ahora ghost sin borde, visibles solo al hover de la fila
- style(cuenta): eliminado badge "✓ PERSONAJE" redundante del header de personaje principal
- style(cuenta): nivel del personaje más legible (text-zinc-400 → text-zinc-300)

## 1.9.1

- style(hub): aumentado padding vertical del banner CTA de S2 para darle más presencia
- style(hub): reducido tamaño del saludo en CompactHeader para no competir con los anuncios
- style(hub): mejorado contraste del texto "Progreso raid" sobre el fondo con gradiente
- style(hub): menciones (@everyone, @Trial, @Raider, @Artic Raiders, etc.) ahora se renderizan como pills con fondo
- style(hub): roles de Discord con color ahora también se renderizan como pills usando el color del rol
- style(hub): contador de paginación ahora en blanco para mejor legibilidad
- style(hub): mayor espaciado lateral en los botones de paginación

## 1.9.0

- feat(pages): nuevo sistema de páginas dinámicas con tabla `app_pages` en DB — las páginas se registran automáticamente y aparecen en permisos y menú sin hardcode
- feat(admin): gestión de páginas desde Administración → Contenido → Páginas — edita títulos y configura qué roles tienen acceso a cada página
- feat(roles): nuevo flag `is_admin` global — roles con Administrador pueden editar en toda la web y acceder a la zona de administración
- feat(menu): migrado drag & drop de @dnd-kit a react-arborist — árbol jerárquico real sin saltos ni bugs al arrastrar
- feat(menu): eliminado campo "Orden" del editor — el orden se maneja exclusivamente arrastrando
- feat(menu): picker de páginas registradas en el editor de enlaces — seleccionás una página y se autocompleta URL + App ID
- fix(auth): eliminado hardcoded de `ZONA_RAIDER_ACCESS_ROLES` en navegación pública ahora usa `roleFlags.canAccessZonaRaider`
- fix(auth): eliminado bypass de gm/officer en `resolveAuthzScopeFromFlags` — scope depende de `isSuperAdmin` y `canAccessZonaRaider`
- fix(roster): colores de clases en estadísticas ahora usan los colores reales de WoW en vez de fórmula HSL
- refactor(permissions): `AppId` ahora es `string` (dinámico) — las páginas se resuelven contra `app_pages` en DB
- refactor(menu): eliminado `settings-menu-hint.tsx` y `settings-menu-sortable-item.tsx` (reemplazados por react-arborist)
- refactor(editor roles): eliminada la sección de permisos por aplicación — ahora se configura desde cada página
- chore: eliminada ruta duplicada `/zona-raider/reclutamiento` (se usa solo `/zona-raider/configuracion/reclutamiento`)

## 1.8.3

- fix(tests): 27 tests rotos corregidos — mocks de Supabase `listV2`, permisos `edit` en PATCH media, `extractClientProps` recursivo, buckets renombrados, navegación por carpetas en MediaPicker
- fix(a11y): 11 issues CRITICAL/HIGH corregidos — SkipLink global, `main-content` IDs, `role="dialog"` en modales, orden de headings, contraste de color, `aria-required` en formularios, `prefers-reduced-motion`
- feat(seo): metadatos OpenGraph añadidos a 16 páginas de miembros (9 parciales + 7 claves de Zona Raider)
- feat(skeletons): componentes compartidos `CardSkeletonRow`, `SpinnerFallback`, `PageFallback` aplicados a 5 páginas de Zona Raider
- feat(e2e): tests smoke de Playwright configurados (10 páginas públicas + 2 redirects)
- chore(deps): eliminados `discord.js` y `tweetnacl` (no usados)
- refactor(animations): 5 de 7 archivos migrados de framer-motion a CSS/Tailwind
- chore(lint): ESLint limpio en todo `src/`

## 1.8.1

- fix(normativa): eliminada contraseña interna expuesta y actualizado enlace de Cámara semanal a la web en lugar del canal de Discord.

## 1.8.0

- feat(media-library): biblioteca multimedia centralizada — galería de medios estilo WordPress para gestionar archivos en Supabase Storage. Incluye gestión de carpetas (buckets) con CRUD completo, grid/list de archivos con thumbnails y filtros, drag & drop upload con progreso, panel de detalle con metadata editable, bulk delete, y MediaPicker reutilizable para integrar en noticias, kills, iconos de hermandad y rangos. Ruta: `/zona-raider/configuracion/medios`.
- feat(media-library): tablas `media_folders` + `media_metadata` con RLS, índices y seed de 7 carpetas de sistema.
- feat(media-library): API routes completas bajo `/api/media/` — folders CRUD, upload con signed URL, metadata CRUD, rename, confirm, listado con paginación y filtros.
- feat(media-library): permisos `media-library` en `AppId` y `PERMISSION_GROUPS[raider]` — gm/officer: manage, raider: edit, trial/member: view.
- refactor(media-library): reemplazo de uploaders legacy — guild icon, kill images, wowaudit ranks ahora usan MediaPicker en vez de file inputs directos.

## 1.7.24

- feat(settings): logo de portada configurable desde Configuración General — nuevo campo `public_logo_url` en la tabla `settings` y nueva fila "Logotipo Portada Web" en la UI de admin. Afecta al hero, navbar, footer y página de login del sitio público. El logo estático (`/assets/brand/logo-texto.webp`) sigue como fallback cuando no hay logo personalizado.
- fix(login): queries paralelizadas con `Promise.all` para `searchParams` y `getGuildBranding()` (react-doctor).

## 1.7.23

- feat(recruitment-chat): botón de adjuntar movido al lado de enviar con popover personalizado (Radix UI Popover) en vez del diálogo nativo del navegador. El popover muestra opción "Imagen o PDF" con icono. Preview de adjuntos mejorado con badge PDF, miniaturas y botón X para eliminar. Fix: setTimeout con guard useRef para evitar timeouts concurrentes y cleanup en unmount.

## 1.7.22

- fix(recruitment): la hermandad del aplicante ahora se muestra de verdad en la tabla del inbox y en el detalle de solicitud. La UI existía desde v1.7.20, pero `fetchCharacterRIO` no solicitaba el campo `guild` a la API de Raider.IO (requiere `fields=guild` explícito), por lo que siempre llegaba vacío.

## 1.7.20

- ui(roster-season-2): tabla responsive en mobile — botones de acción en columna, columna Rol oculta en < sm, avatares y paddings reducidos. Header de botones stack vertical.
- refactor(roster-season-2): extraídos `RosterRowActions` y `RosterProfessionCell` para reducir tamaño de `RosterRow`.
- refactor(api-tokens): extraídos `GeneratedTokenCard` y `TokenRow` para reducir tamaño de `ApiTokensSettings`.
- refactor(top-nav): extraído `NavDropdownCard` de `DesktopNavigation`.
- refactor(tour-engine): extraídos `useTourHighlight` y `useTourKeyboard`; corregido patrón de redirect (`window.location.href` en vez de `router.push`); patrón ref para evitar cascada de efectos.
- fix(account-detail): paginación derivada en render (`useRef` + `useMemo`) en vez de `useEffect` para ajuste de estado.
- fix(role-editor): state updater puro en `applyPermissionChange` (sin side effects).
- fix(presence): alineado import de `supabaseAdmin` con el path canónico del proyecto.
- fix(professions): claves estables (`primaryOne`/`primaryTwo`) en vez de índice de array.
- chore: React Doctor 49 → 100 (0 issues).

## 1.7.19

- ui(forbidden): mensaje de acceso denegado más amable y funcional. "Acceso restringido" → "Esta zona no está disponible", y la descripción ya no menciona roles ni permisos: ahora indica al usuario que contacte con un oficial si cree que debería tener acceso.

## 1.7.18

- ui(roster-season-2): la columna "Clase" ahora muestra cada clase con su color canónico de WoW (`CLASS_COLORS`), con gris neutro de fallback para clases desconocidas.
- ui(cuenta): mejoras de contraste en los paneles de personajes y cuentas vinculadas (`zinc-500/600` → `zinc-300/400`, zona de peligro más legible).
- fix(tour): el botón "Ir a Cuenta" del recordatorio del tour ahora cierra el diálogo antes de navegar (`router.push` en vez de `Link`), evitando que el diálogo quede abierto tras la navegación.
- ui(nav): el badge de versión del top nav ahora usa `text-blue-400` para mayor visibilidad.

## 1.7.17

- fix(roster-season-2): arreglados los iconos de especialización de Death Knight y Demon Hunter. La función `getSpecIconKey` usaba una capitalización incorrecta (`Deathknight` vs `DeathKnight`). Reemplazada por tabla de lookup explícita `CLASS_ICON_NAME`.
- ui(roster-season-2): columna "Rol" movida a la derecha de "Personaje" (antes estaba después de "Espec principal").

## 1.7.16

- refactor: limpieza react-doctor + ESLint — 24 errores corregidos, `.obsidian/` ignorado en ESLint, `useState`→`useRef` en apply-client, `.filter().map()`→`.flatMap()`, utilidad del tour extraída a `zona-raider-tour-utils.ts`.

## 1.7.15

- fix(roster-season-2): los jugadores ahora pueden borrar sus propias entradas del roster (nueva acción `deleteMyEntry` con verificación de ownership). El icono de borrar ahora es visible para entradas propias (`opacity-60 hover:opacity-100`).
- feat(roster-season-2): nueva columna "Rol" (Tanque/Healer/Melee/Ranged) calculada a partir de clase + espec principal, con sort personalizado descendente: Tanque > Healer > Melee > Ranged.

## 1.7.14

- fix(roster-season-2): los raiders ya no pueden editar ni eliminar entradas de otros jugadores. Las acciones admin (`adminUpdateEntry`, `adminDeleteEntry`, `adminAddManualEntry`) ahora requieren `canManage` en vez de `canEdit`. En cliente, las filas de otros usuarios solo muestran el botón de editar si el rol tiene `canManage`.
- fix(roster-season-2): añadido botón Cancelar al formulario "Añadir personaje" propio (antes solo lo tenía el formulario manual). Ambos formularios ahora usan `router.refresh()` en vez de `window.location.reload()`.

## 1.7.13

- fix(tour): eliminado el loop infinito de redirecciones al llegar a pasos del tour cuyo destino el usuario no puede ver (ej. profesiones). El tour ahora es consciente de permisos: los pasos con `appId` se filtran server-side según `app_permissions`, y se añadió una red de seguridad que salta el paso si la página rebota al usuario a otra ruta.
- feat(permisos): nueva app `professions` con su propia fila en Configuración → Roles. La página `/zona-raider/profesiones` ya no depende del permiso de `roster`.
- fix(permisos): eliminado el bypass hardcodeado de officer en `getAppPermission` — los permisos ahora salen exclusivamente de la tabla `app_permissions` (configurable desde la web). Se sembraron filas de acceso completo para officer para mantener el comportamiento actual.
- refactor(tour): la navegación entre pasos pasó de `redirect()` en render a `useLayoutEffect` + router, eliminando el patrón de redirección durante el renderizado.

## 1.7.12

- fix(auth): JWT callback ahora tiene fallback lookup por `discord_user_id` cuando el lookup primario por `user_id` falla en refresco de token. Se agregó validación UUID en JWT y session callback para prevenir que Discord snowflakes se cuelen como `user_id` y rompan columnas `uuid` en PostgREST (error 22P02).

## 1.7.11

- fix(tour): la reanudación del tour ahora verifica la ruta también para estado `in_progress` (no solo `paused`). Antes un tour en `in_progress` (ej. pestaña cerrada sin pausar) redirigía al usuario fuera de cualquier página que no coincidiera con la ruta del paso activo. Ahora el tour solo se reanuda cuando el usuario está en la página correcta, independientemente del estado.

## 1.7.10

- fix(roster-season-2): gráfico de clases ahora usa colores canónicos de WoW (`CLASS_COLORS`) en vez de HSL aleatorio por índice. Cada clase mantiene su color fijo (Warrior marrón, DK rojo, Druid naranja, etc.).

## 1.7.7

- feat(zona-raider): card grande de Season 2 Midnight en la portada con CTA a `/zona-raider/roster/season-2`.

## 1.7.6

- refactor(zona-raider): eliminados pasos del roster (`roster-controls`, `roster-list`) del tour guiado. Total de pasos reducido de 22 a 20, rango estimado ahora 6–9 min.

## 1.7.4

## 1.7.5

- feat(zona-raider): nueva página de roster Season 2 Midnight con tabla colaborativa, stats, avatares de Blizzard, iconos de specs desde API oficial, ordenamiento por columnas, y permisos integrados en Configuración → Roles.
- feat(roster-season-2): hasta 3 personajes por jugador, editables inline, y añadido manual por officers con nombre/clase/spec/profesiones.
- feat(permisos): todas las apps de zona raider ahora aparecen en Configuración → Roles bajo categoría "Zona Raider". Nuevo grupo visual con gráfico de tarta para distribución de clases.
- fix(permisos): eliminados orphan apps settings-widgets y desktop-app-cta del sistema de permisos. Agregado maintenance al AppId type que faltaba.
- refactor(sidebar): removida lógica de CTA desktop app.
- chore(docs): AGENTS.md actualizado con checklist de permisos para nuevas páginas en zona raider.

- fix(presence): migrado sistema de presencia de Upstash Redis a Supabase (`profiles.last_seen_at`) para evitar rate limit de Redis (500K cmd/mes). Intervalo de heartbeat ajustado de 60s a 120s.

## 1.7.3

- docs: revisión completa de la documentación para Obsidian — frontmatter YAML, etiquetas, enlaces wiki `[[link]]`, diagrama Mermaid, contenido en español, y ruta faltante `/api-token` documentada.
- docs: configuración de vault `.obsidian/` con plugins esenciales y ajustes de idioma.

## 1.7.2

- feat(home): skeletons para cada sección de la home — 4 `Suspense` boundaries (Noticias, Reclutamiento, Progreso, Streamers) con fallbacks de shimmer en Tailwind puro.
- feat(footer): añadido enlace "Estado Web" en la sección Legal apuntando a OpenStatus (artictempest.openstatus.dev) con icono de actividad.
- feat(api): endpoint público `GET /api/status` con estado, timestamp y uptime del servidor.
- Revert(boneyard): eliminado completamente — el CLI no funciona con Next.js + auth + consentimiento. Los skeletons de la home usan Tailwind `animate-pulse`, sin dependencia externa.

## 1.7.1

- Fix(boneyard): captura de bones no-bloqueante en CI/Vercel — si falla por falta de librerías del sistema (libnspr4.so), la build continúa. Detecta bones existentes y los salta automáticamente.

## 1.7.0

- feat(skeleton): implementado boneyard-js v1.9.0 en toda la web — 57 `loading.tsx` con `RouteSkeleton`, 9 `Suspense` migrados a `BoneSuspense`, 6 componentes inline reemplazados por `<Skeleton>`. Los skeletons ahora son pixel-perfect capturados del UI real con shimmer animation en tema oscuro.
- feat(boneyard): script `bones:ci` para CI/Vercel — levanta servidor temporal, captura bones, y lo mata automáticamente durante el build. `prebuild` incluye captura de bones.
- chore(boneyard): configuración global en `src/shared/ui/boneyard.tsx` con shimmer, colores oscuros, y fallback para cuando no hay bones generados.

## 1.6.6

- Fix(mobile): tabla de profesiones ahora muestra cards en móvil con nombre, badges, progreso por profesión y barra de skill points — la tabla desktop se mantiene igual.
- Fix(mobile): botón "Añadir" del menú de navegación movido fuera del header a su propia fila para evitar solapamiento en pantallas estrechas.
- Fix(mobile): pestañas de estadísticas con `shrink-0` y abreviatura "Armería M+" en móvil para que no se deformen.

## 1.6.5

- Fix(progreso-kills): página de asignación de imágenes de kills optimizada para móvil — eliminado doble padding, bucket de imágenes ahora visible arriba en móvil, badges y textos adaptados a pantallas estrechas, previews con `object-contain`, espaciado responsive.

## 1.6.4

- Fix: Cookiebot `data-blockingmode="auto"` → `"manual"` para evitar que clone los scripts inline de Next.js y rompa la hidratación (error "missing bootstrap script").
- CSP: añadido `worker-src 'self'` explícito para permitir el service worker.
- Consentimiento: el código de lectura de cookies ahora soporta tanto el formato de Cookiebot (`CookieConsent`) como el de vanilla-cookieconsent (`artictempest_cookie_consent`). Los componentes de consentimiento también escuchan eventos de Cookiebot (`CookiebotOnAccept`/`CookiebotOnDecline`).

## 1.6.3

- Progreso: nueva timeline vertical para móvil con las mismas cards de jefes a la izquierda y barra con indicadores de progreso a la derecha. En desktop se mantiene la timeline horizontal existente.

## 1.6.2

- Fix: al borrar un Apply ahora también se elimina el mensaje correspondiente en el canal de Discord, evitando mensajes huérfanos.

## 1.6.1

- Zona Raider: reemplazada la card de "Descarga la app oficial" por un anuncio de ProtonVPN (protección DDoS, privacidad para sesiones de raid).

## 1.6.0

- Historia y cultura: nuevo hito "19º de España" — Midnight Temporada 1 completada con 10/10 jefes en Mítico.
- Noticias: rediseño completo de la página pública con nuevo layout visual, animaciones de reveal, badges de categoría, y diseño responsive mejorado.
- Home page: los `LazySection` ahora reciben `id` como prop y delegan el `id` al children, eliminando `id` duplicados en el DOM. Secciones de reclutamiento y wanted-classes reestructuradas.
- AGENTS.md: nueva regla de version tagging — al cruzar un límite minor o major se crea un tag anotado (`git tag -a vX.Y.0`). Los bumps de patch no llevan tag.
- Varios: eliminado `drop-shadow` del título "Últimas Noticias" en landing, ajustes menores de espaciado y transiciones `motion-reduce`.

## 1.5.25

- Fix: class icons 404ing in POV de Raiders section — image extension was `.jpg` but files are `.webp`.

## 1.5.24

- UX: redesigned SEO settings page — reduced from 7 technical tabs to 3 functional tabs ("Mi sitio", "Analítica y anuncios", "Cookies"). Removed duplicated cookie inventory, overview cards, and sidebar. Simplified header to match other admin pages. Net: -457 lines.

## 1.5.23

- Fix: cookie consent banner not showing — `fetchSeoSettings` now routes through `parseSeoSettings` so Zod defaults (e.g., `enabled: true`) apply when DB values are null.

## 1.5.22

- RGPD/LOPD: updated cookie inventory with Cloudflare Turnstile `cf_clearance` cookie (técnica necesaria, 30 min, DPF).
- RGPD/LOPD: added Cloudflare Inc. as data processor in privacy policy (section 4) and Turnstile in security measures (section 5) and cookies section (section 6).
- Docs: added RGPD/LOPD compliance rule to AGENTS.md — mandatory verification of cookie inventory and privacy policy when adding any external integration.

## 1.5.21

- Security: added Cloudflare Turnstile bot protection to public feedback form (`/ayuda`) and recruitment application form (`/reclutamiento/apply`). Graceful degradation — widget invisible until `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are configured.
- Performance: added `preconnect` hints for Supabase, GTM, Instant Gaming, Raider.io, Discord CDN, and WoW render CDN; added `dns-prefetch` for Cloudflare analytics.
- Performance: hero video now uses `preload="none"` with `media="(min-width: 768px)"` to prevent download on mobile.
- Accessibility: increased progression section label contrast (`text-white/40`→`text-white/50`).

## 1.5.20

- Performance: compressed hero background video from 19.1 MB to 1.8 MB (VP9, 2500kbps, 24fps)
- Performance: homepage now uses ISR (`revalidate=60`) instead of dynamic rendering — fixes `Cache-Control: no-store` that blocked BFCache. Moved session-dependent application status check to client-side.
- Accessibility: added `aria-label` to notification bell icon, hero CTAs ("Únete a nosotros", "Ver Progreso"), and recruitment CTA ("Aplicar a Artic Tempest")
- Accessibility: fixed heading hierarchy in news cards (h5→h3), preventing skipped heading levels when no featured news exists
- Accessibility: darkened `landingPrimary` button background (`bg-blue-500`→`bg-blue-600`) to meet WCAG AA contrast ratio (4.5:1) on small text
- SEO: added explicit `fetchPriority="high"` to LCP hero logo image

## 1.5.19

- Security: added automated security regression test suite (113 tests) covering headers, cookies, authz, XSS sanitization, CSRF, rate limiting, cron auth, and error handling. Tests tagged `@ci` run on every build; `@audit` tests on demand.
- Security: implemented CSRF protection utility (`validateCsrfToken`) with token rotation, session binding, and feature flag. Integrated into global proxy — all state-changing API routes protected when `CSRF_ENABLED=true`.

## 1.5.18

- Landing navigation tooltips: changed from default (top) to `side="bottom"` so popups appear below menu items instead of above.

## 1.5.17

- Landing navigation: added Radix tooltips on all desktop secondary nav items (Inicio, Noticias, Reclutamiento, Progreso, Streamers, Historia y Cultura) and mobile menu items. Replaced native `title` attributes with <TooltipProvider>/<Tooltip>/<TooltipContent> wrappers.

## 1.5.16

- NavMain: fixed `checkActive` to use exact URL matching — parent items no longer stay highlighted when on sub-pages (e.g. "Todos los Ajustes" won't light up when on `/configuracion/camara-semanal`).
- Configuración: hub reorganizado en 5 secciones (Identidad, Miembros, Integraciones, Contenido, Sistema). Eliminados duplicados entre hub principal y sub-hub de aplicaciones. Descripciones de cards reescritas en lenguaje funcional para oficiales.
- Navegación DB: sincronizados grupos del sidebar con la nueva estructura del hub. Eliminados items huérfanos y placeholder "Nuevo Enlace".

## 1.5.15

- Recruitment badge: added tooltip on hover showing "Hay X aplicaciones activas" in both public nav and zona-raider top nav.
- Removed native browser `title` tooltip from recruitment badge links to avoid double popup.
- NavMain: extracted recursive `renderSubItem` for nested sidebar sub-navigation support.

## 1.5.13

- Recruitment bot: include officer name and role label in chat message relay events.
- Proxy access: whitelist `/api/bot/` prefix for integration route access.

## 1.5.12

- API Tokens: added inline label editing (PATCH endpoint + click-to-edit UI) and client-side descending sort by creation date.
- API Tokens: show token ID preview (first 8 chars) in monospace for identification.

## 1.5.11

- Removed `engines.node` from `package.json` to force Bun runtime on Vercel (was conflicting with `bunVersion` in `vercel.json`).

## 1.5.10

- API Tokens: new `/zona-raider/configuracion/api-token` page to generate, list, copy, and revoke public API tokens from the web UI.
- API Tokens: added card in the settings hub under "Sistema & Administracion" (gated by `settings-api.canManage` permission).
- Recruitment bot: publish Discord events on application status changes, chat messages, and new submissions via `bot-events` relay.
- Added `.codegraph/` to `.gitignore`.

## 1.5.9

- Cookie audit: rewrote /cookies page with complete inventory of all 18 cookies/storage entries found in the codebase, grouped into 4 categories (A: 7 técnicas, B: 4 funcionales, C: 4 analíticas, D: 1 publicidad).
- Added 7 missing cookies to the policy: `artictempest_cookie_consent`, `bnet_oauth_state`, `bnet_oauth_return_to`, `discord_linked_roles_state`, `sidebar_state`, `artic-tempest-main-character-id`, feature flags (`enableRoster`/`enableStatsLogs`/`enableWeeklyVault`), plus Vercel Analytics and Speed Insights.
- Clarified that `theme` is localStorage (not a cookie) and currently inert because `forcedTheme="dark"` is active.
- Updated consent section to distinguish between cookies gated by the banner vs. infrastructure monitoring.

## 1.5.8

- Accessibility: added `focus-visible` outlines to all desktop nav, footer, and affiliate links for keyboard navigation (WCAG 2.1.1).
- Accessibility: added dynamic `aria-label` (open/close) to mobile menu toggle, `aria-current="page"` on active nav links.
- Accessibility: added `scroll-margin-top` on `#main-content` so the skip-link clears the fixed navigation bar.
- Accessibility: added `motion-reduce:transition-none` gating to all CSS transitions in footer, noticias cards, and wanted-classes (WCAG 2.3.3).
- Accessibility: improved text contrast across public pages — bumped white opacity from `/40→/60`, `/65→/80`, `/70→/85`, `/72→/85`, blue tints from `/72→/85`, `/75→/85`, `/78→/90`.
- Legal: rewrote Aviso Legal with full LSSI-CE compliance — added hosting provider (Vercel), liability exclusions, Spanish jurisdiction, enhanced owner info.
- Legal: rewrote Política de Privacidad with full RGPD/LOPD-GDD compliance — added retention periods per data type, AEPD complaint right, expanded ARCO+ rights (8), explicit legal bases per processing (art. 6.1.a/b/f), DPD exemption statement, data recipients with SCC/DPF, breach notification commitment.
- Legal: rewrote Política de Cookies with consent mechanism explanation (Google Consent Mode v2, banner prior to cookies, 12-month validity), withdrawal instructions, browser management guide, cross-links to privacy/legal notice.

## 1.5.7

- Fixed all React Doctor issues (85 total): 2 CSRF security errors in GET handlers converted to POST, 47 derived-state bugs resolved, 11 performance optimizations (Set lookups, single-pass iterations, Promise.all), and 25 maintainability fixes (module-scope extraction, large component splitting, unused code removal).
- Score improved from 45/100 to 100/100.

## 1.5.6

- Added POV video tabs for news articles with roster member picker, class icons, and YouTube embeds.
- Integrated Tiptap toolbar button to insert POV tabs markers inline in article content.
- Enabled safe YouTube iframe rendering on public news pages (previously stripped by sanitizer).
- Added signed upload flow for news images with client-side validation and tests.

## 1.5.5

- Refined landing, navigation, footer, and public content surfaces across the site.
- Tightened shared auth, role, and member-zone behavior, including the `/api/me` flow.
- Updated recruitment, progression, and settings UI details, plus related tests and assets.

## 1.5.4

- Fixed recruitment apply saves so owners can edit their own answers without hitting the recruitment permission gate.
- Centralized recruitment raid progression formatting for Discord embeds and the apply view, including separate Sporefall handling.
- Renamed the apply raid section to Progreso Banda, removed tier badges, and switched to season labels.
- Removed dead `/progreso` kill image components flagged by React Doctor.

## 1.5.3

- Reworked the `/progreso` page with season-aware raid timelines.
- Added Season 1 and gated Season 2 progression using Raider.io static start data.
- Filtered progression rows so untouched bosses or raids are not forced into timelines.
- Added timeline roster popups with sorted roles, class icons, Raider.io profile links, and kill images.
- Improved horizontal timeline dragging, edge affordances, and modal interactions.

## 1.5.2

- Improved accessibility across auth, feedback, icon picker, and Zona Raider widgets.
- Removed the active character link from the first Zona Raider widget.
- Tightened dialog and chatbot interactions with better ARIA semantics and labeling.
- Kept the recruitment and raider UI polish aligned with the existing release line.

## 1.5.1

- Refactored the documentation structure into a centralized `docs/` hub.
- Cleaned up the recruitment and raider flows, including new assets and UI adjustments.
- Bumped the project version and refreshed package/dependency metadata.
- Fixed the remaining React Doctor security and maintainability issues, reaching a 100/100 scan with no warnings.
- Hardened recruitment answer updates, fixed the landing recruitment loading state, and removed the broken feedback attachment affordance.
- Refactored `AGENTS.md` into a shorter project root with links to the canonical repo docs.
