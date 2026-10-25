# Candidate A. Identity details plus pace profiles

This is a read-only design. No application sources changed. The proposal treats the user's "旗子" as both chesspiece identity and physical military standards. Each of the seven kinds gets a silhouette and a different cloth outline.

## Grounded architecture

Observed in `src/main.ts:433`, `createTroopModel` owns the seven procedural low-poly bodies, movable combat parents, identity glyphs, and creation of locomotion/combat rigs. `createPiece` measures the assembled model's minimum Y before applying `PIECE_SCALE`. New geometry therefore must neither extend below the soles nor increase the assembled rest envelope. `src/scene/board.ts` fixes `BASE = .545` and `PIECE_SCALE = .68`. Keep both.

Observed in `src/scene/locomotion.ts`, gait phase comes from traveled distance divided by scale and stride. `poseLeg` solves two bone IK against `groundY`; ankles cancel hip/knee rotation to keep soles horizontal. Five walkers have distinct stride, lift, stance and phase profiles already. Wheels turn by distance/radius. Boardwalk/bridge narrow the gait and make horses use cautious footfall ordering. Ferry riding, waiting, idle and reduced motion restore planted legs.

Observed in `src/scene/combat.ts`, `TroopRig` is a discriminated union. Every kind has a typed set of joints. Pose application restores rest transforms before applying offsets. Main stops locomotion before combat. General torso, horse head/rider, elephant head/trunk/strike foot, soldier spear/shield, chariot chassis/ram and cannon trunnion/recoil already have real separate action parents.

Observed in `src/main.ts:1370`, main alone advances battlefield routes, reads the presentation rate, turns roots, applies locomotion and coordinates capture/combat. `readPresentationRate` currently speeds marching, ferry travel and combat together. Preserve stations, routes, game rules, root height and root scale. Do not make a visual pace setting change `surfaceSpeed` or battlefield progression.

## Caller usage and data shape

Keep body construction in main. Add `src/scene/troop-details.ts` with one exhaustive `Record<PieceKind, IdentitySpec>`. It owns decorative materials, compact per-kind detail builders, seven standard outlines and deterministic cloth updates. Its useful public boundary is `createTroopDetails(kind, side, anchors)` returning a details rig, `applyTroopDetails(rig, input)` and `restoreTroopDetails(rig)`. Keep registry and mesh representation private.

`IdentitySpec` contains a standard outline and mount, plus a detail builder. Use shared side colors and distinct physical outlines, not seven copies of the same rectangular flag. `TroopDetailAnchors` provides the actual model and explicitly named visual parents from construction. Avoid string searches or moving meshes by class after construction. Main calls creation before final bounds normalization. Decorative parts that should move in combat attach to the existing correct joint. Geometry does not become a new combat actuator.

Extend locomotion input with `pace: 'walk' | 'run'`. Keep `distance`, `surface`, `motion`, `reduced`. The profile table becomes exhaustive by kind and pace. A rig may hold explicitly supplied upper-body visual joints with captured rest transforms. Locomotion owns those joints only during marching. Restore them before combat starts. Combat retains exclusive ownership during attacks. Never have cloth animation write the combat parent's transform.

Cloth input is a small value object, containing simulation time, effective pace, moving state and reduced motion. The caller passes state. Details never query UI or game state. Each cloth mesh stores immutable base vertices and applies displacement from those vertices every frame. This prevents cumulative drift.

## Whole shape

Keep original body extent as the hard rest envelope. Replace plain surfaces with layered forms inside that envelope. Avoid overall scaling and longer weapons. Cut shoulder, helmet and body details from the existing mass rather than stacking above it. These are proposed forms, not screenshots verified in this investigation.

| Kind | Main silhouette and details | Actual cloth standard | Marching and running character |
| --- | --- | --- | --- |
| General | Broad lamellar shoulders, five-point crown with inset center jewel, split back tabard, sword guard with central boss. Keep chest glyph rectangle clear. | Compact swallowtail command banner behind the right shoulder. Replace current tall box flag within its existing envelope. | Deliberate walk with small counterrotation. Run lowers the weapon slightly and leans the torso, while legs keep contact. |
| Advisor | Narrow robe, angular winged cap formed inside its current hat width, cuff bands, visible scroll edge around the tablet. | Short vertical rectangular silk with a stepped lower edge behind one shoulder. | Small measured steps; faster short steps and tablet held steady close to body. |
| Elephant | Broad brow, two short tusks inside the head/trunk envelope, scalloped saddle cloth, leg bands and compact tail. Side glyphs remain fully visible. | Broad trapezoid mounted behind the saddle, with two short lower tassels. | Four-beat heavy walk; faster purposeful four-beat shuffle, no airborne elephant. |
| Horse | Pointed mane ridge, cheek bridle, saddle cantle, short swept tail and hoof cuffs. Keep side badge unobscured. | Narrow lance pennon with triangular point attached below the lance tip. | Diagonal trot shifts toward a stronger running cadence on open ground; narrow surfaces keep cautious ordering. Rider and lance counter the gait with small angles. |
| Chariot | Squared parapet, inset armor panels, roof ridge, exposed axle collars and wheel hubs inside the existing hull/wheel bounds. | Short square notched rear standard replacing the existing box flag. | Wheel rotation remains distance-correct; chassis gets slight pitch/roll, stronger at run. Ram remains ready and does not extend during travel. |
| Cannon | Stepped barrel bands, dark recessed muzzle disk, compact elevating screw and carriage rivets. Preserve rear carriage glyph. | Short triangular forked pennon on the rear side of the cradle, below the present barrel/top envelope. | Wheel-driven haul with tiny cradle vibration; run adds carriage pitch, not fictitious legs or recoil. |
| Soldier | Round helmet with inset ridge, overlapping cuirass panels, compact shield boss and split skirt. Keep front/back glyphs clear. | Small single triangular shoulder pennon behind the spear arm. | Opposing arm/leg walk, then longer stride and ready spear angle at run. Shield remains attached to its combat parent. |

