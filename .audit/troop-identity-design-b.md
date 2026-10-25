# Candidate B. Avatar wardrobe plus one pose-state owner.

Recommendation. Use an exhaustive avatar specification for seven silhouettes, and a single upper-body pose compositor that chooses march or combat. Keep the existing distance-driven IK and wheel rotation. This is a larger but coherent alternative to attaching independent embellishments directly in each `createTroopModel` branch.

## Grounded integration

- `src/main.ts:361` builds the shared humanoid and gives arms only mesh names. Replace the return value with typed sockets so wardrobe builders never discover joints with `getObjectByName`.
- `src/main.ts:398` makes only one rectangular flag, and only general and chariot call it. Replace it with `buildStandard(spec, side)` returning pole-root and cloth hinge.
- `src/main.ts:433` owns seven model branches and constructs the typed combat rigs. Keep its seven structural builders but pass each an exhaustive wardrobe record. Avoid a universal animal/human/chariot builder with optional slots.
- `src/scene/locomotion.ts` already owns distance, phase, leg IK, bridge narrowing and wheel angle. Add walk/run gait profiles here. Do not add wall-time sinusoidal leg animation.
- `src/scene/combat.ts` already owns exact attack actuators and rests. Extend its ownership to all upper-body animated sockets. Its restore/apply behavior means a second march writer on the same joints will erase or compound poses.
- `src/main.ts:1399` is the natural single pose call after `applyLocomotion`. `animateCombat:1333` calls that same upper-body owner with combat state. `stopLocomotion:1287` restores neutral upper-body pose too.
- Keep `PIECE_SCALE=.68`, the current group root scale, roads, route progress, game rules and hit target unchanged.

## Caller first

```ts
const avatar = buildAvatar(piece.kind, piece.side);
applyLocomotion(avatar.locomotion, { distance, surface, motion, pace, reduced });
poseAvatar(avatar.upperBody, { state: 'march', cycle: avatar.locomotion.cycle, pace, narrow, reduced });
poseAvatar(avatar.upperBody, { state: 'attack', phase, reduced });
poseAvatar(avatar.upperBody, { state: 'idle', reduced });
```

Use one pose call per upper-body rig per frame. `poseAvatar` restores rests once, chooses state, composes a pose in memory, then writes each joint once. Combat never writes IK legs. The elephant stomp remains a parent above front-right leg IK, as it already is.

```ts
type Pace = 'walk' | 'run';
type AvatarPose =
  | { state: 'idle' | 'waiting' | 'riding'; reduced: boolean }
  | { state: 'march'; cycle: number; pace: Pace; narrow: number; reduced: boolean }
  | { state: 'attack'; phase: number; reduced: boolean };
type Avatar<K extends PieceKind> = {
  root: THREE.Group;
  locomotion: LocomotionRig;
  upperBody: AvatarRig<K>;
};
type AvatarSpec = {
  outline: 'command' | 'scholar' | 'elephant' | 'cavalry' | 'carriage' | 'artillery' | 'infantry';
  standard: { shape: FlagShape; mark: string; mount: [number, number, number] };
};
const avatarSpecs: Record<PieceKind, AvatarSpec> = /* seven required entries */;
function buildAvatar<K extends PieceKind>(kind: K, side: Side): Avatar<K>;
function poseAvatar<K extends PieceKind>(rig: AvatarRig<K>, pose: AvatarPose): void;
```

Keep existing discriminated combat actuator map. Add explicit per-kind march sockets to that map, rather than `Record<string,Object3D>` or optional universal arms. Example horse owns head, rider, lance, tail, standard. General owns torso, weapon, freeArm, head, standard. A standard cloth hinge is always present, even for cannon. Static wardrobe is attached to sockets and inherits their transform. Do not independently animate its hat, badge or tassels.

## Silhouette and standard matrix

All changes fit inside each current bounding envelope. Replace shapes rather than accumulating bulky accessories. Use the same side palette, cream faces and dark outline materials.

