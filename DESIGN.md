# BCIS desktop design foundation

Scope: authenticated desktop shell and subscriber operations. Mode: Operate. The supplied PDF section 4.1 pins the visual direction; its commercial office-software convention takes precedence over generated design alternatives.

Use a compact navy sidebar, a quiet identity bar, and white operational surfaces on a light canvas. Login uses a calm split layout. The subscriber directory keeps search, status, sortable columns, results, and pagination in one surface. Profiles lead with identity and service accounts, then contacts and service addresses. Creation uses a full-page form so repeated contacts, addresses, and services have enough space. Future modules remain disabled and explicitly deferred.

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
| Spacing | Tailwind 4px unit; 24-36px main gutters |
| Corners | 6px controls, 12px principal surface |

Minimum supported desktop is 960 x 640. The 1050px breakpoint narrows sidebar and gutters; dense tables scroll inside their surface and long profiles/forms scroll vertically. Status uses text plus color and polite live announcements. Keyboard focus, row activation, validation, disabled/loading, empty, error, connected, degraded, and unreachable states are explicit. A short content-entry transition supports spatial continuity; reduced-motion preferences disable it.

Financial and service amounts use tabular numerals and right alignment. Operational tables use server pagination. Extend this system with working domain features rather than inventing sample financial values.
