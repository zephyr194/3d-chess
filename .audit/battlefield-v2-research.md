# Battlefield v2 decision evidence

Baseline commit `37b6fed641de990f941016e4ec7b6a9461a9bb7f`.

## Grounding

The production engine already accepts forward and lateral moves for red soldiers at logical rank 4 and black soldiers at rank 5. A soldier separating generals on the same file cannot leave that file. The baseline browser fixtures demonstrate both cases in `screenshots/battlefield-v2/before/reproduction.json`. No production custom-position editor exists in this checkout, so fixtures are injected only into browser responses.

The old scene markers used a small depth-tested cylinder. Marker visibility was a plausible presentation issue, rather than a reproduced engine-legality defect. The chosen fix retains `legalMoves` as the source for the scene, preview and tactical board, increases marker visibility, and explains prohibited lateral moves.

The old animation captured `speedSelect.value` once at move start. Changing the selector during an actual move from .62 to 1.7 left the measured presentation increment at approximately .62. The baseline browser record is `screenshots/battlefield-v2/before/live-speed.json`.

Old capture signatures changed effect meshes but did not articulate the models. The implementation therefore binds real weapons, limbs and vehicle parts to typed per-kind rigs rather than adding another particle-only signature.

Tree exclusion required station clearance 2.35, greater than the 2.263 maximum nearest-station distance within a 3.2 square. Wide road flattening also removed interior relief and could fill water channels. The baseline WebGL instance count was one interior tree.

The old ferry was a 2.2 by 1.7 by 2.5 box. Its deck stood 1.59 above water. Shared transport timing already worked, so visual geometry and water levels could change independently of that clock.

## Design comparison

Two independent agents explored continuous watershed synthesis and modular region meshes. A separate judge preferred the shared continuous sampler, with the compact hydrology data proposed by the other candidate.

The selected approach keeps one landscape sampler, connected watercourse data and deterministic secondary variation. It preserves road centerlines and station coordinates. Trees and relief occupy space between narrow protected travel corridors. Rendered water and derived creek bridges read the same data.

Interchangeable region meshes would provide content quotas, but introduce seams and a second connector graph. That risks recreating the visible square layout the user rejected. It was not selected.

The ferry keeps the compiled waiting, boarding, riding and disembarking timeline. A pointed sloping hull, lower freeboard, ribs and oar address its appearance without introducing a second boat-position writer or vertical motion.

## Implementation partition

The terrain owner edited only `landscape-layout.ts`, `battlefield.ts` and battlefield tests. The gameplay owner edited only `main.ts`, new `combat.ts`, tactical UI, controls and gameplay tests. The parent owned browser instrumentation, artifacts and documentation. Owners paused production edits while real browser capture ran.

An advisor tablet rotated downward in the first action test. A world-position assertion reproduced it, and reversing the arm rotation made it rise. The capture tail was capped by surface speed to prevent a suspended animation score from snapping the last .8 units. Actual-model inspection also moved the general's sword arm into its weapon pivot. All fixes retained base height and scale.

## Review and verification

An independent readonly runtime reviewer found no confirmed blocker in reset cancellation, capture tail, live speed, nested cannon rig restoration, ferry dimensions or canonical legality. A separate scoped comment reviewer found no new suppressions or unnecessary comments. The parent inspected the production diff and actual images.

All roles use inherit-parent per project configuration. This is independent contextual review, not cross-family model consensus. Cursor-specific control-ui and deslop were unavailable; Playwright and direct diff review were used.

The final report records red and black lateral moves, normal-motion live speed changes, both ferry directions with nine actual support rays per frame, seven actual model attacks, one impact per capture, restored rigs, attack reset, and mobile layout. See `screenshots/battlefield-v2/after/verification.json` and `docs/battlefield-v2.md` for reproducible commands and limits.
