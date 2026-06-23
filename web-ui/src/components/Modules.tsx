import useSWR from 'swr';
import { useTranslation } from 'react-i18next';
import { fetcher, api } from '../api/client';
import { Play, Square, Download, Trash2, TerminalSquare, Loader2, Cloud, HardDrive, Settings, ExternalLink } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import LogViewer from './LogViewer';
import { ModuleInfo } from './Dashboard';
import { cn } from '../lib/utils';
import SillyTavernPanel from './SillyTavernPanel';
import CloudflarePanel from './CloudflarePanel';

interface ExtendedModuleInfo extends ModuleInfo {
  description?: string;
  icon?: string;
  isInstalled: boolean;
}

// ── Module Config Modal ──────────────────────────────────────────────────────

function ConfigModal({ module, onClose, onSaved }: { module: ExtendedModuleInfo; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setConfig(module.config || {});
  }, [module]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/modules/${module.id}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      onSaved();
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800/60">
          <h3 className="text-lg font-semibold flex items-center">
            <Settings className="w-5 h-5 mr-2 text-zinc-500" />
            {module.name} {t('common.settings', '配置')}
          </h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
            ✕
          </button>
        </div>
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {!module.env || Object.keys(module.env).length === 0 ? (
            <div className="text-center text-sm text-zinc-500 dark:text-zinc-400 py-4">
              {t('modules.configEmpty', '该模块没有可配置的环境变量。')}
            </div>
          ) : (
            Object.entries(module.env).map(([key, meta]: [string, any]) => (
              <div key={key}>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  {key}
                  {meta.description && <span className="ml-2 text-xs font-normal text-zinc-500">({meta.description})</span>}
                </label>
                <input
                  type={typeof meta.default === 'number' ? 'number' : 'text'}
                  value={config[key] !== undefined ? config[key] : meta.default}
                  onChange={(e) => setConfig({ ...config, [key]: typeof meta.default === 'number' ? Number(e.target.value) : e.target.value })}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 transition-shadow outline-none"
                />
              </div>
            ))
          )}
        </div>
        <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-100 dark:border-zinc-800/60 flex justify-end space-x-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
            {t('common.cancel', '取消')}
          </button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 rounded-lg text-sm font-semibold hover:bg-zinc-800 dark:hover:bg-white transition-colors disabled:opacity-50">
            {saving ? t('common.saving', '保存中...') : t('common.save', '保存配置')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Modules() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'installed' | 'store'>('installed');
  
  const { data: localModules, error: localError, isLoading: localLoading, mutate: mutateLocal } = useSWR<ExtendedModuleInfo[]>('/api/modules', fetcher, { refreshInterval: 3000 });
  const { data: storeModules, error: storeError, isLoading: storeLoading } = useSWR<ExtendedModuleInfo[]>(activeTab === 'store' ? '/api/store/modules' : null, fetcher);
  
  const [activeLogId, setActiveLogId] = useState<string | null>(null);
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [activeDetailId, setActiveDetailId] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const handleAction = async (id: string, action: 'start' | 'stop' | 'install' | 'uninstall') => {
    try {
      setLoadingAction(`${id}-${action}`);
      await api[action](id);
      mutateLocal();
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAction(null);
    }
  };

  const displayModules = useMemo(() => {
    if (activeTab === 'installed') return localModules || [];
    
    // For store tab, show remote modules. If already installed, show local status.
    const localMap = new Map((localModules || []).map(m => [m.id, m]));
    return (storeModules || []).map(sm => {
      const lm = localMap.get(sm.id);
      if (lm) return lm;
      return { ...sm, status: 'NOT_INSTALLED', isInstalled: false };
    });
  }, [activeTab, localModules, storeModules]);

  const isLoading = activeTab === 'installed' ? localLoading : storeLoading;
  const error = activeTab === 'installed' ? localError : storeError;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t('nav.modules')}</h1>
        
        <div className="flex p-1 bg-zinc-200/50 dark:bg-zinc-800/50 rounded-xl w-full sm:w-auto">
          <button onClick={() => setActiveTab('installed')} className={cn("flex-1 sm:flex-none flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg transition-all", activeTab === 'installed' ? "bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100" : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200")}>
            <HardDrive className="w-4 h-4 mr-2" />
            {t('modules.installed', '已安装')}
          </button>
          <button onClick={() => setActiveTab('store')} className={cn("flex-1 sm:flex-none flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg transition-all", activeTab === 'store' ? "bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100" : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200")}>
            <Cloud className="w-4 h-4 mr-2" />
            {t('modules.store', '模块商店')}
          </button>
        </div>
      </div>
      
      {error && <div className="text-red-500 font-medium">{t('modules.error', '加载模块列表失败')}</div>}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="glass-panel p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800/60 animate-pulse">
              <div className="flex space-x-4">
                <div className="w-14 h-14 bg-zinc-200 dark:bg-zinc-800 rounded-2xl"></div>
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-1/3"></div>
                  <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-2/3"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : displayModules.length === 0 ? (
        <div className="glass-panel p-12 rounded-2xl border border-zinc-200 dark:border-zinc-800/60 text-center text-zinc-500 dark:text-zinc-400">
          {activeTab === 'installed' ? t('dashboard.noApps') : t('modules.storeEmpty', '商店中暂无模块')}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          {displayModules.map((mod) => (
            <div key={mod.id} className="glass-panel p-5 md:p-6 flex flex-col group transition-shadow hover:shadow-md rounded-2xl border border-zinc-200 dark:border-zinc-800/60">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center space-x-3 md:space-x-4 overflow-hidden">
                  <div className="w-12 h-12 md:w-14 md:h-14 shrink-0 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 flex items-center justify-center text-2xl md:text-3xl shadow-sm border border-zinc-200/50 dark:border-zinc-700/50">
                    {mod.icon || '📦'}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base md:text-lg font-bold tracking-tight truncate">{mod.name || mod.id}</h2>
                    <p className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug line-clamp-2">{mod.description || t('modules.noDesc', '暂无描述')}</p>
                  </div>
                </div>
                <div className={`shrink-0 px-2.5 py-1 text-[10px] md:text-[11px] uppercase tracking-wider font-bold rounded-full ${
                  mod.status === 'RUNNING' ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400 border border-green-200 dark:border-green-500/30' :
                  mod.status === 'CRASHED' ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400 border border-red-200 dark:border-red-500/30' :
                  mod.status === 'INSTALLING' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 animate-pulse' :
                  mod.status === 'NOT_INSTALLED' ? 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500 border border-zinc-200 dark:border-zinc-700' :
                  'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700'
                }`}>
                  {t(`status.${mod.status}`, mod.status)}
                </div>
              </div>
              
              <div className="mt-4 md:mt-6 flex items-center space-x-2 md:space-x-3 pt-4 md:pt-5 border-t border-zinc-100 dark:border-zinc-800/60">
                {!mod.isInstalled ? (
                  <button onClick={() => handleAction(mod.id, 'install')} disabled={loadingAction === `${mod.id}-install` || mod.status === 'INSTALLING'} className="flex-1 flex items-center justify-center px-4 py-2.5 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white rounded-xl text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50">
                    {loadingAction === `${mod.id}-install` || mod.status === 'INSTALLING' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                    {t('common.install')}
                  </button>
                ) : (
                  <>
                    {mod.status === 'RUNNING' ? (
                      <button onClick={() => handleAction(mod.id, 'stop')} disabled={loadingAction === `${mod.id}-stop`} className="flex-1 flex items-center justify-center px-4 py-2 md:py-2.5 bg-red-500 text-white hover:bg-red-600 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50">
                        {loadingAction === `${mod.id}-stop` ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Square className="w-4 h-4 mr-2 fill-current" />}
                        {t('common.stop')}
                      </button>
                    ) : (
                      <button onClick={() => handleAction(mod.id, 'start')} disabled={loadingAction === `${mod.id}-start` || mod.status === 'INSTALLING'} className="flex-1 flex items-center justify-center px-4 py-2 md:py-2.5 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white rounded-xl text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50">
                        {loadingAction === `${mod.id}-start` || mod.status === 'INSTALLING' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2 fill-current" />}
                        {t('common.start')}
                      </button>
                    )}
                    <button onClick={() => setActiveLogId(mod.id)} className="p-2 md:p-2.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 bg-zinc-100 dark:bg-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl transition-colors" title={t('common.logs')}>
                      <TerminalSquare className="w-4 h-4" />
                    </button>
                    {mod.id === 'sillytavern' || mod.id === 'cloudflare' ? (
                      <button onClick={() => setActiveDetailId(mod.id)} className="p-2 md:p-2.5 text-blue-500 hover:text-blue-600 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 rounded-xl transition-colors" title={t('common.manage', '管理')}>
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    ) : (
                      <button onClick={() => setActiveConfigId(mod.id)} className="p-2 md:p-2.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 bg-zinc-100 dark:bg-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl transition-colors" title={t('common.settings')}>
                        <Settings className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => handleAction(mod.id, 'uninstall')} disabled={loadingAction === `${mod.id}-uninstall`} className="p-2 md:p-2.5 text-red-500 hover:text-red-600 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-xl transition-colors disabled:opacity-50" title={t('common.uninstall')}>
                      {loadingAction === `${mod.id}-uninstall` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeLogId && (
        <LogViewer moduleId={activeLogId} onClose={() => setActiveLogId(null)} />
      )}
      
      {activeConfigId && (
        <ConfigModal 
          module={displayModules.find(m => m.id === activeConfigId)!} 
          onClose={() => setActiveConfigId(null)} 
          onSaved={() => mutateLocal()}
        />
      )}

      {activeDetailId && displayModules.find(m => m.id === activeDetailId) && (
        activeDetailId === 'sillytavern' ? (
          <SillyTavernPanel
            module={displayModules.find(m => m.id === activeDetailId)!}
            onClose={() => setActiveDetailId(null)}
            onAction={async (id, action) => { await handleAction(id, action as 'start' | 'stop' | 'install' | 'uninstall'); }}
            loadingAction={loadingAction}
          />
        ) : (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-zinc-900/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/60 rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
                <h2 className="text-lg font-medium text-zinc-900 dark:text-white">
                  {displayModules.find(m => m.id === activeDetailId)?.name || activeDetailId} 控制台
                </h2>
                <button onClick={() => setActiveDetailId(null)} className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
                  X
                </button>
              </div>
              <div className="p-6 overflow-y-auto">
                {activeDetailId === 'cloudflare' ? (
                  <CloudflarePanel moduleId={activeDetailId} />
                ) : (
                  <div className="text-center text-zinc-500 py-12">此模块暂无专属高级控制面板。</div>
                )}
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}
