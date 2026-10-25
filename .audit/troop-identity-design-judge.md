# Independent identity design judgment

Choose A's focused identity module and retain the current seven construction branches. Add B's separate pace control and a single typed owner for upper-body march and combat transforms. This is a design judgment from the two proposals and the local plan. I did not inspect application source or rendered output, so the scores assess proposed safeguards rather than verified behavior. This review inherits the parent model and is not a diverse-model panel.

Scores use five as best.

| Criterion | A | B | Proposed combined design |
| --- | --- | --- | --- |
| Contact safety | 4 | 4 | 4 |
| Silhouette readability | 3 | 4 | 4 |
| Maintainable ownership | 3 | 4 | 5 |
| Independent slow-run viewing | 1 | 5 | 5 |
| Small scope | 4 | 2 | 4 |

A has the smaller useful boundary. Its details module owns geometry and cloth without replacing existing troop construction or the IK solver. B's typed pose state resolves the consequential ownership problem. A's promise to restore march transforms before combat remains a lifecycle obligation spread across callers. One upper-body writer makes that handoff explicit. Keep the existing combat actuator map and sample logic. A new general avatar factory or complete wardrobe schema does not earn its migration cost for this task.

The separate pace select is necessary for independent slow-run viewing. A ties run to presentation rate and changes ferry and combat timing when the viewer asks for a different gait. B preserves presentation speed as the time control. At fixed presentation speed, both pace settings should retain identical route progression and completion time. The UI should describe pace as movement style, because it does not change travel speed.

Three issues need explicit implementation decisions before the design is safe.

1. A cycle-boundary profile switch can still teleport a planted foot if the new stride length changes the distance-to-phase mapping. B's continuous runBlend can also slide a planted foot if it changes a live stance target. Preserve accumulated cycle independently of the current stride divisor and latch stance targets until release. Prove the transition with observed foot position across consecutive samples. A minimum-Y assertion alone cannot detect sliding.
2. One writer must cover every transform both march and combat touch. A march helper must not restore a shared torso after combat writes it. Choose the active upper-body pose once per frame, restore its recorded rests once, then apply that pose. Cloth should deform its own vertices or dedicated hinge only. Keep upper-body lean above the leg parents, and preserve the elephant's strike-parent hierarchy.
3. Both proposals make flag distinctions more ambitious than their board-view evidence. A's triangular horse, cannon and soldier standards may converge at thumbnail size. B has clearer body-outline differences, but still needs captures. Prioritize crown, cap, ears, muzzle, carriage and barrel outlines over rivets and cuffs. Check seven monochrome silhouettes and seven flag outlines at the actual board camera before adding small detail. Glyph visibility must pass from the gameplay camera as well as the inspection camera.

The existing envelope is a constraint on every animated pose, not only the measured rest pose. Test maximum flag deformation, run lean, weapon motion and combat impact. New decoration must not become the model's lowest point and alter root normalization. Preserve root .545, scale .68, roads and rules. A cannon or advisor flag that cannot fit visibly should shrink with its pole. Do not enlarge or rescale the whole model.

The smallest satisfactory verification set is native walk and run at the same presentation rate, slow-motion run, a mid-stance pace change, bridge and boardwalk travel, ferry waiting and riding, combat followed by restored rest, reset, and reduced motion. Include all seven kinds and both faction colors. Verify native legal moves separately from a forced showcase. Retain the existing wheel distance/radius invariant. Require no new animation loop.

Laziness Protocol shaped the decision to keep current builders and reject the whole wardrobe migration. Model the Domain shaped the separate pace value and the single discriminated upper-body pose state. I read both principle leaf skills and the poteto-mode and unslop skills during this review. No repository files changed.
