# PASS + NOTES

Independent review of the working patch against `047a50b72123956333b4ce14f59955ed344dcac2`. No blocking product defects remain in the reviewed source. This verdict covers the source manifest below. It does not claim that a later revision has been reviewed.

## Native checks

I ran `.audit/troop-identity-review-browser.py` with Playwright and `/usr/bin/chromium` against the Vite app at `127.0.0.1:5173`. The script uses actual legal-move UI handlers and the original application renderer callback on a controlled clock. It exposes fixture loading and inspection values through response injection. It does not replace movement, gait, route progression, combat, or game rules. The renderer callback is restarted after clock installation so its initial RAF cannot remain on wall time. Controlled frames prove behavior, not frame rate.

The independent output is `.audit/troop-identity-review-browser.json`. It reports PASS and zero browser errors.

- All seven kinds in both factions preserve root Y `.545`, scale `.68`, and a resting world minimum Y of `.545`.
- All fourteen standards have the expected faction color, fixed pole-edge vertices, live free-edge flutter, and one shared deforming geometry and UV attribute for cloth and glyph.
- Actual red and black soldier moves at presentation rate `.62` have different walk/run knee and upper-body poses. Their completion simulation deltas agree exactly within each side, at `2.29152` and `4.07712` respectively.
- An actual horse move changes run to walk and back after cycle boundaries. Sole heights at those observed changes remain at or above `.545` within floating-point tolerance. The unit checks separately assert no planted-foot sliding through pace changes.
- An actual chariot move from `(4,7)` to `(4,2)` enters a bridge with selected run and presentation rate `3`. The effective rig pace becomes walk and narrow reaches `1`.
- Reduced motion enabled during a real horse run restores combat joints, cloth rest vertices, and planted feet. Ambience off freezes cloth and switching it on resumes flutter. Reset restores all 32 troops and their upper-body rests.
- At width `390`, the pace select remains visible and the document has no horizontal overflow. I inspected `.audit/troop-identity-review-mobile.png`.

I inspected the rendered native-factory comparison in `.audit/troop-identity-review-faction-gallery.png`. It shows the seven bodies in red and black with the same scale. The crown, scholar cap, elephant face and tusks, horse rider and mane, armored chariot, reinforced cannon, and infantry shield are distinguishable. This gallery is visual inspection evidence only. Native move assertions above provide gameplay evidence. At this overview size, small flag cuts and glyphs are secondary cues. Body forms and faction colors carry identification.

I also inspected and checked the source hashes in `screenshots/troop-identity/after/verification.json`. That separate implementation-owner run covers all fourteen kind/pace legal marches, seven native captures with one impact each, and a run-selected ferry crossing with 306 sampled frames, 2,754 support rays, zero unsupported samples, and zero frozen-gait failures. Its three recorded clip file hashes match the reported files. I did not count that run as an independently repeated ferry or seven-capture check.

## Source and ownership review

`TroopRig` remains a discriminated kind-to-actuator map. `createTroopDetails` accepts that typed rig and attaches the soldier shield to its shield joint, general decorations and marks to its torso, horse head parts and ears to its head, horse standard to its lance, elephant ears and tusks to its head, chariot decorations and side marks to its chassis, cannon rings and bore to its barrel, and the advisor front mark to its tablet arm. Runtime descendant and mark-parent records are in the browser JSON.

March and attack both use `applyCombatPose` as the upper-body writer. Main chooses one branch of the lifecycle. Stops restore that rig before combat or idle. Cloth writes its own vertices. Extra decorative motion writes separate child nodes. There is no added animation loop, parent bob above the IK hips, route-rate change, or chess-rule change in the product diff.

I independently ran `npm test` and `npm run build`. All 146 tests passed. TypeScript and the production build passed. The build still emits its large-chunk advisory. `git diff --check 047a50b` passed.

## Evidence correction and envelope

