# Independent design comparison

Reviewed both candidates against the current source. This is a design review, not runtime verification. Both candidates use the inherited parent model. This result does not establish cross-family agreement.

| Criterion, 1 poor and 5 strong | A | B | Reason |
| --- | --- | --- | --- |
| Foot contact correctness | 4 | 2 | A places feet and solves the knee. B acknowledges angular clips cannot lock stance feet horizontally. Neither proves foot locking through curved turns. |
| Seven-kind readability | 5 | 5 | Both distinguish human stride, horse trot or careful walk, elephant amble and true-radius vehicle wheels. Both exclude rider legs from horse gait. |
| Small maintainable module boundary | 4 | 4 | A adds a solver but contains contact knowledge in one module. B looks smaller until body correction and sliding fixes add a second owner. |
| Z-fight geometric ownership | 4 | 3 | Both remove land masonry competition. B's suggested .02-.03 deck recess risks support gaps that exceed current .006 ray tolerance. A's dedicated visual bias still needs overlap checks. |
| Atmosphere visible flow | 4 | 5 | Both add real downhill traces. B explicitly requires the falling face to be visible through the terrain and from overview. That matters in the fresh obscured capture. |
| Banner spectacle without losing board | 4 | 5 | B's broad metal wings, seam impact and compact mobile treatment better match the user's request. Both use authoritative strike timing and keep pointer events clear. |

Choose A as the locomotion base. Foot placement is a foundational invariant. Starting with angular clips and then correcting the feet would produce two competing animation owners. Retain explicit hip, knee and ankle groups, per-kind gait profiles and true wheel radii. Remove the thick disk and update the troop rest offset together. Keep the chess root at .545 and scale .68. Check both sides because model yaw reverses their local forward direction.

Graft B's exposed-waterfall acceptance gate and broader metal banner. A changed waterfall transform behind rock is not completion. Inspect the actual falling face from a close native view and default overview. B's opposing plates should settle before the strike. The strike seam, sparks and metal transient must trigger once at the actual combat impact, not at engagement display. Reduced motion keeps a static large plate.

For terrain, use one owner per visible top face. Removing redundant land masonry geometry is preferable to merely stronger offset. Preserve the continuous walkable support cap at the existing height tolerance. Do not apply B's proposed cap recess unless support through plank gaps is independently retained and ray-tested. Isolate depth-biased visual materials from cached palette materials. Check intersecting bridge and approach meshes as well as terrain against stones.

Required implementation checks are planted-foot movement on a straight path, lift and return for each legged kind, wheel rotation by actual radius, frozen gait during ferry riding, reset restoration, and unchanged root height and scale. Curved-route stance drift remains a named risk and needs an actual march capture. A local IK solver alone cannot claim world-space foot locking through turns.

The recommendation is conditional on native browser evidence. Neither candidate is yet an implemented or visually verified result.
