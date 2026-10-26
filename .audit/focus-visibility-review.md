# Independent focus visibility delta review

Verdict. PASS for the final source recorded in `focus-visibility-review-source.json`. This is an independent inherited-model review, not a cross-model consensus. It supplements the earlier full feature review in `factions-focus-review.md` and supersedes that report's source manifest for the camera visibility change.

## Change reviewed

`createCameraFocus` checks the original azimuth and nearby azimuths at 45-degree intervals. It uses the first candidate with three clear body sightlines, or the candidate with the most clear sightlines if no candidate is fully clear. Camera distance stays 7.8 and elevation stays about 42 degrees. The main callback tests actual terrain geometry at three body heights. It excludes the inspected piece and ignores translucent scenery. Selection, rules, movement, roots and scale are untouched by this delta.

No blocking finding was found. Visibility selection is performed when focusing. It does not continuously choose new angles during a march, so later scenery can still obscure part of a moving piece. The player can adjust the view. The three central body rays do not promise that every part of a large weapon or flag remains visible.

## Independent evidence

- Ran `npm test && npm run build`. All 190 tests passed. The production build passed with the existing bundle-size warning.
- Copied the final source to `/tmp/focus-visibility-site` and ran an explicit-root Vite server on port 5184. Every source/index byte hash matched the working source after verification.
- Exercised native canvas clicks for a red soldier at logical station `(2,6)` and a black soldier at `(2,3)`. Both clicks selected and focused the actor. Camera targets matched piece positions plus .6 height, and measured distances were 7.8.
- Independently cast actual geometry sightlines from the settled native camera to the same three body heights. All six sightlines were clear, with no opaque terrain blocker. Native screenshots in `focus-visibility-review-red.png` and `focus-visibility-review-black.png` were inspected. Faces, torsos and planted feet are now visible. A nearby tree can still touch the edge of the red soldier's wider silhouette.
- Scroll zoom retained focus. Reduced motion reached the target in one native frame. Enemy tactical inspection preserved the red turn and left selection empty. The 390px exit control was visible with no horizontal overflow. Browser errors were empty.
- The delta adds no application comments, TypeScript suppression, or lint-disabling directives. No product files were edited in this review. The named Comment Sicko tool is unavailable, so this was a manual source audit.

The actual production animation callback was restarted after controlled browser-clock installation. These checks are functional evidence, not a real-time frame-rate benchmark. Raw browser results are recorded in `focus-visibility-review-browser.json` and the runnable script has the same filename with `.py` extension.
