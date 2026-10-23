# Independent living troops review

PASS for the reviewed product behavior and completed scoped comment cleanup. I found no confirmed functional regression in the reviewed diff against `58097a5d114e8b77d53e874e04dcd5252981175d`.

This was a separate reviewer using the inherited parent model configuration. It is an independent review, without cross-family consensus. No application source was edited and no commit was made.

## Scope and findings

I read the poteto-mode skill, no-comments skill, unslop skill, Prove It Works principle, implementation plan, relevant source and focused tests. Prove It Works changed the review from source-only assertions to native Chromium checks against the running application. I inspected the current integration, joint solver, camera input, terrain ownership, moving decorations, banner DOM and styles, and metal audio graph.

The native browser check observed camera and target movement from a held W key. ArrowDown on the speed selector changed its native value without moving the camera. This exercised the control-panel text resize that previously caused a framing reset. Blur stopped a held D key. View reset cleared a held S key. These assertions used the real installed input listeners and integrated animation callback.

The existing rendered scene moved cascade traces downhill and river glints downstream between controlled timestamps 100 and 300. Pine canopy instance matrices changed, and a windborne leaf moved. The ambience button restored decoration to rest. A later update at 9900 with motion disabled left the sampled transforms and waterfall vertices identical. The final native scene capture shows actual rendered water and terrain.

The banner accepted one impact and rejected a duplicate. Reset hid it. At a 390 by 844 viewport it occupied 322 by 78 pixels within the viewport. The page had no horizontal overflow. The native mobile capture has readable title and detail text. Neither capture had a page error.

Source inspection found that combat invokes banner impact inside the same one-shot threshold branch as troop impact. Reset clears the banner timer, cancels descendant animations and clears impact state. The metal sound path obtains its context through the existing soundEnabled guard. Advisor and elephant attacks retain their nonmetal impact sounds. This review did not audition audio output or instrument the audio nodes.

Locomotion uses one rig per troop with typed leg chains or wheels. The integration preserves the existing root height, scale, route and ferry playback. Walking distance advances only on land. Waiting and riding restore leg poses and retain wheel rotation. The elephant strike foot owns its nested leg, so combat can lift that foot without fighting the knee solver. The focused tests passed real world-space sole contact, ferry stillness, rolling, combat stamping, downward flow, decoration restoration and sampled road-cap depth ownership.

## Limits

Foot locking is exact along a straight path at a fixed stride. It is not persistent world-space contact tracking through turns. Root yaw interpolation and the transition to a shorter boardwalk stride can move a planted foot horizontally. This follows directly from deriving the local foot pose from cumulative cycle distance. The existing tests prove straight-path contact, not turn locking. Treat the supplied foot-contact claim as scoped to straight motion.

The road test samples triangle interiors across cap meshes. It establishes exclusive cap ownership at those samples. One still frame does not prove the absence of every depth conflict or temporal flicker at every angle and zoom. I did not independently rerun the complete seven-kind gameplay, ferry and combat matrix. Root owns that broader browser run. I did not measure performance.

The browser script exposes existing private scene references in the served main module. Product logic remains unchanged. It installs the browser clock before loading the application. An earlier attempt installed the clock after load and lost the pre-existing animation scheduling. That attempt failed the pan assertion and was rejected as an observation error. Both final captures use live native WebGL drawing. Earlier cleared-buffer captures were replaced after inspection.

## Scoped comments and suppressions

I flagged two pre-existing narrative comments in the touched battlefield file. The river construction comment and the frontier-bank geometry comment repeated the adjacent code. Neither named an external constraint. The integration owner accepted both findings and deleted the two comments. I inspected the resulting diff and reran the scoped comment and suppression search. It found no remaining comments or suppressions in the reviewed product files.

The cleanup deleted two comments and restored none. There were no accepted workaround fixes, no encoding offers and no unenforced external constraint. No architect sketch or review rerun was needed for these two simple deletions. I made no application-code edits. The reviewed product prose has no substantive defect requiring a rewrite.

## Reproduction and evidence

Commands run from `/workspace/3d-chess`:

```sh
npx vitest run tests/locomotion.test.ts tests/atmosphere-depth.test.ts
python /tmp/living-independent-review.py
sha256sum src/main.ts src/scene/locomotion.ts src/ui/camera-pan.ts src/scene/battlefield.ts src/styles.css src/ui/battle-banner.ts src/game/metal-impact.ts index.html
```

The focused test command passed 18 tests across two files. The final browser command returned PASS, source_unchanged true and no page errors. The complete executable is retained as `.audit/living-independent-review.py` and can be rerun with `python .audit/living-independent-review.py` while the Vite server is running at `http://127.0.0.1:5173`. Chromium used `/usr/bin/chromium` with native WebGL through SwiftShader. Controlled timestamps are for behavior assertions and are not performance measurements.

Evidence files are `.audit/living-independent-evidence.json`, `.audit/living-independent-scene.png` and `.audit/living-independent-mobile.png`. The JSON includes before and after hashes for every file under src and index.html. All hashes remained unchanged during the final browser run. The integration owner subsequently removed the two accepted narrative comments from battlefield.ts. I inspected those deletions and recorded the final source hashes below. The evidence JSON retains its original runtime hashes without alteration.

| Reviewed file | SHA-256 |
| --- | --- |
| src/main.ts | `84dece07994ee3d7a12db2c36847f5ac1a0106df84f0a44c8df2a9c648c03db5` |
| src/scene/locomotion.ts | `f9bc446b31eef1221da397ee82d7aa23c6a944d8f890753491726710ff3adb3e` |
| src/ui/camera-pan.ts | `b91b9d8963d48612d71403448922ec28bc4213b361d8d621e0371c09a34c6cce` |
| src/scene/battlefield.ts | `6ede4b03d6c06300ecae418270db8329c057e0ff9625faf5f18bb16ec60dee36` |
| src/styles.css | `eaa257ee54a1d3b13b33aebcb732d2d8e16a152830f28cbdb74e2ca5844d9d3b` |
| src/ui/battle-banner.ts | `4b8a592fc7ffe01760ba29319ac942b72134f9ba8d579ab172836100e63b275d` |
| src/game/metal-impact.ts | `68aef77e43a6c4e3fe28c595bb4aaad1bed5aad9b8436065248e779a388b22eb` |
| index.html | `07a214c03909e9583d92ca788cf176e725d230e9d208ba8c87409addbac41cc7` |
