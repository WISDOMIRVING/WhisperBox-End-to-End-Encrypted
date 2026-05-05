import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../utils/api';
import * as crypto from '../utils/crypto';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [privateKey, setPrivateKey] = useState(null);
  const [loading, setLoading] = useState(true);

  // Initialize session on mount
  useEffect(() => {
    const initSession = async () => {
      const token = localStorage.getItem('access_token');
      if (token) {
        try {
          const res = await authAPI.getMe();
          setUser(res.data);
          // Note: We can't automatically unwrap the private key because we don't have the password.
          // The user must log in each time to unwrap the key into memory.
          // However, if the user refreshes the page, we might need them to re-enter a "session password" 
          // or we can store the unwrapped key in a secure session storage (though less secure).
          // For this app, we'll require login to get the private key into memory.
        } catch (err) {
          console.error("Session init failed", err);
          logout();
        }
      }
      setLoading(false);
    };
    initSession();
  }, []);

  const login = async (username, password) => {
    const res = await authAPI.login({ username, password });
    const { access_token, refresh_token, user: userData } = res.data;
    
    localStorage.setItem('access_token', access_token);
    localStorage.setItem('refresh_token', refresh_token);
    
    // Unwrap the private key immediately after login
    const saltBuffer = crypto.base64ToBuffer(userData.pbkdf2_salt);
    const wrappingKey = await crypto.deriveWrappingKey(password, saltBuffer);
    const unwrappedKey = await crypto.unwrapPrivateKey(userData.wrapped_private_key, wrappingKey);
    
    setPrivateKey(unwrappedKey);
    setUser(userData);
    return res.data;
  };

  const register = async (username, displayName, password) => {
    // 1. Generate RSA Keypair
    const keyPair = await crypto.generateRSAKeyPair();
    
    // 2. Generate Salt
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const saltBase64 = crypto.bufferToBase64(salt);
    
    // 3. Derive Wrapping Key
    const wrappingKey = await crypto.deriveWrappingKey(password, salt);
    
    // 4. Wrap Private Key
    const wrappedPrivateKey = await crypto.wrapPrivateKey(keyPair.privateKey, wrappingKey);
    
    // 5. Export Public Key
    const publicKeyBase64 = await crypto.exportPublicKey(keyPair.publicKey);
    
    // 6. Send to server
    const res = await authAPI.register({
      username,
      display_name: displayName,
      password,
      public_key: publicKeyBase64,
      wrapped_private_key: wrappedPrivateKey,
      pbkdf2_salt: saltBase64
    });

    const { access_token, refresh_token, user: userData } = res.data;
    localStorage.setItem('access_token', access_token);
    localStorage.setItem('refresh_token', refresh_token);
    
    setPrivateKey(keyPair.privateKey);
    setUser(userData);
    return res.data;
  };

  const logout = async () => {
    const refreshToken = localStorage.getItem('refresh_token');
    if (refreshToken) {
      try {
        await authAPI.logout(refreshToken);
      } catch (err) {
        console.error("Logout API failed", err);
      }
    }
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setUser(null);
    setPrivateKey(null);
  };

  return (
    <AuthContext.Provider value={{ user, privateKey, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
