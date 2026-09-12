import { useEffect, useRef, useState } from 'react';

/**
 * Presentational game HUD for the Untangle page: top title/progress,
 * bottom Reset button, and a win overlay when the puzzle is solved. Pure
 * layout/markup - all game state lives in UntangleGame.
 *
 * Progress is now simple count-based (removed strands / total strands)
 * instead of the old tangle-weight percentage. The progress label gets a
 * brief pulse animation whenever `count` increases, i.e. whenever a
 * strand is successfully deposited in the bin.
 */
function UntangleHUD({ count, total, percent, won, onReset, onBackHome }) {
  const [pulse, setPulse] = useState(false);
  const prevCount = useRef(count);

  useEffect(() => {
    if (count !== prevCount.current) {
      prevCount.current = count;
      setPulse(true);
      const timer = setTimeout(() => setPulse(false), 260);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [count]);

  return (
    <>
      <div className="untangle-hud">
        <div className="untangle-hud__top">
          <h1 className="untangle-hud__title">Strands Untangler</h1>
          <p className="untangle-hud__subtitle">Untangling</p>
          <div className="untangle-hud__progress-row">
            <span
              className={
                'untangle-hud__progress-label' +
                (pulse ? ' untangle-hud__progress-label--pulse' : '')
              }
            >
              {count} / {total} strands &middot; {percent}%
            </span>
            <div className="untangle-hud__progress-track">
              <div
                className="untangle-hud__progress-fill"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        </div>

        <div className="untangle-hud__bottom">
          <button type="button" className="untangle-hud__reset-button" onClick={onReset}>
            Reset Game
          </button>
        </div>
      </div>

      {won && (
        <div className="untangle-win-overlay">
          <div className="untangle-win-card">
            <p className="untangle-win-emoji">🎉</p>
            <h2 className="untangle-win-title">Untangled!</h2>
            <p className="untangle-win-subtitle">
              {total} / {total} strands cleared
            </p>
            <div className="untangle-win-actions">
              <button
                type="button"
                className="untangle-win-button untangle-win-button--primary"
                onClick={onReset}
              >
                Play Again
              </button>
              <button type="button" className="untangle-win-button" onClick={onBackHome}>
                Back to Home
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default UntangleHUD;
