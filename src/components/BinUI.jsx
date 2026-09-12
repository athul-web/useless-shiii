import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import './BinUI.css';

const LID_CLOSE_DELAY_MS = 1100; // how long the lid stays open after a deposit
let particleUid = 0;

/**
 * The disposal bin as a screen-fixed HTML/CSS overlay - a sibling of the
 * R3F <Canvas>, not a 3D object, so it never moves with camera
 * rotation/zoom or the idiyappam underneath it.
 *
 * It's purely presentational + imperative: the 3D side (InteractiveStrand)
 * projects each strand's world position to screen pixels every drag frame
 * and compares that against `targetRectRef` (this component's measured
 * bounding box, kept fresh via ResizeObserver) to decide "near"/"dropped".
 * This component itself only reacts to the `highlighted` prop plus the
 * imperative `playDeposit()` / `reset()` calls exposed via ref - it has no
 * idea a strand exists.
 */
const BinUI = forwardRef(function BinUI({ highlighted = false, targetRectRef }, ref) {
  const bodyElRef = useRef(null);
  const closeTimerRef = useRef(null);

  const [forceOpen, setForceOpen] = useState(false);
  const [bounceNonce, setBounceNonce] = useState(0);
  const [particles, setParticles] = useState([]);

  useImperativeHandle(ref, () => ({
    playDeposit() {
      setForceOpen(true);
      setBounceNonce((n) => n + 1);
      setParticles(
        Array.from({ length: 7 }, () => {
          const angle = Math.random() * Math.PI * 2;
          const dist = 20 + Math.random() * 26;
          return {
            id: particleUid++,
            dx: Math.cos(angle) * dist,
            dy: Math.sin(angle) * dist - 14,
          };
        })
      );

      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = setTimeout(() => setForceOpen(false), LID_CLOSE_DELAY_MS);
    },
    reset() {
      clearTimeout(closeTimerRef.current);
      setForceOpen(false);
      setBounceNonce(0);
      setParticles([]);
    },
  }));

  useEffect(() => () => clearTimeout(closeTimerRef.current), []);

  // Keep targetRectRef fresh so the 3D side always knows exactly where
  // this element sits on screen, regardless of resize/orientation change.
  useEffect(() => {
    if (!bodyElRef.current || !targetRectRef) return undefined;

    const update = () => {
      const rect = bodyElRef.current.getBoundingClientRect();
      targetRectRef.current = {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
      };
    };

    update();

    const ro = new ResizeObserver(update);
    ro.observe(bodyElRef.current);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [targetRectRef]);

  const lidOpen = highlighted || forceOpen;

  return (
    <div className="bin-ui" aria-hidden="true">
      <div className={`bin-ui__glow${lidOpen ? ' bin-ui__glow--active' : ''}`} />
      <div key={bounceNonce} className={`bin-ui__wrap${bounceNonce ? ' bin-ui__wrap--bounce' : ''}`}>
        <div className={`bin-ui__lid${lidOpen ? ' bin-ui__lid--open' : ''}`}>
          <div className="bin-ui__lid-knob" />
        </div>
        <div ref={bodyElRef} className="bin-ui__body">
          <div className="bin-ui__band" />
        </div>
      </div>
      <div className="bin-ui__particles">
        {particles.map((p) => (
          <span
            key={p.id}
            className="bin-ui__particle"
            style={{ '--dx': `${p.dx}px`, '--dy': `${p.dy}px` }}
            onAnimationEnd={() => {
              setParticles((cur) => cur.filter((particle) => particle.id !== p.id));
            }}
          />
        ))}
      </div>
      <div className="bin-ui__label">Bin</div>
    </div>
  );
});

export default BinUI;
