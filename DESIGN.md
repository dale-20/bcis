# BCIS desktop design foundation

Scope: Milestone 1 connection surface. Mode: Operate. The supplied PDF section 4.1 pins the visual direction; its commercial office-software convention takes precedence over generated design alternatives.

Use a compact navy sidebar, a quiet identity bar, and a single white connection panel on a light canvas. Lead with truthful connection state; show API and database separately. One retry control is the only action. Future modules remain disabled and explicitly deferred. No dashboard metrics or financial data exist yet.

## Tokens

Source of truth: `apps/desktop/src/renderer/src/styles.css`.

| Token | Value / use |
| --- | --- |
| Navy | `#0F2747`, sidebar |
| Primary | `#2563EB`, actions/focus |
| Canvas / surface | `#F6F8FB` / `#FFFFFF` |
| Foreground / secondary | `#0F172A` / `#526278`; secondary darkened for small-text contrast |
| Success / danger | `#047857` / `#B91C1C`, text + icon + label |
| Border | `#DBE2EC` |
| Typeface | Locally bundled Inter 400/500/600 with Segoe UI fallback |
| Type scale | 12px metadata, 14px body, 18px section heading, 24px page title |
| Spacing | Tailwind 4px unit; 24–36px main gutters |
| Corners | 6px controls, 12px principal surface |

Minimum supported desktop is 960 × 640. The 1050px breakpoint narrows sidebar and gutters; panel content may scroll vertically. Status uses polite live announcements. Keyboard focus, disabled/loading buttons, retry, pending, connected, degraded and unreachable states are explicit. No decorative motion; reduced-motion preferences disable transitions.

Future financial tables use aligned tabular amounts and server pagination. Extend this system with working domain features rather than inventing sample financial values.
