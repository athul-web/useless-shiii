import * as THREE from 'three';

/**
 * Builds a shared, irregular boundary + dome profile for one idiyappam.
 * Every strand in the same idiyappam samples these SAME functions, so the
 * whole mass reads as one coherent, organically-shaped object - an
 * irregular (but still roughly circular) outer edge, and a gentle mound
 * that's higher in the middle - rather than each strand independently
 * deciding its own outer limit.
 */
export function createSilhouetteProfile(discRadius) {
  const edgeWaves = Array.from(
    { length: 4 + Math.floor(Math.random() * 2) },
    () => ({
      freq: 1 + Math.floor(Math.random() * 4),
      amp: 0.035 + Math.random() * 0.09,
      phase: Math.random() * Math.PI * 2,
    })
  );

  // Irregular organic edge: bulges and dips per angle, shared by every
  // strand, so the silhouette is consistently uneven rather than a
  // perfect circle - but still reads as "roughly circular."
  function boundaryRadius(angle) {
    let r = discRadius;
    for (const wave of edgeWaves) {
      r += discRadius * wave.amp * Math.sin(angle * wave.freq + wave.phase);
    }
    return r;
  }

  // Gentle mound - higher in the middle, tapering toward the edge, so
  // the object reads as "thick and fluffy" rather than a flat disc.
  // Kept modest on purpose so it never overrides the idiyappam silhouette.
  const domeAmp = discRadius * (0.09 + Math.random() * 0.03);
  function domeOffset(distFromCenter) {
    const norm = Math.min(1, distFromCenter / discRadius);
    return domeAmp * (1 - norm * norm);
  }

  return { boundaryRadius, domeOffset };
}

/**
 * Weighted tangle "personality" for a single strand. Most strands are
 * moderately tangled; fewer are fully loose or pulled into a tight knot.
 * This tiering is what keeps the result "structured chaos" instead of
 * uniform random noise everywhere.
 */
const TANGLE_CLASSES = [
  { name: 'loose', weight: 0.16 },
  { name: 'moderate', weight: 0.48 },
  { name: 'heavy', weight: 0.26 },
  { name: 'knot', weight: 0.1 },
];

export function pickTangleClass() {
  const roll = Math.random();
  let acc = 0;
  for (const cls of TANGLE_CLASSES) {
    acc += cls.weight;
    if (roll <= acc) return cls.name;
  }
  return TANGLE_CLASSES[TANGLE_CLASSES.length - 1].name;
}

/**
 * Phase 3 difficulty tiers. With the old "freed by pulling far enough"
 * scoring gone, tangle class no longer gates whether a strand *can* be
 * removed - the player always removes a strand by dragging it to the bin.
 * It now only controls how visually knotted/hard-to-isolate a strand is,
 * so the first strands a player encounters are gentler and the last
 * strands are the most visually tangled.
 */
const TIER_TANGLE_CLASSES = {
  easy: [
    { name: 'loose', weight: 0.55 },
    { name: 'moderate', weight: 0.4 },
    { name: 'heavy', weight: 0.05 },
  ],
  medium: [
    { name: 'loose', weight: 0.1 },
    { name: 'moderate', weight: 0.52 },
    { name: 'heavy', weight: 0.3 },
    { name: 'knot', weight: 0.08 },
  ],
  hard: [
    { name: 'moderate', weight: 0.18 },
    { name: 'heavy', weight: 0.47 },
    { name: 'knot', weight: 0.35 },
  ],
};

export function pickTangleClassForTier(tier) {
  const classes = TIER_TANGLE_CLASSES[tier] || TANGLE_CLASSES;
  const roll = Math.random();
  let acc = 0;
  for (const cls of classes) {
    acc += cls.weight;
    if (roll <= acc) return cls.name;
  }
  return classes[classes.length - 1].name;
}

/** Average of a strand's sample points - used as its stable "home" position
 * for bin-proximity checks once it can be dragged as a rigid whole. */
export function computeCentroid(points) {
  const centroid = new THREE.Vector3();
  for (const p of points) centroid.add(p);
  if (points.length) centroid.divideScalar(points.length);
  return centroid;
}

const TANGLE_PRESETS = {
  loose: {
    knotRange: [0, 1],
    turns: [0.5, 0.9],
    tightness: [0.15, 0.28],
    wander: [0.15, 0.3],
  },
  moderate: {
    knotRange: [1, 2],
    turns: [0.9, 1.4],
    tightness: [0.3, 0.45],
    wander: [0.3, 0.5],
  },
  heavy: {
    knotRange: [2, 3],
    turns: [1.3, 1.9],
    tightness: [0.45, 0.6],
    wander: [0.4, 0.6],
  },
  knot: {
    knotRange: [1, 2],
    turns: [1.9, 2.7],
    tightness: [0.6, 0.8],
    wander: [0.35, 0.55],
  },
};

function randRange([min, max]) {
  return min + Math.random() * (max - min);
}

