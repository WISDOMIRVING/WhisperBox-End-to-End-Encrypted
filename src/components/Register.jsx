import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Lock, User, Key, Loader2, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';

const Register = () => {
  const [formData, setFormData] = useState({
    username: '',
    displayName: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { register } = useAuth();
  const navigate = useNavigate();


  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await register(formData.username.trim(), formData.displayName.trim(), formData.password);
      navigate('/');
    } catch (err) {
      console.error("Registration error:", err);
      let msg = err.response?.data?.detail || err.message || 'Registration failed.';
      
      if (err.response?.status === 422 || msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('taken')) {
        msg = (
          <span>
            This username is already taken. Did you mean to <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 'bold' }}>Log In</Link>?
          </span>
        );
      }
      
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <motion.div 
        className="glass-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ display: 'inline-flex', marginBottom: '1.5rem' }}>
            <img src="/logo.png" alt="WhisperBox" style={{ width: '80px', height: '80px', borderRadius: '16px', boxShadow: 'var(--shadow-md)' }} />
          </div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: '300', marginBottom: '0.5rem' }}>Create Account</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Join WhisperBox for secure E2EE messaging</p>
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
              placeholder="e.g. alice_92"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
            />
          </div>

          <div className="input-group">
            <label>Display Name</label>
            <input 
              type="text" 
              placeholder="How you'll appear to others"
              value={formData.displayName}
              onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              required
            />
          </div>

          <div className="input-group">
            <label>Password</label>
            <input 
              type="password" 
              placeholder="Choose a strong password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: '1rem' }}>
            {loading ? <Loader2 className="animate-spin" /> : 'Create Account'}
          </button>
        </form>

        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
            Already have an account? <Link to="/login" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: '600' }}>Log In</Link>
          </p>
        </div>

        <div style={{ marginTop: '2.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--text-dim)', fontSize: '0.75rem' }}>
          <ShieldCheck size={12} /> Secure Key Generation
        </div>
      </motion.div>
    </div>
  );
};

export default Register;
