# Candidate B: hierarchical joint clips driven by route distance

## Grounding

This is a design sketch from current source. I also inspected root's fresh native screenshot `screenshots/living-troops/before/02-waterfall.png` and fresh `before/inspection.json`. Application code was not edited.

### Overview and ownership

`src/main.ts` currently owns all troop meshes, combat pivot construction, piece roots, march orchestration, camera and synthetic sound. `scene/combat.ts` owns the typed seven-kind combat pose registry and restoration of pivot transforms. `scene/battlefield.ts` owns support geometry, the boat march score and decorative motion. `ui/battle-banner.ts` owns one replaceable event timeout; CSS owns its current small appearance.

### Key concepts

The chess station is distinct from the march route. `board.ts:2-7` defines ground .54, root .545 and scale .68. `animateMove` consumes the existing `MarchPlayback` score and uses distance along a route, while `startMarch` distinguishes walking, waiting and riding. This boundary already prevents ferries from being cosmetic moving bridges. Preserve it.

The combat rig must remain independent of march gait. A march ends by restoring locomotion joints before `animateCombat` restores and manipulates weapon/torso joints. Do not let a loop reapply walking after attack begins.

### How it works now and gotchas

- `main.ts:372-387` creates a single centered cylinder per human leg. There is no hip pivot, knee, ankle or boot.
- `main.ts:1417-1424` rotates every tagged cylinder by a sine wave and bobs the whole troop. The amplitude is multiplied by `sin(u*pi)`, so the same ground speed produces near-zero strides at route endpoints. This cannot show a planted foot or a knee bending.
- `main.ts:732-762,771` creates a .2-high circular base and gold ring, then raises the entire model until its lowest mesh rests on that disk. The moving disk remains the most salient contact with the road.
- Wheel rotation already uses the wheel's local cylinder axis via its rest quaternion. The problem is that `main.ts:1427` assumes radius .2 for every wheel. Actual radii are .18 on chariots at `main.ts:600` and .23 on cannon at `main.ts:635`. Plain cylinder sides also give little visual rotation feedback.
- Human arms can be reparented into combat pivots. General torso reparenting excludes names beginning `human-leg`, so any new lower-body containers must be excluded deliberately rather than accidentally dragged into the torso pivot.

## Exact source facts behind the visual reports

### Coincident road layers

`battlefield.ts:444-447` places inset road masonry at `GROUND-.045` with height `.09`. Its top is exactly `GROUND=.54`, equal to the colored terrain roadbed. This creates competing top faces over imperial and courtyard paths. Terrain has a positive polygon offset at lines 239-241, but that does not establish exclusive ownership of all exposed top faces or overlaps between masonry instances. This is a direct coplanarity fact, not a reproduced flicker claim.

`solidRoad` places crossing top faces at `.539` on lines 367,370. Stream planks at lines 477-478 top out at `.54`; bridge paving at lines 657-660 also tops out at `.54`; ferry deck at line 605 tops out at `.539` and its planks at lines 607-608 top out at `.54`. Their clearance is only `.001`. Independent crossing approaches can overlap with each other and terrain. Several callers replace the offset cap material, for example stream decks at line 473 and bridge decks at line 651. Merely adding larger global offsets would hide the ownership problem and can draw road slabs through banks.

Suggested fix for this candidate is geometric ownership. Put decorative land masonry into the terrain vertex-color pass and remove redundant masonry top meshes. Give bridge/boat/boardwalk support caps a clear `.02-.03` recess beneath their planks while plank tops stay at `.54`. Where approach decks overlap, merge or trim the caps before instancing, and ensure visible planks do not coincide. Do not move piece roots or increase terrain to hide a cap. Check support rays at the final walkable top, including plank gaps.

### Waterfall

`battlefield.ts:272-279` constructs a static waterfall ribbon and four static pale stripes. `update` at lines 1199-1208 moves only river glints and outlet spray. Tributary glints move at lines 1210-1214, and lake ripples scale at lines 1215-1219. There is no particle or texture traveling from top to bottom along `falls`, whose path drops from y7 to y-.13 in `landscape-layout.ts:89-94`.

Therefore downward waterfall flow is absent in the current source. River, lake, tree and wind decorations are implemented, but their visibility is a fresh browser question. Tree matrices rotate by only a few hundredths of a radian at lines 1177-1187. River glints are small .4-.8 by .035 planes at lines 289-295. At an overview camera these can be below a few pixels.