/**
 * Generates the sample points for a single, severely tangled idiyappam
 * strand.
 *
 * Each strand is a steered random walk with a tangle "personality"
 * (loose / moderate / heavy / knot) controlling how many knot bursts it
 * gets and how tight they are. Inside a knot burst, the heading's spin
 * rate AND inward pull both wobble on a second frequency, so a knot reads
 * as a small cluster of uneven, overlapping loops - not a clean
 * mathematical spiral. Height follows the shared dome profile plus a
 * light spring-damped walk, so strands ride genuinely above/below their
 * neighbours without the whole mass losing its idiyappam silhouette.
 */
export function generateStrandPoints({
  discRadius = 1.6,
  baseHeight = 0,
  segments = 150,
  boundaryRadius = () => discRadius,
  domeOffset = () => 0,
  tangleClass = 'moderate',
} = {}) {
  const preset = TANGLE_PRESETS[tangleClass] || TANGLE_PRESETS.moderate;
  const points = [];

  let angle = Math.random() * Math.PI * 2;
  let radius = discRadius * (0.06 + Math.random() * 0.58);
  let x = Math.cos(angle) * radius;
  let z = Math.sin(angle) * radius;
  let y = baseHeight + (Math.random() - 0.5) * 0.01;

  let heading = Math.random() * Math.PI * 2;

  const driftFreq1 = 1.2 + Math.random() * 2;
  const driftFreq2 = 3.5 + Math.random() * 4;
  const driftAmp = randRange(preset.wander);
  const phase = Math.random() * Math.PI * 2;

  const baseStep = discRadius * (0.016 + Math.random() * 0.008);

  const [knotMin, knotMax] = preset.knotRange;
  const knotCount =
    knotMin + Math.floor(Math.random() * (knotMax - knotMin + 1));
  const knots = [];
  for (let k = 0; k < knotCount; k += 1) {
    knots.push({
      center: 0.14 + Math.random() * 0.72,
      width: 0.05 + Math.random() * 0.055,
      turns: randRange(preset.turns),
      tightness: randRange(preset.tightness),
      spin: Math.random() > 0.5 ? 1 : -1,
      liftY: (Math.random() - 0.5) * 0.045,
      // gives the loop uneven, cluster-like size variation instead of a
      // single clean coil radius
      wobbleFreq: 2.5 + Math.random() * 2.5,
    });
  }
  knots.sort((a, b) => a.center - b.center);

  const hasLooseEnd = Math.random() < (tangleClass === 'loose' ? 0.55 : 0.22);

  let yVelocity = 0;

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;

    heading +=
      (Math.sin(t * driftFreq1 * Math.PI * 2 + phase) * driftAmp +
        Math.cos(t * driftFreq2 * Math.PI * 2 + phase * 1.7) * driftAmp * 0.5) *
      0.055;

    let knotPull = 0;
    let knotLift = 0;
    for (const knot of knots) {
      const dt = (t - knot.center) / knot.width;
      if (Math.abs(dt) < 1) {
        const envelope = Math.cos((dt * Math.PI) / 2) ** 2;
        // secondary wobble on spin rate + pull -> uneven, cluster-like
        // loops instead of one clean spiral
        const wobble = Math.sin(dt * Math.PI * knot.wobbleFreq);
        const turnRateMod = 1 + wobble * 0.4;
        heading +=
          (knot.spin * knot.turns * Math.PI * 2 * 1.6 * envelope * turnRateMod) /
          (knot.width * segments);
        knotPull += envelope * knot.tightness * (0.75 + 0.25 * wobble);
        knotLift +=
          envelope * knot.liftY * Math.sin(dt * Math.PI * knot.wobbleFreq * 0.6);
      }
    }

    const step = baseStep * Math.max(0.18, 1 - knotPull * 0.65);

    x += Math.cos(heading) * step;
    z += Math.sin(heading) * step;

    const angleToPoint = Math.atan2(z, x);
    const dist = Math.sqrt(x * x + z * z);
    const limit =
      boundaryRadius(angleToPoint) * (hasLooseEnd && t > 0.85 ? 1.12 : 0.97);
    if (dist > limit) {
      const inwardAngle = Math.atan2(-z, -x);
      let diff = inwardAngle - heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      heading += diff * 0.16;
    }

    // height eases toward the shared dome profile for this radius, plus a
    // light damped random walk and a lift while passing through a knot
    const targetY = baseHeight + domeOffset(dist);
    yVelocity += (Math.random() - 0.5) * 0.0022;
    yVelocity -= (y - targetY) * 0.03;
    yVelocity *= 0.88;
    y += yVelocity + knotLift * 0.5;

    const jitter = 0.0035;
    points.push(
      new THREE.Vector3(
        x + (Math.random() - 0.5) * jitter,
        y + (Math.random() - 0.5) * jitter,
        z + (Math.random() - 0.5) * jitter
      )
    );
  }

  return points;
}

/**
 * Builds a smooth Catmull-Rom curve from procedurally generated strand
 * points, ready to be fed into a TubeGeometry.
 */
export function generateStrandCurve(options) {
  const points = generateStrandPoints(options);
  return new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.45);
}
