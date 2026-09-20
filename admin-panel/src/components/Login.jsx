import { useState } from 'react';
import { Lock } from 'lucide-react';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (
      username === import.meta.env.VITE_ADMIN_USERNAME && 
      password === import.meta.env.VITE_ADMIN_PASSWORD
    ) {
      onLogin();
    } else {
      setError('Invalid credentials');
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4 text-[#f3f4f6]">
      <div className="max-w-md w-full bg-[#121212] border border-[#262626] rounded-xl shadow-lg p-8">
        <div className="flex justify-center mb-8">
          <div className="p-3 bg-[#f59e0b]/10 rounded-full text-[#f59e0b]">
            <Lock size={32} />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-center mb-8">Admin Panel Login</h2>
        
        {error && (
          <div className="bg-[#ef4444]/10 border border-[#ef4444]/20 text-[#ef4444] p-3 rounded-lg mb-6 text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-[#9ca3af] mb-2">Username</label>
            <input
              type="text"
              className="w-full px-4 py-2 bg-[#1a1a1a] border border-[#262626] rounded-lg focus:ring-2 focus:ring-[#f59e0b] focus:border-transparent outline-none transition-all text-[#f3f4f6]"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#9ca3af] mb-2">Password</label>
            <input
              type="password"
              className="w-full px-4 py-2 bg-[#1a1a1a] border border-[#262626] rounded-lg focus:ring-2 focus:ring-[#f59e0b] focus:border-transparent outline-none transition-all text-[#f3f4f6]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-[#f59e0b] text-[#0a0a0a] font-bold py-2.5 rounded-lg hover:bg-[#fbbf24] transition-colors"
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}
