# Final independent living troops review

PASS+NOTES for the current product patch against `58097a5d114e8b77d53e874e04dcd5252981175d`.

I found no confirmed functional regression in the final source. I reviewed the diff and the prior independent report, reran its browser check, inspected the fresh native WebGL captures, and verified the final CSS in Chromium. This reviewer uses the inherited parent model. This is separate review work, without cross-family consensus.

The current files under `src` and `index.html` differ from the prior reviewed source manifest only in `src/styles.css`. The eight changed product files and their exact hashes appear below. The complete manifest is `.audit/living-final-source.json`. A later commit can inherit this verdict if those product hashes remain identical. This report does not identify an uncreated final commit or approve a different patch.

## Checks and evidence

`python .audit/living-independent-review.py` passed against `http://127.0.0.1:5173`. Its result reports `source_unchanged: true` and no page errors. The script retained the native event listeners and application animation callback. It observed W pan, native ArrowDown behavior on the speed selector without camera movement, blur clearing a held D, and view reset clearing a held S. It observed cascade traces moving down, river glints moving downstream, foliage motion, and the ambience switch restoring and freezing decoration. Banner impact returned true once, rejected a duplicate, and reset hid the banner.

I inspected `.audit/living-independent-scene.png` and `.audit/living-independent-mobile.png` after that run. Both contain the rendered scene. The mobile banner fits within the 390 by 844 viewport at 322 by 78 pixels. The page has no horizontal overflow. The mobile seal reads 交锋 in a single vertical column. The title and detail are readable.

`python .audit/living-final-css-review.py` passed and retained its results in `.audit/living-final-css-evidence.json`. Native Chromium reports five entrance animations, each lasting 160 ms. The earliest configured impact at the selected 3× rate is 168 ms, calculated from the live `attackProfiles` and `readPresentationRate()`. This establishes that the entrance duration is shorter than the earliest configured normal-motion strike. It is not a browser performance measurement or an independent replay of the seven actual attacks.

The CSS check observed `metal-jolt`, `metal-flash`, `metal-sheen`, and `metal-spark` animations after the first impact. It confirmed `white-space: nowrap`, `writing-mode: vertical-rl`, and a computed line height of 18.7 pixels on the mobile seal. Its scroll dimensions match its client dimensions. With reduced motion enabled, the banner has zero animations and both sparks and clash elements have `display: none`. The check reports no page errors.

`npx vitest run tests/locomotion.test.ts tests/atmosphere-depth.test.ts` passed all 18 tests. These exercise straight-path world-space foot contact, gait differences, ferry stillness, wheel rolling, reset, elephant stamping, water flow, decoration restoration, and sampled exclusive road-cap ownership. I did not repeat the full suite or production build in this review. The integration owner owns those final checks and the longer seven-kind gameplay, ferry, keyboard, motion, and audio run.

Source inspection confirms that combat impact and banner impact share the existing one-shot threshold branch. Audio obtains its context through the sound-enabled guard. Advisor and elephant retain their nonmetal sounds. Reset clears banner state and animations. I did not audition the audio output. The scoped comment and suppression scan found none in the eight changed product files. I made no product edits and no additional comment deletions.

## Notes and claim limits

The foot solver derives local foot pose from cumulative distance. Straight-path contact is covered. It does not retain persistent world-space foot anchors through yaw changes or a transition to a shorter stride. Some horizontal foot movement through turns is a known limit. Claims of exact foot locking must retain the straight-path scope.

The terrain tests sample cap triangle interiors. They support exclusive top-face ownership at those samples. Neither those tests nor the inspected stills establish the absence of every depth conflict or temporal flicker at every view and zoom. Z-fighting coverage remains finite.

The decision trail `.audit/living-troops.tsv` still ends with a browser rerun marked pending and a full-suite result recorded before the final camera fix. Those entries describe earlier states. They do not substantiate final integration results. Its design rationale, "Planted-foot correctness beats angle-only keyframes", is a design choice with the straight-path qualification above. Its depth-fix entry is supported by source changes and finite sampled tests. This report supplies fresh review evidence. Final delivery claims still require the integration owner's current results.

Prove It Works changed this review from accepting the previous PASS to rerunning the application and inspecting its current captures. The unslop and technical-writing skills shaped the evidence wording and explicit limits. The prior no-comments cleanup remains intact.

## Reviewed product hashes

| File | SHA-256 |
| --- | --- |
| `src/main.ts` | `84dece07994ee3d7a12db2c36847f5ac1a0106df84f0a44c8df2a9c648c03db5` |
| `src/scene/locomotion.ts` | `f9bc446b31eef1221da397ee82d7aa23c6a944d8f890753491726710ff3adb3e` |
| `src/ui/camera-pan.ts` | `b91b9d8963d48612d71403448922ec28bc4213b361d8d621e0371c09a34c6cce` |
| `src/scene/battlefield.ts` | `6ede4b03d6c06300ecae418270db8329c057e0ff9625faf5f18bb16ec60dee36` |
| `src/styles.css` | `395f73579540a6aae8e0e4263a0677c92bd227e7bb6b01d7dea979a798ecf161` |
| `src/ui/battle-banner.ts` | `4b8a592fc7ffe01760ba29319ac942b72134f9ba8d579ab172836100e63b275d` |
| `src/game/metal-impact.ts` | `68aef77e43a6c4e3fe28c595bb4aaad1bed5aad9b8436065248e779a388b22eb` |
| `index.html` | `07a214c03909e9583d92ca788cf176e725d230e9d208ba8c87409addbac41cc7` |