Fresh baseline evidence confirms both issues. `before/inspection.json` records unchanged waterfall and whitewater vertices/transforms at two times, while pine canopy matrices change. In `before/02-waterfall.png`, captured toward the falls from camera `[12,8,12]` looking at `[5,1,0]`, the dominant close mountain and trees hide the falling face. Only small horizontal pale water patches remain visible. The correction must include a readable exposed waterfall face and an unobstructed view, not only moving white streaks on the same concealed geometry. Sample actual terrain and cascade depth along the face before raising or carving anything; do not remove road support. Give the falling face its own strip oriented across the slope with a small normal offset, then animate short streaks along it. Keep it visible from the default overview and one close inspection angle. A changed transform hidden behind rock fails the visual gate.

### Banner and camera

`styles.css:57-63` uses a content-width banner, 23px title, 35px seal and .24-second reveal. It does not create opposing metal plates or an impact stage. `battle-banner.ts:3-5` models engage/capture/check/victory but no impact event. `main.ts:1360-1367` has the authoritative one-time strike trigger suitable for adding impact feedback without guessing from a timeout.

The render loop currently only updates battlefield, controls and renderer at `main.ts:1736-1740`. Orbit controls can pan through pointer gestures, but there is no WASD handler. Keyboard navigation belongs in the camera boundary, not in chess rules or march score.

## Candidate B data shape

Caller sketch:

```ts
const locomotion = createLocomotionRig(kind, { limbs, wheels, body });
locomotion.sample({ distance: groundDistance, surface, motion, reduced });
locomotion.rest();
```

```ts
type LimbSide = 'left' | 'right';
type LimbPosition = 'front' | 'rear';
type LegChain = {
  hip: THREE.Group;
  knee: THREE.Group;
  ankle: THREE.Group;
  rest: readonly THREE.Quaternion[];
  side: LimbSide;
  position?: LimbPosition;
};
type WheelJoint = { axle: THREE.Group; radius: number; rest: THREE.Quaternion };
type LocomotionRig =
  | { kind: 'soldier' | 'advisor' | 'general'; legs: readonly [LegChain, LegChain] }
  | { kind: 'horse' | 'elephant'; legs: readonly [LegChain, LegChain, LegChain, LegChain] }
  | { kind: 'chariot' | 'cannon'; wheels: readonly WheelJoint[] };
type GaitInput = {
  distance: number;
  surface: Surface;
  motion: 'walking' | 'riding' | 'waiting' | 'idle';
  reduced: boolean;
};
type JointKey = { phase: number; hip: number; knee: number; ankle: number };
type GaitClip = {
  stride: number;
  duty: number;
  offsets: readonly number[];
  keys: readonly JointKey[];
};
```

Each leg consists of three nested pivots with meshes offset below their parent joint. A typed seven-kind clip registry describes angular keyframes, duty factor and phase offsets. Phase depends on world ground distance divided by scaled stride, never elapsed animation time. Surface multipliers shorten the step on boardwalks and mud. The body's local vertical correction can keep the stance foot just above the road, while the chess root remains at .545. Do not apply whole-body bounce independently of foot correction.

This is structurally different from an inverse-kinematics foot-trajectory rig. It is a small forward-kinematics clip player with explicit joint hierarchies and handcrafted profiles.

## Seven movement identities

| Kind | Lower-body behavior | Clip identity |
| --- | --- | --- |
| Soldier | Alternating hip, knee and ankle; visible toe-off and boot recovery. | Short brisk march, deeper knee fold on fast dirt sections. |
| General | Wider boots and longer stance duty, restrained knees. | Deliberate armoured march. |
| Advisor | Short steps, shallow hip travel, feet close to body. | Careful ceremonial pace. |
| Horse | Four articulated legs, diagonal pairs in trot; bent hocks on recovery. | Trot on roads, contained four-beat steps on bridge and boardwalk. |
| Elephant | Four broad feet, staggered quarter-cycle lifts and long stance. | Heavy amble with no airborne whole-body phase. |
| Chariot | Four spoked wheels turn by distance divided by actual scaled radius. | Continuous axle rotation and restrained chassis pitch on mud. |
| Cannon | Two large spoked wheels use their larger radius. | Slower wheel cadence, stable barrel outside attacks. |

Remove the always-visible circular platform and ring. Retain selection halo as a thin ground cue only when selected. Keep faction colour on armour and identity badges. Add boot soles and wheel spokes so movement remains legible when zoomed. Preserve route support, station centers, root scale and root height.

## Camera, atmosphere and banner

