# Candidate A. Distance-driven feet and one support plane

## Grounding

`main.ts` owns troop meshes, piece roots, move playback, combat, Web Audio and camera controls. `landscape-layout.ts` owns legal visual route geometry and terrain height sampling. `battlefield.ts` builds and updates actual landscape meshes and ferry playback. `combat.ts` owns a typed per-kind attack rig and samples attack poses. `battle-banner.ts` owns a typed event and one cancellable display timer. The existing separation can remain.

Every piece root is placed at `BASE=.545` and has scale `.68`. Route support is at `GROUND=.54`. The visible circular base is .2 local units high. Troops are shifted so their lowest geometry rests on that circular top. Removing only the disk without changing the model offset would leave feet hovering .136 world units. The troop rest offset must move from `.2 - minY` to `-minY`, keeping the root and scale fixed. A thin ground selection ring may remain hidden until selected. Identity marks already live on the troop body.

March playback gives distance, surface and walking, waiting or riding. Gait advances only for walking distance. Its present leg motion rotates one whole cylinder around its midpoint. `Math.sin(u*pi)` suppresses the gait near a move's ends based on total path length, so short segments visibly slide. Wheels rotate by distance, but the hardcoded .2 radius differs from cannon radius .23 and vehicle construction. Restore the true rest quaternion on reset.

The river has short animated glints. Tributary currents and lake rings already move. Trees update actual instance matrices, while ground, trunks, ferry and piece support remain fixed. The cascade ribbon and long whitewater strips are entirely static. Spray is y oscillation of .06, not downward travel. Thus a moving river does not establish a moving waterfall.

Terrain color owns ordinary dirt paths, which is correct. Masonry boxes end at y=.54, exactly the heightfield road plane. Their spacing can overlap between intersecting routes. Stream-crossing tops are .539 and planks .54. Bridge paving is also .54. Shared cached materials are mutated by `solidRoad`, making polygon offset depend on color reuse. These are code-level candidates for flicker and require camera inspection, not a claimed reproduced diagnosis.

## Proposed shape

The data model is a locomotion rig with explicit limbs and wheels, plus a distance-sampled pose. Retain the combat rig as a separate owner of attack-only pivots.

```ts
type LimbRole = 'left' | 'right' | 'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight';
type Leg = {
  role: LimbRole;
  hip: THREE.Group;
  knee: THREE.Group;
  foot: THREE.Object3D;
  upper: number;
  lower: number;
  restHip: THREE.Vector3;
  soleY: number;
};
type Wheel = { node: THREE.Object3D; radius: number; rest: THREE.Quaternion };
type LocomotionRig = { kind: PieceKind; legs: Leg[]; wheels: Wheel[]; distance: number };
type MarchPoseInput = {
  distance: number;
  surface: Surface;
  motion: 'walking' | 'riding' | 'waiting' | 'idle';
  reduced: boolean;
};
function addJointedLeg(parent, geometrySpec, role): Leg;
function createLocomotionRig(kind, legs, wheels): LocomotionRig;
function applyLocomotion(rig, input): void;
function restoreLocomotion(rig): void;
```

Use a per-kind profile registry for stride in local model units, stance ratio, swing lift, leg phase offsets and knee bend direction. Divide world distance by piece scale once. During stance, a foot moves backward relative to the forward-moving body at the opposite traveled rate. During swing, interpolate from trailing to leading position with a short sine lift and smooth end tangents. Solve the sagittal hip and knee positions analytically from the target ankle, upper length and lower length. Boots have visible toes and a flat sole. Clamp reach only within the physical leg length and choose a slightly bent rest stance. Root y never bobs. Optional body lean belongs in an upper-body visual pivot, not the root or planted foot plane.

The implementation should preserve a simple group hierarchy. Each leg has hip pivot, upper mesh, knee pivot, lower mesh and boot. The torso rests at the same local height as today after removing the base. Mesh sizes stay cartoon-simple. Legs are described in one small module, not seven duplicated trigonometric branches.

## Seven kinds

| Kind | Motion | Lower-body distinction |
| --- | --- | --- |
| Soldier | Purposeful march with a stronger forward swing on plain or imperial road | Two armored thighs, bending knees, dark shins and broad boots. Left and right phases differ by half a cycle. |
| General | Deliberate armored stride | Wider planted stance, smaller knee lift and longer stance duration. Keep shoulders steady. |
| Advisor | Careful measured step | Short stride, narrow boot track and long stance. Tablet stays readable. |
| Horse | Four-beat brisk walk on narrow paths, diagonal-pair trot on open ground | Four explicit knees and hooves, fore and hind limbs bent in the appropriate directions. Rider legs remain seated and never share the mount gait. |
| Elephant | Slow heavy four-beat walk | Thick upper limbs, smaller knee fold, flat heavy feet and at least three stance feet through most of the cycle. Keep combat front foot pivot usable. |
| Chariot | Rolling march | Spoked wheels rotate by true radius, chassis sway stays outside wheel and support pivots. No invented human feet. |
| Cannon | Heavy rolling march | Wider thick wheels, true .23 radius, slower rotation than a smaller wheel at equal traveled distance. Barrel stays in its cradle. |

Narrow boardwalk and bridge reduce swing height and shorten stride. Mud raises boot clearance a little without changing root height. Ferry waiting and riding restore all legs and freeze wheels. Re-entering walking continues phase from the accumulated ground distance. Reduced motion restores the standing pose while the game still progresses.

## Geometry and depth

