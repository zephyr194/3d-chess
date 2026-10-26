# Independent review

Verdict. PASS + NOTE for the source recorded in `factions-focus-review-source.json`. No blocking correctness findings. This is an independent agent review using the inherited parent model, not a cross-model consensus.

## Source and behavior

Reviewed the actual camera-focus state, main pointer/tactical selection integration, reset/reduced-motion lifecycle, faction factory additions, gait timing and typed audio mixer. Focus and selectedId have separate owners. Clicking a legal enemy destination still routes to tryMove. Inspecting an enemy does not grant it a turn. Moving and disappearing pieces are read from current pieceGroups rather than captured positions. Music and effects share one lazy context and compressor, with distinct gains. Reset cancels scheduled effects, and victory stops ongoing battle drums.

The initial focus inherited too steep an overview angle, hiding most body details. This review suggested changing inspection elevation. The final camera now preserves azimuth at about 42 degrees. This accepted change was rechecked against an immutable source snapshot.

## Independent checks

- Ran `npm test && npm run build`. All 189 tests passed. Production build passed. Vite retains the existing bundle-size warning.
- Ran native Chromium/SwiftShader against a frozen `/tmp/factions-review-site` copy on port 5182. Black canvas click selected the piece and centered the camera target at its position plus 0.6 height. Measured focus distance was 7.8. Scroll zoom retained focus. Reduced motion reached the target in one native frame. Tactical enemy inspection preserved the red turn and left selection empty. At 390px the exit control remained visible and the document had no horizontal overflow. Browser page errors were empty.
- Captured and inspected `factions-focus-review-black.png`. The image is an actual board view, not a generated mockup.
- Independently reran production Web Audio in Chromium OfflineAudioContext. The metal-impact RMS was 0.06075 over a one-second window. Victory remained audible until 3.85 seconds. Effects mute, zero volume, reset, and mid-victory cancellation all produced exact zero after cancellation. Maximum tested simultaneous sound at 100 percent effects/music peaked at 0.93693, below clipping. Results are in `factions-focus-review-audio.json`. The implementation agent's before/after comparison is separate evidence; this review does not claim an independent baseline comparison.
- Reviewed faction tests and both factory branches. Geometry differs between all seven matching red/black kinds even with identical input materials. Flags have distinct cuts and share their animated geometry with glyphs. Armor/skin/vehicle material choices remain within the current factory. Root height and scale are unchanged.
- Scanned scoped application files for comments, TypeScript suppression and lint-disabling directives. No new application comments or suppressions were found. This was a manual source audit; the named Comment Sicko tool is not available. No application files were edited by this reviewer.
- Rechecked every source hash after verification. The working source matched the frozen review manifest.

The initial native attempt was rejected after a Vite HMR navigation while implementation was still changing. The accepted native results come from the later immutable snapshot. Native canvas callbacks were restarted after installing the controlled browser clock; the original production callback performs the updates. This is not a real-time performance benchmark.

## Note

Focus preserves azimuth and has no terrain-occlusion solver. At the inspected black soldier station, a foreground tree hides part of the lower body. Dragging the view releases follow and lets the player orbit around it. This is a visual limitation, not a rules or selection failure, and should remain disclosed in the handoff.

The root agent's larger native 28-march run and final recording are separate checks still running when this verdict was written. They are not included in the independent claims above.