Camera input uses a `Set<PanKey>` and an update function called with frame delta. Derive horizontal forward from target minus camera, derive screen-right from its cross product with up, normalize diagonals and translate both camera and target by the same vector. Bound the target inside scene extent without modifying the relative orbit offset. Ignore input, select, textarea, button and contenteditable targets. Release on keyup, blur and hidden document. Arrow keys prevent page scrolling only while a canvas navigation session is active. Display a compact WASD/arrow hint and give the canvas a focus-visible border. Reset clears held movement.

Use a `FlowTrace` collection with a path and phase for river, tributary and waterfall highlights. The waterfall must follow the actual descending path, including its shelf segments, using fixed arc-length positions. Foam pulses only at its outlet. Give river ribbons a broad low-contrast moving highlight and a few bright narrow streaks; preserve the opaque supporting water surface. Tree movement should hinge around the trunk base, with a .04-.06 radian canopy bend maximum and coherent gust phase. Mountain mist and leaves follow the same breeze clock. Reduced motion restores all rest matrices and hides traveling traces.

Banner uses two brushed metal side plates sliding toward a central seal, a 40-48px desktop title, bronze rivets and restrained dark steel. Width is about 68% of desktop viewport capped at 900px. Height is at most 110px at top edge; mobile is about 72px high with text wrapping. The center of the board stays exposed and pointer events pass through. Engage brings plates together. The authoritative impact trigger flashes a narrow seam and 10-14 short-lived sparks, plus a 120ms two-pixel local banner jolt. Capture resolves to a quieter hold. No full-screen white flash or camera shake. Reduced motion uses a static metal plate. Metal audio should combine a short filtered noise strike with two decaying inharmonic tones; call it only at authoritative impact and respect `soundEnabled`.

## Comparison and tradeoffs

Forward-kinematic clips are simple to author and easy to see in a per-kind profile table. Existing combat pivots remain compatible. Their main weakness is foot sliding. A world-distance phase only makes the cycle advance at the right rate; it does not mathematically lock the stance foot to the road. Body-height correction can stop penetration but does not solve horizontal sliding. Curved routes also rotate planted feet with the body.

If exact planted stance is an acceptance gate, choose Candidate A's foot trajectories and two-bone IK instead. Graft B's explicit hierarchy, seven-kind duty/offset registry, actual wheel radius and reduced-motion restoration into that design. Do not build clips first and then add another correction layer if the invariant already requires IK.

Reject a full skeletal animation library and imported character assets. They add build and art complexity without solving support or rule correctness. Reject time-driven sine motion and global render-order hacks, whose symptoms match the current failures.

## Suggested implementation partitions

1. Troop construction and locomotion worker owns `main.ts` troop construction and march/stop slices plus new `scene/locomotion.ts` and meaningful gait tests. Root integrates around these exact sections.
2. Battlefield worker owns `scene/battlefield.ts` and rendering/flow tests. No change to route graph, terrain height calculation or ferry score.
3. Banner worker owns `ui/battle-banner.ts`, banner CSS and the banner DOM subtree. Root wires the single strike trigger and sound so workers do not share `main.ts`.
4. Root owns camera keyboard module and integration, native verification/capture helper, final review and documentation.

## Real browser acceptance gates

- Capture matching close front, side and oblique views before and after. Confirm lower limbs and boots are visible without a disk.
- For each kind, advance the actual native march callback through multiple stride phases. Check knee, hip, ankle or wheel changes, then rest restoration. Compare sole y against road top and root y/scale against .545/.68.
- Capture a soldier and horse on a curved road to detect skating. Record the stance-foot world displacement across multiple nearby frames; this is the key weakness of B. A still image alone cannot pass it.
- Drive a chariot over the real ferry. On waiting/riding intervals, limb transforms and wheel quaternions stop changing; footprint support rays still hit the deck.
- Orbit the overlapping road junction, stream deck, stone bridge and cliff plank at two close camera angles with all ambience disabled. Compare nearby frames for unstable material speckling. Inspect the actual geometry to ensure there are no coincident road top faces left. Support rays cover the old plank gaps.
- Sample actual waterfall particle/trace positions at successive times before wrap. Their path distance increases and total y descends. Sample actual tree instance matrices, river traces and lake rings. Ambience-off and reduced-motion runs restore/freeze them while terrain, stations, decks and boat support remain unchanged.
- Hold each WASD and arrow key in a zoomed view, then rotate the camera and repeat. Verify screen-relative direction, equal diagonal speed, camera-target offset preservation, focus guards, blur release and reset framing.
- Trigger actual captures. Verify one impact and one metal strike, broad banner bounds, no blocked picking, reset cancellation, 390px mobile fit and reduced-motion static presentation.
- Run all existing chess/road tests and production build. Report console errors, finite sampling limits and recording clock method.