The advisor, elephant, horse, cannon and soldier standard fits must be checked against their existing measured model envelope. If a rear standard cannot fit without overlap, reduce its cloth and pole together. Do not enlarge the model to accommodate it. At board camera size, silhouette distinction has priority over small rivets.

## Cloth construction and animation

Use thin double-sided triangulated cloth, not `BoxGeometry`. A small regular strip grid clipped to each outline is enough. Pin the pole edge. Apply a bounded local wave increasing toward the free edge, with two frequencies and a small pace-driven trailing bend. Preserve the rest vertex coordinate, outline and pole attachment. Small static folds should remain visible when paused. Keep maximum deformation within the reserved per-kind envelope. Border stitching can use thin line geometry or narrow mesh strips on the outline, avoiding a texture dependency.

No cloth simulation or new physics loop. Running increases wave amplitude modestly. Idle may use a very small deterministic wind. Waiting/ferry cloth should respond only to the presentation clock if desired, with legs still planted. Reduced motion freezes cloth at its neutral folded shape and removes upper-body oscillation. Reset, cancellation, new game and capture removal must not retain transforms or keep a separate requestAnimationFrame alive. Main's existing animation ownership remains the source of lifecycle truth.

## Pace decision

Two viable choices exist. A new explicit walk/run control separates animation pace from presentation speed, but adds UI and state. Auto run at presentation rate >= 1.7 uses the existing control and makes both run modes discoverable with one copy change. Recommend the latter for this request. Rename the existing speed label to "行军节奏", relabel 1x as "步行 · 1×", 1.7x as "跑步 · 1.7×" and 3x as "疾跑 · 3×". Keep the cinematic rates and existing feedback. Explain in feedback that this rate also affects ferry/combat timing, since that is existing behavior.

Resolve `pace = presentationRate >= 1.7 ? 'run' : 'walk'` in main and pass it to locomotion. `motion` still determines whether gait can run. Do not infer run from observed world speed, because horse, elephant, mud and ferry have different speeds. Bridge and boardwalk override run profile toward the cautious profile. No run while ferry riding or waiting. A rate change mid-stride must preserve accumulated phase, and profile blending must avoid a planted-foot snap. For the smallest safe version, switch the stride profile at the next cycle boundary and blend only upper-body pose immediately.

## Verification and ownership handoff

Use existing `tests/locomotion.test.ts` planted-foot and world-scale assertions at both pace settings, both sides, open roads, bridge and boardwalk. Add behavioral checks that moving from walk to run mid-stance never puts a sole below BASE and that distance/radius wheel rotation is unchanged. Keep elephant at least three feet planted, including its run profile. Extend combat checks to ensure attached details follow the expected moving parent and all march offsets restore before attack. Test cloth pole edge invariance, bounded vertices and neutral reduced-motion restoration through its public API.

Run `npm test` and `npm run build`. Reuse `scripts/verify-living-troops.py` and `scripts/capture-living-troops.py`, which already capture actual application handlers on a controlled browser clock. Capture all seven types at a fixed close view in rest, walk, run, attack impact and restored rest. Include full-board view so miniature glyph readability is visible. Include bridge/ferry waiting and reduced-motion samples. Controlled-clock captures prove visible states, not performance.

Main owns scheduling, UI pace resolution and model assembly. Troop-details owns appearance and cloth geometry. Locomotion owns IK and march-only visual pose. Combat owns attack transforms. Board and battlefield remain untouched.

## Risks and red flag screen

Ground IK is more important than bobbing. Moving a common parent of hips would lift planted feet unless ground targets compensate. Keep upper-body lean off leg parents. The elephant strike foot is already nested under a combat parent with local `groundY = -.55`; do not flatten or reparent it. Existing general torso captures its flag and shoulders during construction, so add new props to that torso deliberately. Horse ears currently sit outside the head parent; new head details must use the explicit head anchor to avoid detached motion.

Run stride switching can slide planted feet. Preserve phase and adopt a new stride at a safe boundary. Cloth can cover glyphs or extend Box3 bounds; verify every proposed standard in rest and at maximum deformation. Reset must restore march joints before combat to prevent rest-transform drift. Keep the standard registry as the only place that lists outlines. Do not duplicate per-kind choices in main, locomotion and details. No pass-through module, second animation loop, untyped mesh names or new rule state is needed.

Model the Domain shaped the exhaustive identity and pace records. Experience First shaped reuse of the visible speed control and silhouette priority. Test Behavior, Not Implementation shaped checks of actual soles, glyph visibility and captured application states rather than private helper call order. These principle leaf skills were read in this task, along with poteto-mode, architect, how, unslop and architect design red flags.
