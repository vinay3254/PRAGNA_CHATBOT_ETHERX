import { useState } from 'react';
import '../../styles/auth.css';
import { authAPI } from '../../api/authAPI';
import pragnaLogo from '../../assets/pragna-logo-full.png';

// Rendered when the URL has a ?token= param (the link from the password
// reset email points here). No router in this app, so App.jsx decides
// whether to show this component by reading window.location directly.
export default function ResetPassword({ token, onDone }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const data = await authAPI.resetPassword(token, newPassword);
      if (data.error) {
        setError(data.error);
        return;
      }
      setSuccess(true);
    } catch (err) {
      setError('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-header">
        <div className="header-logo-container">
          <img src={pragnaLogo} alt="Pragna" className="header-logo-small" />
          <h2 className="project-name">PRAGNA-1 A</h2>
        </div>
        <p className="company-subtitle">
          Powered by <span className="etherx-text">EtherX Innovations</span>
        </p>
      </div>

      <div className="auth-box">
        <h1>{token ? 'Set New Password' : 'Invalid Reset Link'}</h1>

        {error && <div className="auth-error">{error}</div>}

        {!token ? (
          <>
            <p style={{ color: 'var(--pragna-text-muted, #a89878)', fontSize: '14px', lineHeight: 1.6, margin: '4px 0 20px 0' }}>
              This password reset link is missing or incomplete. Request a new one from the login page.
            </p>
            <button type="button" onClick={onDone} className="auth-btn">
              Go to login
            </button>
          </>
        ) : success ? (
          <>
            <p style={{ color: 'var(--pragna-text-muted, #a89878)', fontSize: '14px', lineHeight: 1.6, margin: '4px 0 20px 0' }}>
              Your password has been reset. You can log in with your new password now.
            </p>
            <button type="button" onClick={onDone} className="auth-btn">
              Go to login
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              disabled={loading}
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={loading}
            />
            <p className="password-hint">Min 8 characters</p>

            <button type="submit" disabled={loading} className="auth-btn">
              {loading ? '...' : 'Reset password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
