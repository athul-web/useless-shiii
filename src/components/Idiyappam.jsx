import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import InteractiveStrand from './InteractiveStrand';
import {
  createSilhouetteProfile,
  generateStrandPoints,
  pickTangleClassForTier,
} from './strandUtils';

const DISC_RADIUS = 1.6;

// ~35 strands total (5 layers x 7 strands/layer) - down from the old
// 143 (11 x 13) - tunable here if you want to go up/down from 35.
const LAYERS = 5;
const STRANDS_PER_LAYER = 7;
const LAYER_HEIGHT_STEP = 0.07;

// Difficulty tiers, applied in generation order: first EASY_COUNT
// strands are gentler, next MEDIUM_COUNT are moderately tangled, the
// rest are the hardest/knottiest. 8 / 15 / 12 out of 35 total.
const EASY_COUNT = 8;
const MEDIUM_COUNT = 15;

// The bin is now a screen-space HTML overlay (see BinUI.jsx), so
// proximity/suction detection compares screen pixels, not 3D distance.
// This is the single invisible "magnetic" catch radius around the bin's
// on-screen center - moderately larger than the visible bin, not huge.
// Once a dragged strand's middle comes within this radius it's caught
// and auto-flies into the bin; InteractiveStrand scales it down a bit
// further on narrow viewports. Tune here if it feels too easy/hard.
const BIN_SUCTION_RADIUS_PX = 100;

// A small palette of warm ivory / cooked-rice-flour tones (within
// #F5EBDD - #FFF8EA) so the strands aren't a flat, uniform color - real
// steamed rice noodles have subtle tonal variation.
const COLOR_PALETTE = ['#F7EEE0', '#FAF3E4', '#FFF8EA', '#F5EBDD', '#FCF1E2'];

function randomColor() {
  return COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
}

function tierForIndex(index) {
  if (index < EASY_COUNT) return 'easy';
  if (index < EASY_COUNT + MEDIUM_COUNT) return 'medium';
  return 'hard';
}

/**
 * The idiyappam itself: many thin strands stacked in loose layers to build
 * up a dense, tangled disc of rice noodles.
 *
 * Same silhouette/dome/color approach as before, just fewer strands
 * (~35) grouped into easy/medium/hard difficulty tiers. This component
 * owns the small bits of game state the puzzle needs - which strand is
 * selected, how many have been disposed of - and reports simple
 * count-based progress to the parent via onProgressChange, plus an
 * imperative reset()/deselect() API.
 *
 * The disposal bin itself lives OUTSIDE this 3D tree entirely (it's a
 * screen-fixed HTML overlay - see BinUI.jsx, rendered by UntangleGame).
 * This component just forwards the shared `binRectRef` (the bin's
 * on-screen bounding box, kept live by BinUI) down to every strand, and
 * bubbles each strand's near/dropped signals back up to the parent so it
 * can drive that HTML bin's highlight + deposit animation.
 */
const Idiyappam = forwardRef(function Idiyappam(
  { onProgressChange, onDragStateChange, binRectRef, onBinHighlightChange, onBinDeposit },
  ref
) {
  const { boundaryRadius, domeOffset } = useMemo(
    () => createSilhouetteProfile(DISC_RADIUS),
    []
  );

  // Generated exactly once per mount, so Reset never produces a
  // different random idiyappam - only per-strand drag offsets change.
  const strands = useMemo(() => {
    const list = [];
    const totalHeight = LAYERS * LAYER_HEIGHT_STEP;
    let index = 0;

    for (let layer = 0; layer < LAYERS; layer += 1) {
      const baseHeight = layer * LAYER_HEIGHT_STEP - totalHeight / 2;

      for (let i = 0; i < STRANDS_PER_LAYER; i += 1) {
        const tier = tierForIndex(index);
        const tangleClass = pickTangleClassForTier(tier);
        const strandBaseHeight = baseHeight + (Math.random() - 0.5) * 0.012;
        const points = generateStrandPoints({
          discRadius: DISC_RADIUS,
          baseHeight: strandBaseHeight,
          segments: 170,
          boundaryRadius,
          domeOffset,
          tangleClass,
        });

        list.push({
          key: `${layer}-${i}`,
          color: randomColor(),
          tangleClass,
          tier,
          points,
        });
        index += 1;
      }
    }

    return list;
  }, [boundaryRadius, domeOffset]);

  const [selectedId, setSelectedId] = useState(null);
  const strandRefs = useRef({});
  const refSetters = useRef({});
  const disposedSetRef = useRef(new Set());

  const getRefSetter = useCallback((id) => {
    if (!refSetters.current[id]) {
      refSetters.current[id] = (el) => {
        if (el) strandRefs.current[id] = el;
        else delete strandRefs.current[id];
      };
    }
    return refSetters.current[id];
  }, []);

  const handleSelect = useCallback((id) => {
    setSelectedId(id);
  }, []);

  const handleNearBinChange = useCallback(
    (isNear) => {
      onBinHighlightChange?.(isNear);
    },
    [onBinHighlightChange]
  );

  const handleDropped = useCallback(() => {
    // Fires the moment a strand is confirmed dropped in the bin - kicks
    // off the HTML bin's lid/bounce/particle animation right away, in
    // step with the strand's own fly-into-bin animation.
    onBinDeposit?.();
  }, [onBinDeposit]);

  const handleDisposed = useCallback(
    (id) => {
      // Fires once the strand's fly-into-bin animation actually finishes
      // - NOT at release time - so progress only updates once the strand
      // has visibly reached the bin.
      if (disposedSetRef.current.has(id)) return;
      disposedSetRef.current.add(id);
      const count = disposedSetRef.current.size;
      const total = strands.length;
      const percent = total > 0 ? Math.round((count / total) * 100) : 0;
      onProgressChange?.({ count, total, percent });
    },
    [strands.length, onProgressChange]
  );

  // Report the initial 0/total state as soon as the idiyappam mounts.
  useEffect(() => {
    onProgressChange?.({ count: 0, total: strands.length, percent: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      reset() {
        disposedSetRef.current.clear();
        setSelectedId(null);
        Object.values(strandRefs.current).forEach((strandRef) => strandRef?.reset());
        onProgressChange?.({ count: 0, total: strands.length, percent: 0 });
      },
      deselect() {
        setSelectedId(null);
      },
    }),
    [onProgressChange, strands.length]
  );

  return (
    <group rotation={[0, 0, 0]}>
      {strands.map((strand) => (
        <InteractiveStrand
          key={strand.key}
          id={strand.key}
          ref={getRefSetter(strand.key)}
          basePoints={strand.points}
          colorVariant={strand.color}
          isSelected={selectedId === strand.key}
          onSelect={handleSelect}
          onDisposed={handleDisposed}
          onDropped={handleDropped}
          onDragStateChange={onDragStateChange}
          onNearBinChange={handleNearBinChange}
          binRectRef={binRectRef}
          binSuctionRadiusPx={BIN_SUCTION_RADIUS_PX}
        />
      ))}
    </group>
  );
});

export default Idiyappam;

export { DISC_RADIUS };
