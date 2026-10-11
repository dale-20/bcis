# BCIS Buddy design and implementation plan

## Goal and current state

Upgrade BCIS Buddy into a polished, friendly desktop companion guided by the supplied mascot concept: a compact blue BCIS helper with a branded cap, headset, Wi-Fi motif, expressive face, and distinct work-related poses. Keep the commercial BCIS interface restrained; Buddy should add warmth without competing with billing tasks or obscuring controls.

The desktop app is Electron (`apps/desktop/src/main`, `preload`) with a React renderer, strict TypeScript, Tailwind 4, and a small owned shadcn/Radix component set. `main.tsx` provides TanStack Query and `HashRouter`. `App.tsx` mounts `BCISMascot` once inside the authenticated `Workspace`, so it already persists across routed pages and is absent from login. There is no global toast/notification provider: pages render their own loading/error/empty states, while Buddy currently supplies a small polite live message.

The existing feature lives in `apps/desktop/src/renderer/src/features/mascot/`: `BCISMascot.tsx` combines its SVG artwork, event mapping, state, controls, drag behavior, sound, and preferences; `mascot-events.ts` defines typed window events; `BCISMascot.test.tsx` and `services/mascot-events.test.ts` cover component interactions and payment event semantics. Mascot styling is currently in the global `styles.css`. The only renderer image asset found is `assets/bcis-mark.png`; there is no supplied mascot sprite sheet, authored animation rig, Rive dependency, or Lottie dependency in the lockfile.

## Design and animation direction

Use **layered SVG with CSS transforms and small React state transitions** for the next iteration. It fits the existing vector-first component, gives sharp rendering at desktop scaling, supports individually animated limbs and facial features, and avoids adding a runtime dependency or requiring a new authoring tool. The attached concept is a visual reference, not a usable set of production animation frames. A sprite sheet would require drawing and maintaining every frame; Rive is a future option only if the team supplies an authored `.riv` file and accepts the additional package/build cost.

Redraw Buddy as a coherent, more finished character rather than extending the current simple silhouette: a clear cap-and-headset outline, consistent navy linework, controlled blue highlights, a small recognizable Wi-Fi chest mark, nuanced face, and one compact work prop such as a clipboard or tablet. Keep the character readable at its docked size and avoid tiny decorative detail. Make the base pose warm and calm; use gesture, eye/mouth changes, and restrained accent marks for reactions. Respect the existing navy/blue/light-surface palette and Inter typography. Keep the balloon short, optional, non-blocking, and free of subscriber/payment details.

Create an authored set of reusable poses: idle, hello, thinking, processing, success, warning/error, connection-surprised, and rest. Event reactions should be brief and interruptible, with priority rules for errors and connection loss. Processing may loop gently but must stop on completion, failure, minimization, or hidden window. Do not imply a payment, billing run, GCash verification, or backup succeeded until the existing validated service result says it did.

## Event and preference findings

Events are announced from `App.tsx` and the renderer service layer in `services/api.ts` through `announceMascotEvent`. Current events cover login, subscriber creation, billing start/success/failure, posted payment/failure, GCash approval, overdue search results, report start/finish/failure, backup success, and connection lost/restored. The event type carries fixed names only; messages are chosen locally in Buddy. Keep it that way: do not pass account names, balances, payment amounts, references, proofs, or server errors into mascot copy. Avoid treating ordinary query refreshes or unconfirmed submissions as success.

Current preferences are position, minimized state, and opt-in sound, stored under `bcis.mascot.preferences.v1` in renderer `localStorage` and parsed with a strict Zod schema. This is suitable for non-sensitive, per-Electron-profile display preferences and requires no API/database changes. Keep the default muted, tolerate corrupt/unavailable storage, clamp saved coordinates to the current window, version migrations, and do not put authentication or financial information there. Document that preferences follow the Windows/Electron profile; if future requirements need staff-specific preferences on a shared profile, revisit the storage boundary before adding identity-scoped data.

Resolved during implementation: the connection-loss copy now matches the regression test (“Connection to the office server was lost.”). The analysis pass itself did not run tests; the implementation validation is recorded in the task completion report.

## Phased implementation

### Phase 1 — visual specification and asset structure

