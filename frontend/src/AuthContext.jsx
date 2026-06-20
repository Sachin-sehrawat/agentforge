import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setToken, onUnauthorized } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  const clearAuth = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  // Register 401 handler once on mount so expired/revoked tokens clear auth state.
  // Handler only fires when a token was present (see api.js) — avoids redirect loops
  // when the login form itself returns 401 for wrong credentials.
  useEffect(() => {
    onUnauthorized(clearAuth);
  }, [clearAuth]);

  const login = useCallback(async (email, password) => {
    const { token, user: u } = await api.login(email, password);
    setToken(token);
    setUser(u);
    return u;
  }, []);

  const signup = useCallback(async (email, password, display_name) => {
    const { token, user: u } = await api.signup(email, password, display_name);
    setToken(token);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(() => {
    clearAuth();
  }, [clearAuth]);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: user !== null, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
