# BCIS Buddy merge review and repairs

Reviewed merge `b32f140` against mascot parent `d6bae05` and application parent `637e0ee` on 2026-10-11. The mascot feature directory is unchanged between the mascot parent and the merge result: the animation assets, personalities, preferences, and state machine were retained. The IDE-mentioned `.other-worktree.patch` was not present on disk. This review uses committed history and the current implementation.

## Findings and changes

| Finding | Repair |
| --- | --- |
| The newer `createBackup` service was integrated without the documented Buddy event. | Emit processing, verified completion, or failure only around the validated API result. |
| Payment entry and reconciliation were treated as reasons to suppress all speech. | Keep ambient motion quiet there, while allowing confirmed outcomes and errors. |
| A 1.8-second error animation cleared its text before the five-second reading period. | Separate message dismissal from pose completion; neutral poses can retain speech. |
| Lower-priority results were discarded and immediate connection recovery lost to its warning. | Add a bounded, expiring pending queue, coalesce workflow phases, and replace resolved connection warnings. |
| Repeating the same animation class did not restart its one-shot CSS motion. | Give each accepted reaction a fresh artwork animation identity. |
| Every pointer/key action postponed blink and gesture timers. | Reset only inactivity on ordinary activity; preserve gesture cadence and sensitive-workflow suppression. |
| Cancellation left report processing active until its timeout. | Add neutral cancellation feedback without a success claim. |
| Export input included `format` in a strict schema that did not accept it. | Validate the report request and format separately before invoking the bridge. |
| Explanatory speech was buried in settings, and its panel obscured the bubble. | Add a keyboard-accessible Talk button; close settings when its explanation is requested. |

No database schema, financial posting, authorization, preload capability, or external asset changed. Existing unrelated collection-layout and desktop E2E changes are preserved. The existing E2E save-dialog fixture also needed its required empty `filePath` for cancellation to pass TypeScript.

## Verification scope

Component regressions reproduced the missing messages, premature dismissal, lost recovery/deferred results, missing direct control, and postponed gestures before implementation. Service tests cover verified versus failed/unverified backups and canceled exports. The dedicated built-Electron test uses a real login against the isolated test API, then injects fixed UI events to inspect rendered messages, CSS animation restart, reduced motion, keyboard activation, and minimum-window bounds. Those injected events are **not** evidence of real financial posting; the existing operational E2E and PostgreSQL suites cover that separately.

Motion remains CSS/SVG with no new dependencies. Speech uses a 180 ms opacity transition with the existing strong ease-out curve; character motion continues to obey the animation preference and reduced-motion setting. Manual review of every pose on a physical high-DPI display and long-running CPU/memory profiling remain outside this repair.
