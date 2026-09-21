import { useState, useEffect } from 'react';
import { Lock, AlertTriangle } from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_ATTEMPTS    = 5;          // failed attempts before lockout
const LOCKOUT_MS      = 15 * 60 * 1000; // 15 minutes in ms
const LS_ATTEMPTS_KEY = '_nb_adm_fa';   // stored attempt count + timestamp
const USERNAME_ENV    = import.meta.env.VITE_ADMIN_USERNAME;
const HASH_ENV        = import.meta.env.VITE_ADMIN_PASSWORD_HASH;

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function sha256(str) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(str)
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function getLockoutState() {
  try {
    const raw = localStorage.getItem(LS_ATTEMPTS_KEY);
    if (!raw) return { count: 0, since: null };
    return JSON.parse(raw);
  } catch {
    return { count: 0, since: null };
  }
}

function saveLockoutState(state) {
  localStorage.setItem(LS_ATTEMPTS_KEY, JSON.stringify(state));
}

function clearLockoutState() {
  localStorage.removeItem(LS_ATTEMPTS_KEY);
}

function isLockedOut(state) {
  if (state.count < MAX_ATTEMPTS) return false;
  const elapsed = Date.now() - state.since;
  if (elapsed >= LOCKOUT_MS) {
    clearLockoutState();
    return false;
  }
  return true;
}

function remainingLockoutSecs(state) {
  const elapsed = Date.now() - state.since;
  return Math.ceil((LOCKOUT_MS - elapsed) / 1000);
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [lockedSecs, setLockedSecs] = useState(0);

  // Poll countdown while locked
  useEffect(() => {
    const state = getLockoutState();
    if (!isLockedOut(state)) return;
    setLockedSecs(remainingLockoutSecs(state));
    const id = setInterval(() => {
      const s = getLockoutState();
      if (!isLockedOut(s)) {
        setLockedSecs(0);
        clearInterval(id);
      } else {
        setLockedSecs(remainingLockoutSecs(s));
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // ── Lockout check ──
    const lockState = getLockoutState();
    if (isLockedOut(lockState)) {
      setLockedSecs(remainingLockoutSecs(lockState));
      return;
    }

    // ── Env sanity guard ──
    if (!USERNAME_ENV || !HASH_ENV) {
      setError('Admin credentials not configured. Contact the developer.');
      return;
    }

    setLoading(true);

    // ── Hash the entered password (async, uses native WebCrypto) ──
    const enteredHash = await sha256(password);

    // ── Constant-time-ish comparison (both sides are same-length hex) ──
    const usernameOk = username === USERNAME_ENV;
    const passwordOk = enteredHash === HASH_ENV;

    if (usernameOk && passwordOk) {
      clearLockoutState();
      setLoading(false);
      onLogin();
    } else {
      // Record failed attempt
      const newCount = lockState.count + 1;
      const newState = {
        count: newCount,
        since: newCount === MAX_ATTEMPTS ? Date.now() : lockState.since,
      };
      saveLockoutState(newState);

      if (newCount >= MAX_ATTEMPTS) {
        setLockedSecs(LOCKOUT_MS / 1000);
        setError(`Too many failed attempts. Locked for 15 minutes.`);
      } else {
        const remaining = MAX_ATTEMPTS - newCount;
        setError(`Invalid credentials. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`);
      }
      setLoading(false);
    }
  };

  const locked = lockedSecs > 0;
  const mins = Math.floor(lockedSecs / 60);
  const secs = lockedSecs % 60;

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4 text-[#f3f4f6]">
      <div className="max-w-md w-full bg-[#121212] border border-[#262626] rounded-xl shadow-lg p-8">

        {/* Icon */}
        <div className="flex justify-center mb-8">
          <div className={`p-3 rounded-full ${locked ? 'bg-[#ef4444]/10 text-[#ef4444]' : 'bg-[#f59e0b]/10 text-[#f59e0b]'}`}>
            {locked ? <AlertTriangle size={32} /> : <Lock size={32} />}
          </div>
        </div>

        <h2 className="text-2xl font-bold text-center mb-2">Admin Panel</h2>
        <p className="text-center text-sm text-[#6b7280] mb-8">Authorised personnel only</p>

        {/* Error / lockout banner */}
        {(error || locked) && (
          <div className="bg-[#ef4444]/10 border border-[#ef4444]/20 text-[#ef4444] p-3 rounded-lg mb-6 text-sm text-center">
            {locked
              ? `Account locked — try again in ${mins}m ${String(secs).padStart(2, '0')}s`
              : error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6" autoComplete="off">
          <div>
            <label className="block text-sm font-medium text-[#9ca3af] mb-2">Username</label>
            <input
              type="text"
              autoComplete="off"
              className="w-full px-4 py-2 bg-[#1a1a1a] border border-[#262626] rounded-lg focus:ring-2 focus:ring-[#f59e0b] focus:border-transparent outline-none transition-all text-[#f3f4f6] disabled:opacity-50"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={locked || loading}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#9ca3af] mb-2">Password</label>
            <input
              type="password"
              autoComplete="new-password"
              className="w-full px-4 py-2 bg-[#1a1a1a] border border-[#262626] rounded-lg focus:ring-2 focus:ring-[#f59e0b] focus:border-transparent outline-none transition-all text-[#f3f4f6] disabled:opacity-50"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={locked || loading}
              required
            />
          </div>
          <button
            type="submit"
            disabled={locked || loading}
            className="w-full bg-[#f59e0b] text-[#0a0a0a] font-bold py-2.5 rounded-lg hover:bg-[#fbbf24] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Verifying…' : locked ? `Locked (${mins}m ${String(secs).padStart(2, '0')}s)` : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
