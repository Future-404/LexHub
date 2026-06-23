import useSWR from 'swr';
import { useTranslation } from 'react-i18next';
import { fetcher } from '../api/client';
import { useState } from 'react';
import { Network, Globe, RefreshCw, Zap, Shield } from 'lucide-react';
import { useAppStore } from '../store';

interface GlobalSettings {
  language: 'zh' | 'en' | 'zh-TW';
  theme: 'dark' | 'light';
  networkStrategy: 'auto' | 'proxy' | 'mirror' | 'direct';
  proxyUrl?: string;
  mirrorUrl?: string;
}

interface NetworkStatus {
  bestMirror: string | null;
  detectedProxy: string | null;
  isScanning: boolean;
}

export default function SettingsView() {
  const { t, i18n } = useTranslation();
  const { setLanguage } = useAppStore();
  const { data: settings, mutate: mutateSettings } = useSWR<GlobalSettings>('/api/system/settings', fetcher);
  const { data: netStatus, mutate: mutateNetStatus } = useSWR<NetworkStatus>('/api/system/network', fetcher, { refreshInterval: 2000 });
  const [saving, setSaving] = useState(false);

  const updateSetting = async (key: string, value: any) => {
    setSaving(true);
    try {
      await fetch('/api/system/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value })
      });
      await mutateSettings();
      if (key === 'language') {
        setLanguage(value);
        i18n.changeLanguage(value);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRescan = async () => {
    await fetch('/api/system/network/rescan', { method: 'POST' });
    mutateNetStatus();
  };

  if (!settings) return null;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h1 className="text-2xl font-semibold tracking-tight">{t('nav.settings')}</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Network Settings */}
        <div className="glass-panel p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800/60 space-y-6">
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
              <Network className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-medium">{t('settings.network', 'Network Settings')}</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                {t('settings.strategy', 'Global Strategy')}
              </label>
              <select 
                disabled={saving}
                value={settings.networkStrategy}
                onChange={(e) => updateSetting('networkStrategy', e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 transition-shadow outline-none"
              >
                <option value="auto">{t('settings.strategyAuto', 'Auto (Smart detection)')}</option>
                <option value="direct">{t('settings.strategyDirect', 'Direct Connect')}</option>
                <option value="proxy">{t('settings.strategyProxy', 'Force Proxy')}</option>
                <option value="mirror">{t('settings.strategyMirror', 'Force Mirror')}</option>
              </select>
            </div>

            <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-100 dark:border-zinc-800/50 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-zinc-500">{t('settings.netStatus', 'Current Status')}</span>
                <button 
                  onClick={handleRescan}
                  disabled={netStatus?.isScanning}
                  className="flex items-center text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-1 ${netStatus?.isScanning ? 'animate-spin' : ''}`} />
                  {netStatus?.isScanning ? t('settings.scanning', 'Scanning...') : t('settings.rescan', 'Rescan')}
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center text-xs text-zinc-500">
                    <Shield className="w-3.5 h-3.5 mr-1" /> Proxy
                  </div>
                  <div className="text-sm font-medium truncate" title={netStatus?.detectedProxy || 'None'}>
                    {netStatus?.detectedProxy || <span className="text-zinc-400">Not detected</span>}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center text-xs text-zinc-500">
                    <Zap className="w-3.5 h-3.5 mr-1" /> Fastest Mirror
                  </div>
                  <div className="text-sm font-medium truncate" title={netStatus?.bestMirror || 'None'}>
                    {netStatus?.bestMirror ? new URL(netStatus.bestMirror).hostname : <span className="text-zinc-400">Not found</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* General Settings */}
        <div className="glass-panel p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800/60 space-y-6">
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-lg">
              <Globe className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-medium">{t('settings.general', 'General')}</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                {t('settings.language', 'Language')}
              </label>
              <select 
                disabled={saving}
                value={settings.language}
                onChange={(e) => updateSetting('language', e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 transition-shadow outline-none"
              >
                <option value="zh">简体中文</option>
                <option value="zh-TW">繁體中文</option>
                <option value="en">English</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                {t('settings.storeUrl', 'Store Index URL')}
              </label>
              <input 
                type="text"
                disabled={saving}
                value={settings.storeIndexUrl || ''}
                onChange={(e) => updateSetting('storeIndexUrl', e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 transition-shadow outline-none font-mono text-xs"
              />
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}
