import useSWR from 'swr';
import { useTranslation } from 'react-i18next';
import { fetcher } from '../api/client';
import { Activity, Cpu, MemoryStick, Timer, TerminalSquare } from 'lucide-react';
import { useState } from 'react';
import LogViewer from './LogViewer';

export interface SystemInfo {
  uptime: number;
  cpu: { load1m: number; cores: number; model: string };
  memory: { used: number; total: number; percentage: number };
}

export interface ModuleInfo {
  id: string;
  status: string;
  name: string;
  icon?: string;
  config?: Record<string, any>;
  env?: Record<string, any>;
}

export default function Dashboard() {
  const { t } = useTranslation();
  const [activeLogId, setActiveLogId] = useState<string | null>(null);
  
  const { data, error, isLoading } = useSWR<SystemInfo>('/api/system/info', fetcher, { refreshInterval: 3000 });
  const { data: modules } = useSWR<ModuleInfo[]>('/api/modules', fetcher, { refreshInterval: 3000 });

  const runningCount = modules?.filter((m) => m.status === 'RUNNING').length || 0;

  if (error) return <div className="text-red-500 font-medium">{t('dashboard.error', '加载系统信息失败')}</div>;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t('nav.dashboard')}</h1>
        <button 
          onClick={() => setActiveLogId('system')} 
          className="flex items-center justify-center px-4 py-2 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white rounded-xl text-sm font-semibold transition-all active:scale-[0.98] w-full sm:w-auto"
        >
          <TerminalSquare className="w-4 h-4 mr-2" />
          {t('dashboard.systemLogs')}
        </button>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <div className="glass-panel p-6 flex flex-col relative overflow-hidden group rounded-2xl border border-zinc-200 dark:border-zinc-800/60">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{t('dashboard.systemLoad')}</h3>
            <Cpu className="w-5 h-5 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors" />
          </div>
          {isLoading ? (
            <div className="h-9 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse w-1/2"></div>
          ) : (
            <p className="text-3xl font-semibold">{data?.cpu?.load1m != null ? data.cpu.load1m.toFixed(2) : '--'}</p>
          )}
        </div>

        <div className="glass-panel p-6 flex flex-col relative overflow-hidden group rounded-2xl border border-zinc-200 dark:border-zinc-800/60">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{t('dashboard.memory')}</h3>
            <MemoryStick className="w-5 h-5 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors" />
          </div>
          {isLoading ? (
            <div className="h-9 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse w-2/3"></div>
          ) : (
            <>
              <p className="text-3xl font-semibold">
                {data?.memory?.used ? Math.round(data.memory.used / 1024 / 1024 / 1024 * 10) / 10 : '--'} <span className="text-xl text-zinc-400">GB</span>
              </p>
              <p className="text-xs text-zinc-500 mt-1">/ {data?.memory?.total ? Math.round(data.memory.total / 1024 / 1024 / 1024 * 10) / 10 : '--'} GB</p>
            </>
          )}
        </div>

        <div className="glass-panel p-6 flex flex-col relative overflow-hidden group rounded-2xl border border-zinc-200 dark:border-zinc-800/60">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{t('dashboard.runningApps')}</h3>
            <Activity className="w-5 h-5 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors" />
          </div>
          {isLoading ? (
            <div className="h-9 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse w-1/3"></div>
          ) : (
            <p className="text-3xl font-semibold">{runningCount}</p>
          )}
        </div>

        <div className="glass-panel p-6 flex flex-col relative overflow-hidden group rounded-2xl border border-zinc-200 dark:border-zinc-800/60">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{t('dashboard.uptime')}</h3>
            <Timer className="w-5 h-5 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors" />
          </div>
          {isLoading ? (
            <div className="h-9 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse w-1/2"></div>
          ) : (
            <p className="text-3xl font-semibold">
              {data?.uptime ? Math.floor(data.uptime / 3600) : '--'}<span className="text-xl text-zinc-400">h</span> {data?.uptime ? Math.floor((data.uptime % 3600) / 60) : '--'}<span className="text-xl text-zinc-400">m</span>
            </p>
          )}
        </div>
      </div>

      {activeLogId && (
        <LogViewer moduleId={activeLogId} onClose={() => setActiveLogId(null)} />
      )}
    </div>
  );
}
