import { useState, useEffect } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, Package, Settings, Moon, Sun, Languages, Menu, X, TerminalSquare, Cloud } from 'lucide-react';
import { useAppStore } from './store';
import { cn } from './lib/utils';
import Dashboard from './components/Dashboard';
import Modules from './components/Modules';
import LogViewer from './components/LogViewer';
import CloudflareView from './components/CloudflareView';
import { api } from './api/client';
import SettingsView from './components/Settings';
import AuthScreen from './components/AuthScreen';

// ── Layout Component ────────────────────────────────────────────────────────

function Layout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { theme, toggleTheme, language, setLanguage } = useAppStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSystemLogs, setShowSystemLogs] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{hasUpdate: boolean, current: string, latest: string, changelog: string} | null>(null);

  useEffect(() => {
    api.getUpdateStatus().then(data => setUpdateInfo(data)).catch(() => {});
  }, []);

  const toggleLang = () => {
    if (language === 'zh') setLanguage('zh-TW');
    else if (language === 'zh-TW') setLanguage('en');
    else setLanguage('zh');
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) => cn(
    "flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
    isActive 
      ? "bg-zinc-100 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-50 shadow-sm" 
      : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 font-sans transition-colors duration-300">
      
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 border-r border-zinc-200 dark:border-zinc-800/60 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl flex flex-col transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:w-64",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-zinc-200 dark:border-zinc-800/60">
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center font-bold text-lg shadow-sm">
              L
            </div>
            <span className="ml-3 font-semibold text-lg tracking-tight">LexHub</span>
          </div>
          <button className="md:hidden p-1 text-zinc-500" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-2">
          <NavLink to="/" onClick={() => setSidebarOpen(false)} className={navLinkClass}>
            <LayoutDashboard className="w-4 h-4 mr-3" />
            {t('nav.dashboard')}
          </NavLink>
          <NavLink to="/modules" onClick={() => setSidebarOpen(false)} className={navLinkClass}>
            <Package className="w-4 h-4 mr-3" />
            {t('nav.modules')}
          </NavLink>
          <NavLink to="/cloudflare" onClick={() => setSidebarOpen(false)} className={navLinkClass}>
            <Cloud className="w-4 h-4 mr-3" />
            {t('nav.cloudflare', 'CF 穿透')}
          </NavLink>
          <NavLink to="/settings" onClick={() => setSidebarOpen(false)} className={navLinkClass}>
            <Settings className="w-4 h-4 mr-3" />
            {t('nav.settings')}
          </NavLink>
          
          <button 
            onClick={() => setShowSystemLogs(true)}
            className="flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 w-full"
          >
            <TerminalSquare className="w-4 h-4 mr-3 opacity-70" />
            {t('dashboard.systemLogs', '系统日志')}
          </button>
        </nav>

        <div className="p-4 mt-auto border-t border-zinc-200 dark:border-zinc-800/60">
          <div className="flex flex-col space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500 font-mono">v{updateInfo?.current || '2.0.0'}</span>
              {updateInfo?.hasUpdate && (
                <button 
                  onClick={() => {
                    const msg = `发现新版本 v${updateInfo.latest}\n\n请在你的终端（如 Termux）中运行命令进行自动升级：\n  lh update\n\n点击「确定」前往浏览器查看详细更新日志。`;
                    if (window.confirm(msg)) {
                      window.open(updateInfo.changelog || 'https://github.com/Future-404/LexHub/releases', '_blank');
                    }
                  }}
                  className="flex items-center text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full transition-colors hover:bg-amber-200 dark:hover:bg-amber-900/50"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 animate-pulse" />
                  发现新版
                </button>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors"
                title={t('theme.toggle')}
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <button
                onClick={toggleLang}
                className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors"
                title={t('language.toggle')}
              >
                <Languages className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-transparent relative">
        {/* Mobile Header */}
        <div className="md:hidden h-16 flex items-center px-4 border-b border-zinc-200 dark:border-zinc-800/60 bg-white/50 dark:bg-zinc-950/50 backdrop-blur-xl">
          <button 
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <Menu className="w-6 h-6" />
          </button>
          <span className="ml-2 font-semibold text-lg tracking-tight">LexHub</span>
        </div>
        
        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 relative z-10">
          <div className="max-w-5xl mx-auto">
            {children}
          </div>
        </div>
      </main>

      {showSystemLogs && (
        <LogViewer moduleId="system" onClose={() => setShowSystemLogs(false)} />
      )}
    </div>
  );
}

function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
      <h1 className="text-4xl font-bold text-zinc-800 dark:text-zinc-200">404</h1>
      <p className="text-zinc-500">{t('common.error', 'Page not found')}</p>
    </div>
  );
}

// ── App Router ──────────────────────────────────────────────────────────────

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);

  if (!authenticated) {
    return <AuthScreen onAuthenticated={() => setAuthenticated(true)} />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/modules" element={<Modules />} />
        <Route path="/cloudflare" element={<CloudflareView />} />
        <Route path="/settings" element={<SettingsView />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}
