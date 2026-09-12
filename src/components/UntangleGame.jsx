import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import IdiyappamScene from './IdiyappamScene';
import BinUI from './BinUI';
import UntangleHUD from './UntangleHUD';
import { playSuccessSound } from '../utils/sound';
import '../pages/UntanglePage.css';

/**
 * Top-level Phase 3 game component: wires the 3D scene (drag-into-bin
 * interaction, simple removed/total progress), the screen-fixed HTML bin
 * overlay, and the HUD (progress, reset, win overlay) together.
 *
 * The bin lives here rather than inside the Canvas: `binRectRef` is a
 * plain mutable ref shared between BinUI (which measures its own on-screen
 * position and keeps the ref updated) and every strand inside the 3D
 * scene (which reads it each frame to do screen-space proximity/drop
 * checks) - no per-frame React re-renders needed for that link. The two
 * imperative signals that DO need to cross from the 3D side back out to
 * the HTML bin (a strand got near it / a strand was dropped in it) are
 * bubbled up through onBinHighlightChange/onBinDeposit into small pieces
 * of state and an imperative BinUI ref here.
 */
function UntangleGame() {
  const sceneRef = useRef(null);
  const binUIRef = useRef(null);
  const binRectRef = useRef({ left: 0, top: 0, width: 0, height: 0, centerX: 0, centerY: 0 });
  const navigate = useNavigate();

  const [progress, setProgress] = useState({ count: 0, total: 0, percent: 0 });
  const [dragging, setDragging] = useState(false);
  const [binHighlighted, setBinHighlighted] = useState(false);
  const [won, setWon] = useState(false);

  const handleProgressChange = useCallback((next) => {
    setProgress(next);
    if (next.total > 0 && next.count >= next.total) {
      setWon(true);
      playSuccessSound();
    }
  }, []);

  const handleDragStateChange = useCallback((isDragging) => {
    setDragging(isDragging);
  }, []);

  const handleBinHighlightChange = useCallback((isNear) => {
    setBinHighlighted(isNear);
  }, []);

  const handleBinDeposit = useCallback(() => {
    binUIRef.current?.playDeposit();
  }, []);

  const handleReset = useCallback(() => {
    sceneRef.current?.reset();
    binUIRef.current?.reset();
    setBinHighlighted(false);
    setWon(false);
  }, []);

  const handleBackHome = useCallback(() => {
    navigate('/');
  }, [navigate]);

  return (
    <div className="untangle-page">
      <IdiyappamScene
        ref={sceneRef}
        onProgressChange={handleProgressChange}
        dragging={dragging}
        onDragStateChange={handleDragStateChange}
        binRectRef={binRectRef}
        onBinHighlightChange={handleBinHighlightChange}
        onBinDeposit={handleBinDeposit}
      />
      <BinUI ref={binUIRef} highlighted={binHighlighted} targetRectRef={binRectRef} />
      <UntangleHUD
        count={progress.count}
        total={progress.total}
        percent={progress.percent}
        won={won}
        onReset={handleReset}
        onBackHome={handleBackHome}
      />
    </div>
  );
}

export default UntangleGame;
