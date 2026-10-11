# BCIS Buddy animation engine

Phase 3 uses the Phase 2 authored SVG layers and CSS keyframes, as selected in `mascot-implementation-plan.md`. It adds no animation package, remote assets, or runtime AI calls.

## Animation states

`mascot-animation.ts` is the typed state machine. Its supported states are `idle`, `walk`, `happy`, `thinking`, `processing`, `success`, `warning`, `error`, `sleep`, `surprised`, and `greeting`. A state combines a single animation name, priority, request id, and optional completion duration. Rejected lower-priority requests leave the current state and its timer untouched; equal and higher priority requests replace it. Temporary states return to idle and can run completion callbacks. Looping states have no timeout and are stopped by another accepted state or explicit reset/completion.

`use-mascot-animation.ts` owns the React boundary, timer, visibility pause/resume, callback cleanup, and request identity. Its update path uses one state change for a transition or completion; there is no frame loop. The renderer uses the request id as its animation key so a repeated accepted state restarts cleanly rather than leaving two motions active.

The motion is implemented in `mascot.css` with transform and opacity keyframes on named vector layers. Idle blinks and breathes gently; walk alternates feet and arms with a small body bounce; happy and greeting wave; thinking reveals the authored chin-touch glove; processing reveals a compact authored laptop and loops separated typing hands; success shows an authored thumbs-up/checkmark and short bounce; warning gestures for attention; error briefly dips then returns to idle; sleep closes the eyes and shows an intermittent drifting Z; surprised briefly widens the eyes. Temporary event reactions use the existing fixed local messages and their confirmed event timing.

## Reduced motion and visibility

The application follows `prefers-reduced-motion`, with its existing preference observer updating Buddy without reloading. Reduced motion removes all character keyframes while retaining the selected expression as a static pose. When the document becomes hidden, the SVG remains mounted with CSS animations paused and temporary reaction time is frozen; it resumes with the remaining time when visible again. Unmount clears timers and completion closures.

## Playground and verification

Run `npm run dev -w @bcis/desktop`, then open the renderer hash route `#/mascot-preview`. Trigger each state using the labeled buttons. The playground also has a reduced-motion toggle and reports when temporary poses return to idle. The preview renders without login or API access.

The state-machine tests cover priority, interruption, stale completion, and reset. Hook tests cover automatic idle return, callback delivery, hidden-window pause/resume, looping completion, and timer/callback cleanup. Preview tests cover every named animation and the reduced-motion class. Run `npm run check` and `npm run build -w @bcis/desktop` after animation or rig changes.

The right forearm chin pose, thumbs-up/checkmark, and compact laptop/keyboard were drawn as new authored SVG paths on the separated layers. No supplied layered source file or external rig was needed.
