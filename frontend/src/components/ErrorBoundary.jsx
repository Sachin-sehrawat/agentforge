import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-icon">
            <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="24" cy="24" r="20" />
              <line x1="24" y1="14" x2="24" y2="26" />
              <circle cx="24" cy="33" r="1.5" fill="currentColor" stroke="none" />
            </svg>
          </div>
          <p className="error-boundary-message">
            {this.props.message || 'Something went wrong.'}
          </p>
          <button
            className="btn primary"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
