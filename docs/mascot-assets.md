# BCIS Buddy character assets

Phase 2 ships the character as authored, layered SVG React artwork. The illustration follows the supplied BCIS Buddy concept: rounded pale face, BCIS blue cap with Wi-Fi mark, blue headphones, large highlighted eyes, blue uniform with Wi-Fi chest mark, white gloves, and blue boots. The 180 × 216 viewBox is the shared proportion contract for full-size and compact rendering.

## Source and layers

The artwork lives in `apps/desktop/src/renderer/src/features/mascot/MascotCharacter.tsx`. Its small vector components separate the head, face, eyes and eyelids, mouth, cap, headphones, body/uniform, arms, hands, legs, and feet. `MascotRenderer.tsx` is the reusable public renderer and adds an inline, bundled fallback if artwork rendering throws. No external image URL, font asset, or runtime network request is needed for the character.

The SVG uses semantic CSS hooks such as `.buddy-head`, `.buddy-eyes`, `.buddy-eyelids`, `.buddy-mouth`, `.buddy-cap`, `.buddy-headphones`, `.buddy-body`, `.buddy-arms`, `.buddy-hands`, `.buddy-legs`, and `.buddy-foot`. Preserve these hooks and the root viewBox when refining paths so the pose animation and compact dock remain aligned. Color values are intentionally grouped close to their paths for now; when the approved brand palette is finalized, move them to shared CSS custom properties without changing the silhouette.

## Expressions and preview

The exact design-review poses are `neutral`, `happy`, `thinking`, `surprised`, `concerned`, `sleepy`, and `celebrating`. `hello`, `processing`, and `walking` are additional operational poses for existing interaction behavior. CSS animations are transform/opacity based, short, and disabled by both the app preference and `prefers-reduced-motion`.

Run the desktop dev server and open `#/mascot-preview` (for example, `npm run dev -w @bcis/desktop`, then navigate the app hash to `mascot-preview`). This route is enabled only in Vite development mode and bypasses login so artwork can be inspected without starting the API. The preview buttons work with pointer and keyboard input.

## Replacing or improving artwork

1. Edit the React SVG layer functions in `MascotCharacter.tsx`, retaining the shared 180 × 216 viewBox, centered character baseline, and CSS hooks listed above.
2. Keep distinct left/right limbs as separate SVG groups or paths; do not cut limbs out of the flattened brand-guide image. Use the guide as a proportion/color reference only.
3. Adjust expression-specific eye, eyelid, brow, and mouth paths from the `mood` prop; keep the seven required mood names in `mascot-model.ts`.
4. Verify the large stage and compact thumbnails at `#/mascot-preview`, including the sleepy and celebrating silhouettes and reduced-motion behavior.
5. Run `npm run check` and `npm run build -w @bcis/desktop` before accepting the asset update.

If future approved illustration files replace the authored vectors, store them under this feature directory, bundle them locally, and validate load/decode errors through `MascotRenderer`. Keep its self-contained inline fallback so a missing optional artwork file never hides the assistant or disrupts financial workflows. Any future animation toolchain or raster assets must preserve equivalent named layers; cropping the supplied flattened image is not an acceptable rig.
