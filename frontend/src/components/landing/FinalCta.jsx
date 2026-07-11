import React from 'react';

export default function FinalCta({ isAuthenticated, onGetStarted, onOpenAuth }) {
  return (
    <div className="final-cta">
      <div className="final-cta__inner">
        <h2 className="final-cta__headline">Ready to design your first agent?</h2>
        <p className="final-cta__sub">Free to start. Export as many specs as you like.</p>

        <div className="final-cta__actions">
          {isAuthenticated ? (
            <button className="final-cta__btn-primary" onClick={onGetStarted}>
              Open Builder →
            </button>
          ) : (
            <>
              <button
                className="final-cta__btn-primary"
                onClick={() => onOpenAuth('signup')}
              >
                Start building free
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