The first before/after pair I inspected was invalid. Both galleries were byte-identical and showed the new details. I reported that defect before issuing a verdict. The implementation owner found that the supposed baseline Vite process served the working directory. The before set was then recaptured from an explicit `/tmp/identity-baseline` root at port `5176`.

I inspected the corrected before gallery. It has the old cone crown, plain cannon, original shield, and two old rectangular standards. I compared every frozen `src` and `index.html` file against `git show 047a50b:<path>`. There were zero mismatches. I then compared the corrected resting bounds against the final after bounds. No kind grows in width, height, or depth beyond floating-point tolerance. General height decreases from `1.2342` to `1.1492` world units and chariot height from `.9214` to `.84456`. The other height envelopes remain unchanged. Full measurements are in `.audit/troop-identity-review-envelope.json`. The evidence defect is resolved.

## Scoped comment and suppression audit

I read the no-comments skill and performed its fresh scoped audit in this review role, as directed by the coordinator because the requested `subagent_type` is unavailable. I inspected the changed tracked files and new identity module, tests, capture script, and verification script. There are no added inline code comments, new lint-disable directives, TypeScript suppression directives, or claimed external constraints to encode. No comments were deleted or restored. No application-code reshaping was requested. There were no rejected reports or audit reruns. Dynamic fixture `as never` casts in tests are type assembly for their generated actuator records, not new compiler suppression directives.

Prove It Works shaped the decision to drive native handlers, inspect screenshots, and bind the verdict to exact source hashes. Minimize Reader Load shaped the ownership review through the typed combat parents and single pose writer. I read both principle leaf skills during this review.

## Final product source manifest

The complete manifest is also saved as `.audit/troop-identity-review-source.json` and matches both native verification reports.

| File | SHA-256 |
| --- | --- |
| `src/game/battle-drums.ts` | `935e3ae9d7c52c8ed383dcd68ebaf9005e559107e00350f2ae52504e53e7d0a7` |
| `src/game/metal-impact.ts` | `68aef77e43a6c4e3fe28c595bb4aaad1bed5aad9b8436065248e779a388b22eb` |
| `src/game/xiangqi.ts` | `ee3257e3428e6d7652991e99c27fe774ff75a850916c531a1db539952bef04f4` |
| `src/main.ts` | `635f5f49fa6d80a198db2c445ee6468da3db4d1f03daf2af4c0c326aab26858b` |
| `src/scene/battlefield.ts` | `6ede4b03d6c06300ecae418270db8329c057e0ff9625faf5f18bb16ec60dee36` |
| `src/scene/board.ts` | `fc6881aa8cd6f507b1a4b38b5e3073561b1c73b844bcf6f5fe15a997bd73a9a3` |
| `src/scene/combat.ts` | `7ee4622645e18564bd967d768c75a6e2821ec89c5648784af63a5ddf8bbf898f` |
| `src/scene/landscape-layout.ts` | `82a0b83a12b01f06db72eb618ed5c17b49774e6f676ce111d82a51e8b2d1ac6e` |
| `src/scene/locomotion.ts` | `2d9476e06fbc4b7d56f651a4d253fed63c46e65d37d204ce0c3ee1efd11db412` |
| `src/scene/troop-details.ts` | `4620bf29206560852d8cad1422f2d2c58b15e09f31b939256cf9f0f99486fe04` |
| `src/styles.css` | `2836e8ba43cfed586b8fc111d25aac86cce1208976a174fd98b3d46be7f81196` |
| `src/ui/battle-banner.ts` | `4b8a592fc7ffe01760ba29319ac942b72134f9ba8d579ab172836100e63b275d` |
| `src/ui/camera-pan.ts` | `b91b9d8963d48612d71403448922ec28bc4213b361d8d621e0371c09a34c6cce` |
| `src/ui/tactical-board.ts` | `250b654307da749c7acc106bbba08bb7302a4ab722b68bc0edbba9b987a685df` |
| `index.html` | `2c415b51b9ed1c6c4c5a8db575e714cf2a0b297ffcd610c7933caed27e734699` |