Give each drawn horizontal detail an explicit owner. Keep support tops at the existing .54 plane. Encode masonry into the terrain vertex color where the geometry cannot replace terrain cleanly. Alternatively subtract terrain triangles beneath a masonry footprint and leave only the masonry cap. Deduplicate inset masonry at route intersections using spatial overlap ownership. The first option is smaller and keeps support sampling untouched, at the cost of less relief at stone edges.

For water crossings keep one complete deck top and a thin visual plank pattern with a dedicated stable depth bias material. Never mutate a palette material shared with unrelated geometry. Raised boards must stay within the existing contact tolerance and retain one continuous support surface. Water foam has depthWrite=false and its own slight offset. No per-frame random depth offsets.

## Environment

Use a cascade particle or short ribbon pool following the actual `falls` polyline by arc length from high to low. Streak direction follows the local downhill tangent and crosses each drop visibly. Add a modest foam patch at the actual outlet. Time is the existing battlefield update clock, and restoration goes through the existing reduced-motion branch. Make current glints follow `riverCentre(x)` as x changes, so they cannot drift onto a bank. Add a low-amplitude reed sway using instance matrices to show ground-level breeze. Do not move mountains, roads, trunks or ferry support.

## Camera

Keep a set of held key codes. Map W and ArrowUp to ground-projected camera-forward, S and ArrowDown to back, A and ArrowLeft to camera-left, D and ArrowRight to right. Normalize diagonal input. Apply the same horizontal translation to camera.position and controls.target. Speed scales with current orbit distance in bounded units, and delta time is capped on tab return. A target bound prevents losing the scene. Ignore text inputs, selects, summaries or editable targets, meta and control modifiers. Clear on blur and visibility hidden. Give the canvas a tabindex and a short visible WASD hint. Reset clears held keys and calls existing frameCamera.

## Banner and metallic feedback

Use a wide upper-screen metal plate occupying about 55 percent of desktop canvas width, about 100 to 120 px tall. A dark bronze center, bright beveled edges, side battle pennants, a large serif title and fine rule lines replace the small rectangular toast. Red and black remain distinct by accent and copy. Put the burst on the rim and keep the middle lower field open for the fight. The entire overlay has pointer-events none.

Add a separate impact() call to the banner at the actual combat impact crossing, not when engage is displayed. It retriggers a very short edge flash, two opposing metal slashes and a few deterministic sparks. Reduced motion keeps the static broad banner and omits shake and sparks. The existing clear timer owns everything and reset removes all classes. This is distinct from capture(), which arrives after combat and reports the result.

A short metallic sound can use several inharmonic sine partials, a very short filtered noise transient and a low thud. Run it at combat impact through the existing soundEnabled gate. Avoid an extra sustained noise bed or an unrelated global audio service. Do not play a second cannon explosion simply because the banner is larger.

## Ownership and rollout

1. Root captures the baseline and owns camera integration, input tests, source integration and browser verification.
2. Troop implementer owns the troop construction sections of main.ts, locomotion module and tests. To avoid shared-file edits, prepare a patch against a recorded base, or root integrates the final main.ts hunk after the new module is finished.
3. Terrain implementer owns only battlefield.ts and rendering-specific tests or inspection output. No route rules or board constants change.
4. Banner implementer owns battle-banner.ts, banner CSS and index banner markup. Root wires impact() and sound in main.ts.
5. Fresh independent reviewer checks the whole diff and runs the actual native browser artifact.

The only new cross-file interfaces are locomotion rig calls and banner impact(). No behavior moves out of the existing legal move or route owner.

## Verification

Capture the current troop close-up with visible disk, current upper banner, waterfall close-up and a route intersection from two oblique angles. Sample actual lower-limb world poses over one stride after implementation. Require feet to rise during swing and return to the support plane, and require a stance foot to have low world displacement on straight travel. Check 2-legged, 4-legged and wheel cases independently. Check both sides so modelBaseYaw cannot invert the gait. Reset mid-move must restore joint transforms, wheels and root constraints. Verify captured combat still emits exactly one impact and no circular platform remains visible.

Run real ferry transport with the existing 9 support rays per frame. Waiting and riding have zero gait and unchanged wheels. Keep the existing Xiangqi tests, crossed soldier lateral highlight checks and route connectivity tests.

For flicker inspect fixed camera captures at varied zoom and angle, and compare still geometry under a small camera sweep with ambience frozen. A static screenshot alone cannot prove temporal flicker absent. Inspect mesh layers with ray hits near .54 and explicitly report any remaining equal-depth visible caps.

For ambience inspect actual waterfall streak positions at increasing times, including decreasing y within a drop, and actual canopy instance matrices. Toggle off, step time and require identical geometry. Test reduced motion separately. Preserve the ground, road, station and root transforms exactly.

For keyboard check all cardinal directions, diagonal length, rotated camera, input focus, held-key blur and view reset. For the banner capture desktop and 390px mobile, assert no horizontal overflow, pointer hit-through and reset cancellation. Listen to or inspect the new audio envelope without claiming recording audio from a silent GIF.

## Tradeoffs

Two-bone IK adds a small pure mathematical solver but gives predictable contact and testable foot placement. Skeletal animation imported from external assets would be heavier and would not match the simple local models. Direct sinusoidal joint angles are smaller but still slide and lose contact. Full world-space foot locking through arbitrary path turns needs more state and is unnecessary for this iteration if straight-road stance contact is reliable and corner transition is inspected. Retain root invariants and use local IK with distance sampling first.

## Principles applied

Model the Domain changed the design from scattered motionJoint flags to explicit limbs and wheel radii. Fix Root Causes changed the disk fix into both disk removal and foot rest offset correction, and changed waterfall work into actual downhill travel. Prove It Works requires world foot contacts, ferry support checks and native temporal captures, rather than treating changed matrices or a passing build as sufficient visual evidence.
