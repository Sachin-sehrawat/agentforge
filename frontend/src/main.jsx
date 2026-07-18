import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider } from './AuthContext.jsx';
import { FeatureFlagsProvider } from './FeatureFlagsContext.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <FeatureFlagsProvider>
        <App />
      </FeatureFlagsProvider>
    </AuthProvider>
  </React.StrictMode>
);
