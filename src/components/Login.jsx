import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, User, Key, Loader2, ShieldCheck, Shield } from 'lucide-react';
import { motion } from 'framer-motion';

const Login = () => {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();


  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(formData.username.trim(), formData.password);
      navigate('/');
    } catch (err) {
      console.error("Login error:", err);
      const msg = err.response?.data?.detail || err.message || 'Login failed. Please check your connection.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <motion.div 
        className="glass-card"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ display: 'inline-flex', marginBottom: '1.5rem' }}>
            <img src="/logo.png" alt="WhisperBox" style={{ width: '80px', height: '80px', borderRadius: '16px', boxShadow: 'var(--shadow-md)' }} />
          </div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: '300', marginBottom: '0.5rem' }}>WhisperBox Login</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Enter your credentials to unlock your secure session</p>
        </div>

        {error && (
          <div style={{ background: 'rgba(241, 92, 109, 0.1)', color: 'var(--error)', padding: '0.85rem', borderRadius: '4px', marginBottom: '1.5rem', fontSize: '0.85rem', border: '1px solid rgba(241, 92, 109, 0.2)' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label>Username</label>
            <input 
              type="text" 
              placeholder="e.g. john_doe"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
            />
          </div>

          <div className="input-group">
            <label>Password</label>
            <input 
              type="password" 
              placeholder="Your secure password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: '1rem' }}>
            {loading ? <Loader2 className="animate-spin" /> : 'Continue to Chat'}
          </button>
        </form>

        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
            Don't have an account? <Link to="/register" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: '600' }}>Register Now</Link>
          </p>
        </div>

        <div style={{ marginTop: '2.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--text-dim)', fontSize: '0.75rem' }}>
          <Lock size={12} /> End-to-end encrypted
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
