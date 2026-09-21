import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

// ─── Session expiry ───────────────────────────────────────────────────────────
const SESSION_KEY    = 'adminAuth';
const SESSION_TS_KEY = 'adminAuthTs';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function isSessionValid() {
  if (localStorage.getItem(SESSION_KEY) !== 'true') return false;
  const ts = parseInt(localStorage.getItem(SESSION_TS_KEY) || '0', 10);
  if (Date.now() - ts > SESSION_TTL_MS) {
    // Expired — clear it
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_TS_KEY);
    return false;
  }
  return true;
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(isSessionValid);

  const handleLogin = () => {
    setIsAuthenticated(true);
    localStorage.setItem(SESSION_KEY, 'true');
    localStorage.setItem(SESSION_TS_KEY, String(Date.now()));
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_TS_KEY);
  };

  return (
    <Router basename="/admin">
      <Routes>
        <Route
          path="/login"
          element={!isAuthenticated ? <Login onLogin={handleLogin} /> : <Navigate to="/" />}
        />
        <Route
          path="/*"
          element={isAuthenticated ? <Dashboard onLogout={handleLogout} /> : <Navigate to="/login" />}
        />
      </Routes>
    </Router>
  );
}

export default App;
