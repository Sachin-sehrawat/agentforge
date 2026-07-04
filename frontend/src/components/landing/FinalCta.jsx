import React from 'react';

export default function FinalCta({ isAuthenticated, onGetStarted, onOpenAuth }) {
  return (
    <div className="final-cta">
      <div className="final-cta__orb final-cta__orb--indigo" />
      <div className="final-cta__orb final-cta__orb--violet" />

      <div className="final-cta__inner">
        <h2 className="final-cta__headline">Ready to build your first agent?</h2>

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
                Sign up free
              </button>
              <button
                className="final-cta__btn-ghost"
                onClick={() => onOpenAuth('login')}
              >
                Log in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
