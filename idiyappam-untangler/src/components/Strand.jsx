import { useMemo } from 'react';
import * as THREE from 'three';
import { generateStrandCurve } from './strandUtils';

/**
 * Renders a single rice-noodle strand as a thin tube following a
 * procedurally generated, tangled curve.
 */
function Strand({
  discRadius,
  baseHeight,
  colorVariant,
  tangleClass,
  boundaryRadius,
  domeOffset,
}) {
  const geometry = useMemo(() => {
    const segments = 150;
    const curve = generateStrandCurve({
      discRadius,
      baseHeight,
      segments,
      boundaryRadius,
      domeOffset,
      tangleClass,
    });
    // Radius is intentionally left as-is (no per-length variation yet) -
    // geometry/silhouette work takes priority for now.
    const radius = 0.011 + Math.random() * 0.007;
    // Higher tubular segment count so tight knot loops sample enough
    // points to read as smooth curves rather than faceted kinks.
    return new THREE.TubeGeometry(curve, 170, radius, 6, false);
  }, [discRadius, baseHeight, tangleClass, boundaryRadius, domeOffset]);

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial
        color={colorVariant}
        roughness={0.62}
        metalness={0}
        emissive="#3d2e1a"
        emissiveIntensity={0.045}
      />
    </mesh>
  );
}

export default Strand;
