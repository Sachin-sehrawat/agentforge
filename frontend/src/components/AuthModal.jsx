import React, { useState } from 'react';
import { useAuth } from '../AuthContext.jsx';

export default function AuthModal({ initialTab = 'login', onClose, onSuccess }) {
  const { login, signup } = useAuth();
  const [tab, setTab] = useState(initialTab);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function validate() {
    if (!email.trim()) return 'Email is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address.';
    if (!password) return 'Password is required.';
    if (tab === 'signup') {
      if (password.length < 8) return 'Password must be at least 8 characters.';
      if (!displayName.trim()) return 'Display name is required.';
    }
    return '';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      if (tab === 'login') {
        await login(email.trim(), password);
      } else {
        await signup(email.trim(), password, displayName.trim());
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function switchTab(next) {
    setTab(next);
    setError('');
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose();
  }

  const isLogin = tab === 'login';

  return (
    <div className="modal-backdrop" onMouseDown={handleBackdrop}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <div className="modal-header">
          <h2 className="modal-title" id="auth-title">
            {isLogin ? 'Sign in' : 'Create account'}
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab${isLogin ? ' active' : ''}`}
            onClick={() => switchTab('login')}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`auth-tab${!isLogin ? ' active' : ''}`}
            onClick={() => switchTab('signup')}
          >
            Sign up
          </button>
        </div>

        <form className="modal-body" onSubmit={handleSubmit} noValidate>
          {!isLogin && (
            <div className="field-group">
              <label className="field-label" htmlFor="auth-name">Display name</label>
              <input
                id="auth-name"
                className="field-input"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
                disabled={submitting}
              />
            </div>
          )}

          <div className="field-group">
            <label className="field-label" htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              className="field-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              disabled={submitting}
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              className="field-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={!isLogin ? 'At least 8 characters' : ''}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              disabled={submitting}
            />
          </div>

          {error && (
            <p className="auth-error" role="alert">{error}</p>
          )}

          <div className="modal-footer">
            <button type="button" className="btn" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={submitting}>
              {submitting
                ? (isLogin ? 'Signing in…' : 'Creating account…')
                : (isLogin ? 'Sign in' : 'Create account')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
