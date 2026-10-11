# BCIS Buddy animation and artwork diagnosis

Inspection date: 2026-10-11. This records the pre-redesign implementation before its SVG or motion styles are changed.

## Existing rendering and assets

Buddy is a hand-authored React SVG in `apps/desktop/src/renderer/src/features/mascot/MascotCharacter.tsx`; the app does not load a raster, sprite sheet, or external rig. The illustration and alternate arm poses are drawn from SVG paths and ellipses inside one 180 by 216 SVG. The document has logical groups for the head, body, arms, and legs, but most facial and clothing features are individual paths with no reusable joint hierarchy. The fallback in `MascotRenderer.tsx` is a separate, much simpler SVG.

Animation names are selected by `mascot-animation.ts` and `use-mascot-animation.ts`. The hook schedules pose completion with timeouts and pauses those timers while the document is hidden. React passes the selected name and mood as SVG classes; `mascot.css` supplies the keyframes, transitions, idle poses, and reduced-motion rules. The component also uses a short timer to clear dialogue and a scheduler for ambient gestures. No animation-frame loop or third-party animation runtime is used.

## Problems found

1. **Motion feels clunky.** Most poses are repeated rotations or small hops of whole groups. The limbs have little visible joint articulation, so the figure reads as attached pieces swinging around pivots. Several easings use built-in `ease-in-out`; movement starts and stops without much anticipation or follow-through. Frequent activity resets the idle scheduler, so natural blinks and gestures can be postponed through an active session.

2. **Some transforms compete.** `.anim-thinking .buddy-head` sets a static `transform` and also runs a keyframe animation that writes `transform` on the same node. Ambient look/stretch/wave rules also write transforms directly to nodes used by other states. Mood selectors write eye and mouth transforms at the same time as animation selectors. The last matching declaration or active animation wins; these are not composed transform channels.

3. **Pivots are incomplete or inaccurate.** Head pivot is a percentage of the full head group bounds, which include its cap, headphones, and sleep mark rather than a defined neck joint. Arm pivots use view-box coordinates on groups whose child paths are already positioned in global SVG coordinates; their origin is specified near the shoulder but not represented as an actual shoulder joint in the artwork. Leg/foot selectors use `transform-origin: 50% 0`; for the feet this anchors at the top of the boot instead of the ankle/sole joint. The torso pivot is a percentage of a group containing arms, so its bounds do not describe the torso center.

4. **The figure is still mostly one flat object.** The outer SVG contains a small number of semantic groups, but body, cape, uniform, work pad, and arms share one body group; head, headphones, cap, and face share another. Alternate hand/arm drawings overlap one another and switch through opacity. These groups are enough for modest CSS poses but not a clean character rig with independent shoulder, elbow, wrist, hip, ankle, jaw, and eye controls.

5. **Pose changes can snap.** CSS transitions and keyframes both target transforms. When a state class changes, a keyframe starts at its first frame; state selectors can change the underlying transform at the same time. One-shot animations generally omit a deliberate resting fill state, so browsers revert to the base rule at completion. Restarting the SVG with a new React key makes repeated reactions replay, but resets every animated feature at once, including unaffected eye/lid and ambient details.

6. **Jitter is more likely from pose/style conflicts than React scheduling.** There is no `requestAnimationFrame` loop; timers cause occasional state renders, and idle intervals are long. This is not evidence of a high-frequency React render source. CSS keyframes provide the per-frame movement, while React changes pose classes on events and timer callbacks. The same-node transform conflicts, globally rebased percentages, and full-SVG remount for repeated reactions can produce visible jumps. Browser performance under heavy report rendering was not profiled, so load-related dropped frames remain unmeasured.

7. **The artwork is usable as vector source, but not ready for advanced motion.** Its local paths are scalable, transparent, editable, and already grouped into a few useful parts. Its simplified silhouette, uneven detail, variable outline widths, text rendered directly into paths/SVG labels, overlapping pose-specific limbs, and missing articulation points make it a weak starting asset for a polished skeletal animation. A clearer layered SVG with explicit joint anchors and separate expression parts will support substantially better CSS/WAAPI motion without an external rig.

## Planned repair boundary

Replace the authored character paths with a cohesive, locally defined layered SVG that keeps Buddy's BCIS cap and Wi-Fi emblem, headphones, large blue eyes, chibi face, blue uniform, gloves, and boots. Give moving groups explicit SVG-coordinate pivots. Assign each transform channel to one element; keep idle, mood, and event transforms on separate nested layers or use opacity/color when no additional transform layer is needed. Keep the existing event names, React timer/state boundary, accessibility labels, transparent background, and reduced-motion support. No network asset or new animation dependency is required.

This is a code-inspection diagnosis; claims about perceived motion quality and runtime frame performance should be checked against the rebuilt Electron artwork and a manual feel review.
