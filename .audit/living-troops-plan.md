# Living troops and battlefield feedback

## Workflow

- [x] Read the Principles section of the poteto-mode skill.
- [x] Phase A: Frame.
- [x] Phase B: Design the workflow.
- [x] Phase C: Run the loop.
- [x] Phase D: Keep the audit trail.
- [x] Phase E: Verify and hand back.

## Done predicate

Seven troop kinds have observable lower-body locomotion suited to their bodies. Human troops have jointed legs and a planted stance. Horses and elephants use four limbs. Vehicles turn wheels. Moving and stationary ferries never trigger walking. Piece root height .545, scale .68, station coordinates, rules and supported roads remain unchanged.

No known coincident terrain and road surfaces compete at route intersections. Current browser captures cover the reported overlapping surfaces at more than one camera angle.

WASD and arrow keys pan the camera and target together relative to the view. Text inputs and controls keep their native keys. Diagonal movement is normalized, lost focus clears held keys and view reset returns to the default framing.

River flow, downward waterfall motion, breeze and tree motion are inspected in the actual renderer. Ambience off and reduced motion freeze decorative movement. Support geometry remains fixed.

Battle feedback uses a broad metal battle banner with impact and sparks while retaining canvas interaction and a readable mobile layout. Reset cancels stale feedback. Audio respects the sound switch.

## Scope and checkpoint

Five work units touch troop construction and motion, terrain layers and ambience, camera controls, banner visuals and sound, and verification artifacts. Use competing design sketches before choosing the joint model. Implement across disjoint file ownership. Root owns integration and the native browser verification harness. Capture baseline first. Run focused tests per unit, then the full suite and build once integrated. Record a short final browser GIF and matched screenshots. Pages deployment stays paused.

## Design exploration

- [x] Ground.
- [x] Sketch, two candidates in separate files.
- [x] Cross-judge.
- [x] Pick and graft.
- [x] Implement.
- [x] Verify.

## Verification coverage

| Area | Evidence |
| --- | --- |
| Baseline | Native Chromium screenshots and fresh motion inspection. |
| Locomotion | Seven troop poses, wheel rotation, planted feet, ferry stillness, stop and reset. |
| Rendering | Intersection depth ownership, native near and oblique captures. |
| Keyboard | Four directions, diagonal, rotated camera, form focus, blur, reset. |
| Ambience | Actual transforms or vertex positions over time, freeze and rest. |
| Banner | Engagement and impact states, metal sound graph, reset, mobile and reduced motion. |
| Regression | Existing rule and road tests, actual supported march, build, console. |

## Limits

The available subagent configuration inherits the parent model. Independent review is possible, cross-family consensus is unavailable. No Browser plugin tool is exposed, so native Playwright and Chromium capture the existing runnable repository, as in the previous task. Product Design saved-context preflight found no saved context. Remote Product Design reference paths that fail to resolve are recorded as unavailable, not assumed read.

The optional cursor-team-kit control-ui and deslop helpers are not installed. Native Chromium interaction and manual diff review supplied those checks. Scoped no-comments review removed two narrative comments and found no suppressions. The final review is PASS+NOTES for the source hashes in living-final-source.json.

## Chosen design

Candidate A uses distance-sampled foot trajectories and two-bone IK. Candidate B uses angular keyframes and acknowledges that it cannot lock the planted foot horizontally. The independent design judge selected A for contact correctness and recommended B's broader metal banner and waterfall visibility gate. Both scored 4 for their module boundaries. The source sketches and six-criterion review are saved alongside this plan.

The root chose A and grafted B's seven-kind profile table, spoked wheel geometry with real wheel radii, hierarchical joint ownership and broad dark steel battle plate. A thin selection halo replaces the always-visible disk. Moving the troop minimum to zero accompanies disk removal so the troops do not float at the old disk height. Terrain support remains at .54.

The keyboard data model is one held-key set and a camera-target translation per renderer update. It is separate from chess and movement playback. Pan rate follows zoom, diagonals normalize, focus and visibility clear input. Terrain and UI workers own disjoint source files, while the troop worker temporarily owns main.ts. Root defers integration edits to main.ts until that worker finishes.

## Final checks

The final native run passed seven actual marches, seven captures with one impact each, sixteen direction checks, diagonal speed, focus, blur and reset. Red ferry travel had 307 observed frames and black travel had 334, totaling 5769 support rays with no missing support. The last verification hardened the ferry observer to read all four actual wheel nodes from LocomotionRig rather than the removed legacy wheel field. Those wheel quaternions remain frozen while riding and waiting.

All seven decorative categories changed through the real render update callback. Seventeen of eighteen cascade streaks descended in a 200 ms observation; one wrapped upstream. Ambience off and reduced motion froze decoration. Offline metal sound produced nonzero early signal and zero late signal; actual captures schedule one metal transient and the disabled sound switch suppresses it.

The complete final source passed 71 tests and production build. Final source hashes match both the independent review and screenshots/living-troops/after/verification.json. Three GIFs were fully decoded with 32, 112 and 16 unique frames. Finite depth sampling and local foot locking through turns remain explicit limits.