| Kind | Body outline and cartoon expression | Flag shape and mounting |
| --- | --- | --- |
| General | Broad inverted-trapezoid lamellar torso, square shoulder caps, three-point crown replacing cone, short moustache, stern brows. | Broad rectangular command standard with stepped lower hem, rear shoulder. |
| Advisor | Narrow robe taper, winged scholar cap replacing cylinder, wide sleeves framing tablet, tiny beard. | Tall narrow vertical banner with two squared bottom tabs, back. |
| Elephant | Low rounded body, larger fan ears replacing gold disks, short paired tusks, trunk curl, small dot eyes and brow ridge. | Rounded-bottom saddle banner with one central notch, rear saddle. |
| Horse | Long muzzle replacing spherical head, clear mane ridge, triangular ears parented to head, curved tail, saddle blanket and visibly seated rider. | Long triangular cavalry pennon, rider rear socket. |
| Chariot | Rectangular armored carriage, low pagoda roof, visible spoked wheels, front ram and slit faceplate. | Forked swallowtail rectangle, rear corner. |
| Cannon | Short stout barrel with flared muzzle and dark bore, squat wheeled cradle, two reinforcing barrel rings. | Squat square with chamfered corners, rear cradle. |
| Soldier | Rounded helmet with short crest, shorter armored tunic, large round shield, spear, friendly determined face. | Small right triangle with curved lower edge, back. |

Flags use flat `THREE.ShapeGeometry` with a visible contrasting edge and existing piece character. Seven different cut outlines remain distinguishable without reading the character. Each mount fits current maximum height and width; shrink the cloth to the available envelope for cannon/elephant instead of extending a tall pole. Avoid per-vertex cloth simulation. A cloth hinge and two-segment tail suffice.

## March/run/combat state table

| State | Human | Horse | Elephant | Wheeled | Standard |
| --- | --- | --- | --- | --- | --- |
| Walk | Opposed restrained arms, small head yaw, upright torso. | Alternating diagonal feet, head nod, rider sway, tail sweep. | Four-beat feet, small head nod and trunk curl. | Distance wheel roll, small chassis settle. | Small hinge sway from cycle. |
| Run | Longer stride, shorter stance, bent elbows and forward torso lean. | Faster-looking collected canter phases, lifted knees, rider lean and tail streaming. | Brisk four-beat stride, more trunk/ear motion without airborne leap. | Same distance roll, pitched travel posture and stronger flag streaming. | More rearward bias and larger flutter. |
| Attack | Existing typed weapon action, free arm braces, gaze faces defender. | Existing lance/rider/head action, tail held. | Existing trunk/head/stomp, ears back. | Existing ram or barrel recoil. | Distinct settle/recoil pulse derived from attack phase. |
| Wait/ferry/idle | Neutral arms and head. | Neutral head/rider. | Neutral trunk. | No wheel roll on ferry. | Small static bend or neutral. |

Walk and run must differ in stride length, stance ratio, leg lift, arm bend and torso lean. Increasing phase rate alone does not establish a run. Derive upper-body periodic motion from `rig.cycle` so pause, speed changes and ferry waits remain coherent. Keep the existing bridge narrowing dominant over run lift.

## Pace and slow viewing decision

Recommend a separate **步态** control for walk/run, beside the existing **演出速度** control. Existing `speedSelect` is explicitly presentation rate and already speeds ferries, combat and march. Using `rate >= 1.7` as pace makes slow-motion run impossible and unexpectedly changes gait mid-step when the user slows playback. Separate presentation rate from action selection.

Pace selects only gait and upper-body pose. It does not alter `march.advance(simulationDelta)`, `surfaceSpeed`, combat duration or move legality. Thus the same move has the same duration at a given presentation rate in walk/run modes. Selecting run with 0.5× presentation gives slow-view running. Explain the control as action style, not a claim of faster travel. If only one control is acceptable, automatic gait from rate is smaller but should explicitly sacrifice independent slow-run viewing.

Blend gait profile changes over ground distance, not elapsed seconds, so speed changes and waiting do not shift planted feet. No zero-distance upper-body run when the ferry waits. A continuous `runBlend` approaches 0/1 with distance; bridge narrow blend reduces it locally.

## Verification and honest limits

- Unit behavior tests should check all seven complete specs and flag outlines, finite poses at rest/impact/end, neutral restoration after attack, repeat application without cumulative drift, gait phase independence from frame partitioning, and wheel angle from distance.
- Integration checks should compare same path final position and completion time for both pace modes at a fixed presentation rate. Confirm current speed changes during a move still affect march, ferry and combat immediately.
- Browser evidence needs native legal moves with walk/run, bridge, mud and ferry, plus a native capture. Check arms/head/flags during march and return to idle after reset/cancel. Confirm no model width/height regression with computed world bounds.
- A gallery can show all seven side silhouettes and force each attack to compare visual form. It is demonstration evidence only. A forced cannon shot or off-rule horse route in that gallery does not prove native capture scheduling, legality or route handling.

Model the Domain shaped the exhaustive spec and pose-state union. Laziness Protocol keeps the existing IK, wheel and combat sampling logic and rejects a general-purpose animation graph. Split joint ownership is the main architecture risk; one writer and typed sockets directly address it.
