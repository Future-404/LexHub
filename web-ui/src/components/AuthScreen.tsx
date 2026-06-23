import { useState, useEffect } from 'react';
import { Lock, ArrowRight, Loader2, KeyRound } from 'lucide-react';


export default function AuthScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [mode, setMode] = useState<'loading' | 'setup' | 'login'>('loading');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/auth/status', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (data.needSetup) {
          setMode('setup');
        } else {
          // Check if we are already logged in
          fetch('/api/system/info', { cache: 'no-store' })
            .then(res => {
              if (res.status === 401) {
                setMode('login');
              } else {
                onAuthenticated();
              }
            });
        }
      })
      .catch(() => setMode('login'));
  }, [onAuthenticated]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    
    setLoading(true);
    setError('');
    
    try {
      const endpoint = mode === 'setup' ? '/api/auth/setup' : '/api/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      
      const data = await res.json();
      
      if (res.ok && data.success) {
        onAuthenticated();
      } else {
        setError(data.error || '验证失败');
      }
    } catch (err) {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'loading') {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full items-center justify-center bg-zinc-50 dark:bg-zinc-950 font-sans p-4">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/60 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        <div className="px-8 pt-10 pb-8 text-center border-b border-zinc-100 dark:border-zinc-800/50">
          <div className="w-16 h-16 mx-auto bg-zinc-900 dark:bg-zinc-100 rounded-2xl flex items-center justify-center shadow-lg mb-6">
            <Lock className="w-8 h-8 text-white dark:text-zinc-900" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight mb-2">
            LexHub Gateway
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {mode === 'setup' 
              ? '为了保护您的设备，请设置全局网关密码。' 
              : '请输入全局网关密码以访问控制台。'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 bg-zinc-50/50 dark:bg-zinc-900/30">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 flex items-center">
                <KeyRound className="w-3.5 h-3.5 mr-1" />
                {mode === 'setup' ? '设置密码' : '网关密码'}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100 transition-shadow"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-sm text-red-500 font-medium animate-in slide-in-from-top-1">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full flex items-center justify-center bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white rounded-xl px-4 py-3 font-semibold transition-all active:scale-[0.98] disabled:opacity-50 mt-6"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  {mode === 'setup' ? '初始化网关' : '解锁大门'}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
