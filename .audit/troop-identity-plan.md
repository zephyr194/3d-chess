# Seven troop identities and movement states

## Feature steps

- [x] Ground the troop construction, movement and combat ownership.
- [x] Compare two concrete type and shape sketches.
- [x] Record the throughput checkpoint.
- [x] Implement the selected body and animation design in disjoint files.
- [x] Verify native models and actual UI moves.
- [x] Commit a reviewed patch and deliver images.

## Done predicate

All seven current cartoon troop models have distinct readable silhouettes and body equipment, with different banner shapes where banners are carried. Both faction colours and embedded identity glyphs remain visible. New geometry does not become the lowest point of a model or inflate its intended scale.

Walking and running are observably different in lower-body and upper-body motion. Combat remains a distinct authored action. Bridges and boardwalks retain careful movement. Ferry riding and waiting have no running feet or spinning wheels. Reduced motion and reset restore complete resting poses. Root height .545, scale .68, all stations, road routes, Xiangqi legal moves and capture rules remain unchanged.

## Throughput checkpoint

- Blocking first steps. Capture baseline from current 047a50b source before edits, inspect actual meshes, and choose one movement-state contract.
- Independent workstreams. One implementation owner handles body details and main integration, a second handles pure locomotion and combat sampling. Root handles the capture driver, documentation and final integration review.
- Shared mutable state. Main.ts has one writer until release. Agent outputs and test files are separate. No parallel git mutations.
- Smallest safe decomposition. Retain current factories and combat pivots. Add one focused identity-detail module and a typed pace parameter rather than replacing the renderer or importing model assets.

## Evidence

Fresh native before and after model views, walking and running comparisons, a seven-kind gameplay regression, frozen ferry gait and reset, tests, build, and an independent reviewer with exact source hashes. Browser recordings use a controlled clock and are not real-time performance claims. Pages remains paused.

## Available tools

Native Playwright and Chromium are available. Browser, control-ui and deslop plugin tools remain unavailable. Use the existing native capture method and a scoped independent diff review. Product Design saved-context preflight reports no saved references, so the existing repository and current rendered models are the visual target. Role models inherit the parent configuration.

## Selected design

Choose A's focused identity detail module with the existing procedural factories, and B's independent pace selector and single upper-body pose writer. The judge recommended the same combination. A separate selector permits slow-motion running without changing march/ferry/combat playback rate. This is a presentation style, not a new chess rule or change to route timing.

The seven shape targets are infantry armor and shield, command armor and crown, scholar cap and robe, cavalry mane and saddle, elephant tusks and caparison, armored chariot rails, and reinforced cannon barrel and cradle. Each carries a distinct cloth cut inside the current size envelope. Idle and ferry states restore motion; attack parts and attached decorations share their existing typed combat parent.

## Evidence correction

The first before capture ran before source edits and was valid. A later recapture accidentally used a Vite process launched from the working repository despite archiving the old source in /tmp/identity-baseline. It overwrote the before evidence with new models. The independent reviewer detected identical before/after models. Those before images were rejected and replaced using an explicit Vite root at /tmp/identity-baseline on port 5176. The frozen files were compared byte-for-byte to commit 047a50b, and the capture script now rejects a before server whose main module imports createTroopDetails. Corrected model bounds differ for the old general and chariot as expected. Current after images were retained.
