import { useState, useEffect } from "react";
import Login from "./components/auth/Login";
import ResetPassword from "./components/auth/ResetPassword";
import PragnaApp from "./pragna/App";
import { ChatProvider } from "./context/ChatContext";

import "./styles/auth.css";
import "./styles/chat.css";
import "./styles/input.css";
import "./styles/chat_modes.css";
import "./styles/dashboard.css";

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState({ username: '', email: '' });

  // The password reset email links to /reset-password?token=... - no router
  // in this app, so read it directly. Checked once on initial load; the
  // token is single-use anyway so there's no need for this to react to
  // later URL changes within the same session. isResetPasswordRoute is
  // tracked separately from the token itself so that visiting the path
  // with a missing/stripped token still shows an explicit "invalid link"
  // state instead of silently falling through to the normal app/login.
  const [resetToken] = useState(() => new URLSearchParams(window.location.search).get('token'));
  const [isResetPasswordRoute] = useState(() => window.location.pathname === '/reset-password');

  const clearResetToken = () => {
    const url = new URL(window.location.href);
    url.pathname = '/';
    url.searchParams.delete('token');
    window.history.replaceState({}, '', url.pathname + url.search);
    window.location.reload();
  };

  useEffect(() => {
    // Check if user is already logged in
    const savedToken = localStorage.getItem('authToken');
    const savedUserId = localStorage.getItem('userId');
    const savedUsername = localStorage.getItem('authUsername') || '';
    const savedEmail = localStorage.getItem('authEmail') || '';
    
    if (savedToken && savedUserId) {
      setIsAuthenticated(true);
      setUserProfile({ username: savedUsername, email: savedEmail });
    }
    
    setLoading(false);
  }, []);

  const handleLoginSuccess = (_userId, _token, profile) => {
    setIsAuthenticated(true);
    if (profile) {
      setUserProfile({
        username: profile.username || '',
        email: profile.email || '',
      });
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('authUsername');
    localStorage.removeItem('authEmail');
    setUserProfile({ username: '', email: '' });
    setIsAuthenticated(false);
  };

  if (resetToken || isResetPasswordRoute) {
    return <ResetPassword token={resetToken} onDone={clearResetToken} />;
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #0f1419 0%, #1a1f2e 100%)',
        fontSize: '18px',
        color: '#ffd700'
      }}>
        Loading...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <ChatProvider>
      <PragnaApp onLogout={handleLogout} userProfile={userProfile} />
    </ChatProvider>
  );
}