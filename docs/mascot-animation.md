# BCIS Buddy animation engine

The mascot uses a hand-authored SVG rig and CSS keyframes, as selected in `mascot-implementation-plan.md`. It adds no animation package, remote assets, or runtime AI calls.

## Animation states

`mascot-animation.ts` is the typed state machine. Its supported states are `idle`, `walk`, `happy`, `thinking`, `processing`, `success`, `warning`, `error`, `sleep`, `surprised`, and `greeting`. A state combines a single animation name, priority, request id, and optional completion duration. Rejected lower-priority requests leave the current state and its timer untouched; equal and higher priority requests replace it. Temporary states return to idle and can run completion callbacks. Looping states have no timeout and are stopped by another accepted state or explicit reset/completion.

`use-mascot-animation.ts` owns the React boundary, timer, visibility pause/resume, callback cleanup, and request identity. Its update path uses one state change for a transition or completion; there is no frame loop. The renderer uses the request id as its animation key so a repeated accepted state restarts cleanly rather than leaving two motions active.

The motion is implemented in `mascot.css` with transform and opacity keyframes on named vector layers. Idle blinks, breathing, looks, stretches, and rare waves are individually scheduled short poses; they do not create a continuously moving idle loop. Walk alternates feet and arms with a small body bounce; happy and greeting wave; thinking reveals the authored chin-touch glove; processing reveals a compact authored laptop and loops separated typing hands; success shows an authored thumbs-up/checkmark and short bounce; warning gestures for attention; error briefly dips then returns to idle; sleep closes the eyes and shows an intermittent drifting Z; surprised briefly widens the eyes. Temporary event reactions use the existing fixed local messages and their confirmed event timing.

## Artwork layers and transform ownership

`MascotCharacter.tsx` draws a local vector illustration under a body root. The torso and neck/head pivot are children of that root. Arms use shoulder -> upper arm -> elbow/forearm -> wrist/hand nesting; legs use hip/thigh -> knee/lower leg -> ankle -> foot nesting. Head-turn, face, eyes, eyelids, eyebrows, mouth, cap, and headphones are separately grouped. Pivots use SVG viewBox coordinates: body root and torso at `(90, 178)`, head at `(90, 139)`, shoulders at `(69, 153)` and `(111, 153)`, left/right elbow in their mirrored art coordinates at `(59, 166)`, wrists at `(53, 177)`, hips at `(78, 177)` and `(101, 177)`, knees at `(78, 185)` and `(101, 185)`, and ankles at `(78, 193)` and `(101, 193)`. The chin-touch hand/sleeve, typing pad, wave hand, thumbs-up, and success mark are authored as intentional poses/details.

Each transform is assigned to one nested layer. Event keyframes animate the inner pose group while idle look/stretch/wave behavior animates a wrapper, so those independent behaviors compose. Walk alternates hip/shoulder swing and foot lift under a small body-root bob. Wave raises at the shoulder, bends the elbow, rotates at the wrist, and tilts the head. Happy and success poses anticipate, bounce, and settle; sleep lowers the lids and relaxes the body while breathing slowly; thinking glances upward as the chin hand reaches position; warning uses a restrained shoulder/elbow gesture. Mood styling crossfades between open eyes, smile arcs, lids, and brow poses. Transform transitions bridge the removal of event animations when a pose returns to idle. Reduced motion removes keyframes and transitions while retaining each state's static pose. This is an articulated 2D pose rig, not mesh deformation or independent finger bending.

The pre-redesign findings are preserved in `docs/mascot-redesign-diagnosis.md` to distinguish the original transform and artwork limitations from the current design.

## Reduced motion and visibility

The application follows `prefers-reduced-motion`, with its existing preference observer updating Buddy without reloading. Reduced motion removes all character keyframes while retaining the selected expression as a static pose. When the document becomes hidden, the SVG remains mounted with CSS animations paused and temporary reaction time is frozen; it resumes with the remaining time when visible again. Unmount clears timers and completion closures.

Phase 6 adds deterministic, injectable clock/random behavior profiles. Professional mode limits idle movement and suppresses lower-priority event poses/messages; Balanced uses moderate expressions and greetings; Playful has shorter idle intervals and can show one inactivity sleep message. Every ambient pose has a cooldown so idle movements cannot overlap. The scheduler stops on unmount or when Buddy is hidden/minimized; active payment and collection batch screens suppress idle behavior.

## Playground and verification

Run the renderer dev server with `npm run dev -w @bcis/desktop`, then open `/mascot-preview`. Trigger each state using the labeled buttons. The playground also has a reduced-motion toggle and reports when temporary poses return to idle. The preview renders without login or API access.

The state-machine tests cover priority, interruption, stale completion, and reset. Hook tests cover automatic idle return, callback delivery, hidden-window pause/resume, looping completion, and timer/callback cleanup. Preview tests cover every named animation and the reduced-motion class. Run `npm run check` and `npm run build -w @bcis/desktop` after animation or rig changes.

The right forearm chin pose, thumbs-up/checkmark, and compact laptop/keyboard were drawn as new authored SVG paths on the separated layers. No supplied layered source file or external rig was needed.
