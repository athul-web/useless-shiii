import { useMemo } from 'react';
import Strand from './Strand';
import { createSilhouetteProfile, pickTangleClass } from './strandUtils';

const DISC_RADIUS = 1.6;
const LAYERS = 11;
const STRANDS_PER_LAYER = 13;
const LAYER_HEIGHT_STEP = 0.038;

// A small palette of off-white / cream tones so the strands aren't a flat,
// uniform color - real steamed rice noodles have subtle tonal variation.
const COLOR_PALETTE = ['#f7f2e6', '#f5efe0', '#faf6ec', '#f1ebd8', '#f8f3e8'];

function randomColor() {
  return COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
}

/**
 * The idiyappam itself: many thin strands stacked in loose layers to build
 * up a dense, tangled disc of rice noodles.
 *
 * All strands share one silhouette profile (irregular outer boundary +
 * gentle dome) so the mass reads as a single coherent, organically-shaped
 * idiyappam. Each strand is independently assigned a tangle "personality"
 * (loose / moderate / heavy / knot) so the tangling is structured rather
 * than uniformly random everywhere.
 */
function Idiyappam() {
  const { boundaryRadius, domeOffset } = useMemo(
    () => createSilhouetteProfile(DISC_RADIUS),
    []
  );

  const strands = useMemo(() => {
    const list = [];
    const totalHeight = LAYERS * LAYER_HEIGHT_STEP;

    for (let layer = 0; layer < LAYERS; layer += 1) {
      const baseHeight = layer * LAYER_HEIGHT_STEP - totalHeight / 2;

      for (let i = 0; i < STRANDS_PER_LAYER; i += 1) {
        list.push({
          key: `${layer}-${i}`,
          baseHeight: baseHeight + (Math.random() - 0.5) * 0.01,
          color: randomColor(),
          tangleClass: pickTangleClass(),
        });
      }
    }
    return list;
  }, []);

  return (
    <group rotation={[0, 0, 0]}>
      {strands.map((strand) => (
        <Strand
          key={strand.key}
          discRadius={DISC_RADIUS}
          baseHeight={strand.baseHeight}
          colorVariant={strand.color}
          tangleClass={strand.tangleClass}
          boundaryRadius={boundaryRadius}
          domeOffset={domeOffset}
        />
      ))}
    </group>
  );
}

export default Idiyappam;

export { DISC_RADIUS };