**Paths:** `docs/mascot-implementation-plan.md`; then `apps/desktop/src/renderer/src/features/mascot/MascotCharacter.tsx`, `mascot-poses.ts`, and `assets/mascot/` only if an authored raster/vector asset is genuinely needed.

Translate the supplied concept into a small vector style sheet: silhouette, line weight, palette, face proportions, and thumbnail readability. Prefer React/SVG-owned paths for the character so colors and accessible labels remain controllable. Keep brand mark artwork faithful to the existing asset and do not embed AI-generated text as a logo.

**Acceptance:** Buddy is recognizable as the same BCIS helper at full and docked size; all planned poses share one silhouette and palette; art is local and requires no network; no new animation dependency is needed.

### Phase 2 — separate presentation from behavior

**Paths:** `features/mascot/BCISMascot.tsx`, `MascotCharacter.tsx`, `MascotBubble.tsx`, `MascotControls.tsx`, `MascotPreferences.tsx`, `mascot-poses.ts`, `mascot-preferences.ts`, `features/mascot/mascot.css`, and the import in `renderer/src/main.tsx` or `styles.css`.

Keep `BCISMascot` as the small orchestrator mounted at the existing authenticated `Workspace` boundary in `App.tsx`. Move SVG drawing, event-to-pose/copy mapping, persistence validation, and controls into focused modules. Retain the typed event union and fixed local messages. Keep Query/router ownership in `main.tsx`; Buddy should not fetch or call the preload API.

**Acceptance:** Buddy remains present across authenticated route changes, never appears on login, has no direct network/preload access, and each module has one clear responsibility.

### Phase 3 — motion, placement, accessibility, and preferences

**Paths:** `features/mascot/mascot.css`, `mascot-preferences.ts`, `MascotControls.tsx`, `MascotPreferences.tsx`, and `BCISMascot.test.tsx`.

Use short, purposeful, interruptible CSS transforms on SVG parts; keep idle motion subtle and avoid continuous movement when reduced motion is requested. Maintain pointer capture and keyboard movement, but restrict drag initiation to a clearly named handle so the rest of the character does not intercept operational controls. Keep the Buddy within the viewport, handle resize, and make minimizing/restoring obvious. Preserve muted-by-default optional sound and the versioned, Zod-validated local preference store.

**Acceptance:** keyboard-only users can move, minimize, restore, and open/close preferences; screen readers get a concise character label and polite event text; focus remains predictable; reduced-motion users get static poses; no reaction covers an essential control at the minimum supported desktop size; storage corruption falls back safely.

### Phase 4 — event integration and quality gate

**Paths:** `features/mascot/mascot-events.ts`, `services/api.ts`, `App.tsx`, `features/mascot/BCISMascot.test.tsx`, `services/mascot-events.test.ts`, and `tests/e2e/desktop.spec.ts`.

Retain the existing fixed event contract and audit every producer for “after confirmed result” timing. Test error/success precedence and duplicate/repeated event handling. Add Electron E2E coverage for authenticated visibility, route persistence, preferences, and secure separation; do not change the backend, database schema, or financial posting logic for mascot reactions.

**Acceptance:** a payment reaction occurs only after validated `POSTED`; billing/report/backup reactions reflect successful completion; failures never receive success poses; no sensitive payload reaches copy or logs; the full existing `npm run check` and relevant Electron E2E pass without financial behavior changes.

## Test plan

- Extend Vitest component tests for every pose/event mapping, error priority, cleanup/timer interruption, hidden/minimized behavior, preferences validation/version fallback, pointer bounds, keyboard controls, and reduced motion.
- Keep service integration tests proving success reactions follow validated API results and failed results never emit success.
- Add a built-app Playwright test in `tests/e2e/desktop.spec.ts` for authenticated-only rendering, persistence while navigating, dock/restore and preferences. Verify the preload surface remains unchanged.
- Run `npm run check`, then `npm run test:e2e` against the configured local test API/database. Capture the app at 960x640 and a typical 1366x768 desktop size for visual review; inspect both full and docked poses and a reduced-motion state.

The implementation preserves the existing mascot event contract and financial behavior. No backend route, database schema, or financial posting rule was changed.
