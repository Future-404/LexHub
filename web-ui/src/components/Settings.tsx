import useSWR from 'swr';
import { useTranslation } from 'react-i18next';
import { fetcher, api } from '../api/client';
import { useState } from 'react';
import { Network, Globe, RefreshCw, Zap, Shield, Archive, Loader2, Key, Smartphone, Activity, RotateCcw } from 'lucide-react';
import { useAppStore } from '../store';

interface GlobalSettings {
  language: 'zh' | 'en' | 'zh-TW';
  theme: 'dark' | 'light';
  networkStrategy: 'auto' | 'proxy' | 'mirror' | 'direct';
  proxyUrl?: string;
  mirrorUrl?: string;
  storeIndexUrl?: string;
  autoStartModules: string[];
}

interface ModuleInfo {
  id: string;
  status: string;
  name: string;
}

interface NetworkStatus {
  bestMirror: string | null;
  detectedProxy: string | null;
  isScanning: boolean;
}

interface MigrationScanResult {
  hasLegacyTavx: boolean;
  detects: {
    id: string;
    oldPath: string;
    status: 'READY' | 'MIGRATED';
  }[];
}

const safeHostname = (url: string) => {
  try { return new URL(url).hostname; } catch { return url; }
};

export default function SettingsView() {
  const { t, i18n } = useTranslation();
  const { setLanguage } = useAppStore();
  const { data: settings, mutate: mutateSettings } = useSWR<GlobalSettings>('/api/system/settings', fetcher);
  const { data: netStatus, mutate: mutateNetStatus } = useSWR<NetworkStatus>('/api/system/network', fetcher, { refreshInterval: 5000 });
  const { data: autostartStatus, mutate: mutateAutostart } = useSWR<{enabled: boolean}>('/api/system/autostart', fetcher);
  const { data: modules } = useSWR<ModuleInfo[]>('/api/modules', fetcher);
  const { data: migrationData, mutate: mutateMigration } = useSWR<MigrationScanResult>('/api/system/migrate/scan', fetcher);
  const { data: sysInfo } = useSWR<any>('/api/system/info', fetcher);
  const { data: adbStatus, mutate: mutateAdbStatus } = useSWR<any>(
    sysInfo?.platform === 'termux' || sysInfo?.platform === 'linux' ? '/api/system/adb/status' : null,
    fetcher
  );

  const [saving, setSaving] = useState(false);
  const [migratingId, setMigratingId] = useState<string | null>(null);
  
  const [adbHost, setAdbHost] = useState('127.0.0.1:5555');
  const [pairingCode, setPairingCode] = useState('');
  const [adbLoading, setAdbLoading] = useState(false);

  const handleAdbInstall = async () => {
    setAdbLoading(true);
    try {
      const res = await fetch('/api/system/adb/install', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || '安装完成');
        mutateAdbStatus();
      } else {
        alert('安装失败: ' + data.error);
      }
    } catch (err) {
      alert('网络错误: ' + err);
    } finally {
      setAdbLoading(false);
    }
  };

  const handleAdbPair = async () => {
    if (!pairingCode) return alert('请输入配对码');
    setAdbLoading(true);
    try {
      const res = await fetch('/api/system/adb/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: adbHost, code: pairingCode })
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || '配对指令执行成功');
        mutateAdbStatus();
      } else {
        alert('配对失败: ' + data.error);
      }
    } catch (err) {
      alert('配对错误: ' + err);
    } finally {
      setAdbLoading(false);
    }
  };

  const handleAdbConnect = async () => {
    setAdbLoading(true);
    try {
      const res = await fetch('/api/system/adb/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: adbHost })
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || '连接成功');
        mutateAdbStatus();
      } else {
        alert('连接失败: ' + data.error);
      }
    } catch (err) {
      alert('连接错误: ' + err);
    } finally {
      setAdbLoading(false);
    }
  };

  const handleAdbOptimize = async (mode: 'universal' | 'aggressive') => {
    if (mode === 'aggressive' && !confirm('激进策略会冻结部分系统级功耗管理组件（可随时恢复）。有些设备可能会有充电或发热提示，是否确认继续？')) {
      return;
    }
    setAdbLoading(true);
    try {
      const res = await fetch('/api/system/adb/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || '保活优化策略配置完成');
        mutateAdbStatus();
      } else {
        alert('配置失败: ' + data.error);
      }
    } catch (err) {
      alert('请求错误: ' + err);
    } finally {
      setAdbLoading(false);
    }
  };

  const handleAdbHeartbeat = async (enable: boolean) => {
    setAdbLoading(true);
    try {
      const res = await fetch('/api/system/adb/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enable })
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || '操作成功');
        mutateAdbStatus();
      } else {
        alert('操作失败: ' + data.error);
      }
    } catch (err) {
      alert('请求错误: ' + err);
    } finally {
      setAdbLoading(false);
    }
  };

  const handleAdbRollback = async () => {
    if (!confirm('确定要恢复系统默认后台配置，撤销全部已应用优化吗？')) return;
    setAdbLoading(true);
    try {
      const res = await fetch('/api/system/adb/rollback', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || '所有优化参数已撤销还原');
        mutateAdbStatus();
      } else {
        alert('撤销失败: ' + data.error);
      }
    } catch (err) {
      alert('请求错误: ' + err);
    } finally {
      setAdbLoading(false);
    }
  };

  const toggleAutostart = async (currentVal: boolean) => {
    setSaving(true);
    try {
      const res = await api.setAutostart(!currentVal);
      if (res.warning) {
        alert('⚠️ 重要提示\n\n' + res.warning);
      }
      await mutateAutostart();
    } finally {
      setSaving(false);
    }
  };

  const handleMirrorUpdate = async (action: string, url?: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/system/mirrors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, url })
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || '操作成功');
      } else {
        alert('操作失败: ' + data.error);
      }
    } catch (err) {
      alert('网络错误: ' + err);
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = async (key: string, value: unknown) => {
    setSaving(true);
    try {
      await fetch('/api/system/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value })
      });
      await mutateSettings();
      if (key === 'language') {
        setLanguage(value as any);
        i18n.changeLanguage(value as any);
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleModuleAutostart = async (moduleId: string) => {
    if (!settings) return;
    const current = settings.autoStartModules || [];
    const enabled = current.includes(moduleId);
    const newModules = enabled 
      ? current.filter(id => id !== moduleId)
      : [...current, moduleId];
    
    await updateSetting('autoStartModules', newModules);
  };

  const handleRescan = async () => {
    await fetch('/api/system/network/rescan', { method: 'POST' });
    mutateNetStatus();
  };

  const handleMigrate = async (id: string) => {
    if (!confirm(`确定要将 ${id} 从 TAV-X 迁移到 LexHub 吗？\n该操作会自动为您拉取脚手架并复制原先的资产文件（如 data, plugins 等）。`)) return;
    setMigratingId(id);
    try {
      const res = await api.executeMigrate(id);
      alert(res.message);
      await mutateMigration();
    } catch (err) {
      alert('迁移失败: ' + String(err));
    } finally {
      setMigratingId(null);
    }
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
            
            {settings.networkStrategy === 'proxy' && (
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">自定义代理 URL (Custom Proxy)</label>
                <input 
                  type="text"
                  disabled={saving}
                  value={settings.proxyUrl || ''}
                  onChange={(e) => updateSetting('proxyUrl', e.target.value)}
                  placeholder="http://127.0.0.1:7890"
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 transition-shadow outline-none"
                />
              </div>
            )}

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
                    {netStatus?.bestMirror ? safeHostname(netStatus.bestMirror) : <span className="text-zinc-400">Not found</span>}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800/50 space-y-4">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                镜像源配置 (Mirror Settings)
              </label>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-medium text-zinc-500 min-w-[70px]">📦 NPM 源</span>
                  <select
                    disabled={saving}
                    onChange={(e) => handleMirrorUpdate('npm', e.target.value)}
                    defaultValue=""
                    className="flex-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="" disabled>选择镜像源...</option>
                    <option value="https://registry.npmmirror.com">淘宝镜像 (npmmirror)</option>
                    <option value="https://mirrors.aliyun.com/npm/">阿里云镜像</option>
                    <option value="https://mirrors.cloud.tencent.com/npm/">腾讯云镜像</option>
                    <option value="https://mirrors.huaweicloud.com/repository/npm/">华为云镜像</option>
                    <option value="https://registry.npmjs.org">官方源 (npmjs.org)</option>
                  </select>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-medium text-zinc-500 min-w-[70px]">🐍 PIP 源</span>
                  <select
                    disabled={saving}
                    onChange={(e) => handleMirrorUpdate('pip', e.target.value)}
                    defaultValue=""
                    className="flex-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="" disabled>选择镜像源...</option>
                    <option value="https://pypi.tuna.tsinghua.edu.cn/simple">清华大学 (Tsinghua)</option>
                    <option value="https://mirrors.aliyun.com/pypi/simple/">阿里云镜像</option>
                    <option value="https://mirrors.cloud.tencent.com/pypi/simple/">腾讯云镜像</option>
                    <option value="https://pypi.doubanio.com/simple/">豆瓣镜像</option>
                    <option value="https://mirrors.huaweicloud.com/repository/pypi/simple/">华为云镜像</option>
                    <option value="https://pypi.org/simple">官方源 (pypi.org)</option>
                  </select>
                </div>

                {(sysInfo?.platform === 'termux' || sysInfo?.platform === 'linux') && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs font-medium text-zinc-500 min-w-[70px]">🐧 系统源</span>
                    <select
                      disabled={saving}
                      onChange={(e) => handleMirrorUpdate('system', e.target.value)}
                      defaultValue=""
                      className="flex-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="" disabled>选择系统源...</option>
                      <option value="tsinghua">清华大学 (Tsinghua)</option>
                      <option value="aliyun">阿里云 (Aliyun)</option>
                      <option value="bfsu">北京外国语大学 (BFSU)</option>
                      <option value="ustc">中国科学技术大学 (USTC)</option>
                      <option value="default">官方默认源 (Default)</option>
                    </select>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    disabled={saving}
                    onClick={() => handleMirrorUpdate('reset')}
                    className="w-full py-1.5 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 text-xs font-medium rounded-lg border border-red-100 dark:border-red-900/30 transition-colors flex items-center justify-center gap-1.5"
                  >
                    🔄 重置网络设置与代理
                  </button>
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

            <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-100 dark:border-zinc-800/50 mt-4">
              <div>
                <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">{t('settings.autostart', '开机自启')}</span>
                <span className="block text-xs text-zinc-500 mt-1">{t('settings.autostartDesc', '随系统启动自动拉起 LexHub')}</span>
              </div>
              <button
                disabled={saving || !autostartStatus}
                onClick={() => autostartStatus && toggleAutostart(autostartStatus.enabled)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${autostartStatus?.enabled ? 'bg-blue-500' : 'bg-zinc-200 dark:bg-zinc-700'}`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${autostartStatus?.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            {modules && modules.length > 0 && (
              <div className="pt-2">
                <label className="block text-xs font-medium text-zinc-500 mb-2 pl-1">允许随后台自动启动的模块 (Autostart Modules)</label>
                <div className="space-y-2">
                  {modules.map(mod => {
                    const isEnabled = (settings.autoStartModules || []).includes(mod.id);
                    return (
                      <div key={mod.id} className="flex items-center justify-between p-3 bg-zinc-50/50 dark:bg-zinc-900/30 rounded-lg border border-zinc-100 dark:border-zinc-800/30 transition-colors hover:border-zinc-200 dark:hover:border-zinc-700">
                        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{mod.name || mod.id}</span>
                        <button
                          disabled={saving}
                          onClick={() => toggleModuleAutostart(mod.id)}
                          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${isEnabled ? 'bg-blue-500' : 'bg-zinc-200 dark:bg-zinc-700'}`}
                        >
                          <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
        
      </div>

      {/* Migration Card */}
      {migrationData?.hasLegacyTavx && (
        <div className="glass-panel p-6 rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/30 dark:bg-blue-900/10 space-y-6">
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
              <Archive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-blue-900 dark:text-blue-100">老用户数据迁移 (TAV-X Migration)</h2>
              <p className="text-sm text-blue-700/80 dark:text-blue-300/80 mt-1">
                检测到您设备上存有旧版 TAV-X 架构的遗留资产。您可以一键无缝将历史数据升级至 LexHub 环境。
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {migrationData.detects.map(d => (
              <div key={d.id} className="flex items-center justify-between p-4 bg-white/60 dark:bg-zinc-900/60 rounded-xl border border-blue-100 dark:border-blue-800/30">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">{d.id}</span>
                    {d.status === 'MIGRATED' && (
                      <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">已迁移</span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1 font-mono truncate max-w-xs sm:max-w-md">
                    旧版路径: {d.oldPath}
                  </div>
                </div>
                <button
                  disabled={migratingId === d.id || d.status === 'MIGRATED'}
                  onClick={() => handleMigrate(d.id)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center shadow-sm"
                >
                  {migratingId === d.id ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 迁移中...</>
                  ) : d.status === 'MIGRATED' ? '已完成' : '一键迁移'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Android Keepalive Settings */}
      {(sysInfo?.platform === 'termux' || sysInfo?.platform === 'linux') && adbStatus && (
        <div className="glass-panel p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800/60 space-y-6 mt-6">
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-medium">Android 系统保活与优化 (Android Performance Guard)</h2>
              <p className="text-xs text-zinc-500 mt-1">防止 Termux 及酒馆、网关进程在后台被安卓系统（尤其是 Phantom Process Killer）杀死。</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Connection Block */}
            <div className="space-y-4 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-800/50">
              <h3 className="text-sm font-semibold flex items-center text-zinc-700 dark:text-zinc-300">
                <Key className="w-4 h-4 mr-1.5 text-zinc-500" /> 第一步: ADB 连接与配对
              </h3>

              {!adbStatus.installed ? (
                <div className="space-y-2">
                  <p className="text-xs text-red-500">检测到未安装 ADB 工具包。请先点击安装。</p>
                  <button
                    disabled={adbLoading}
                    onClick={handleAdbInstall}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors flex items-center"
                  >
                    {adbLoading && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                    一键安装 ADB
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-3 rounded-lg bg-zinc-100 dark:bg-zinc-800/60 text-xs text-zinc-500 space-y-1">
                    <div>1. 开启手机【开发者选项】和【无线调试】</div>
                    <div>2. 查看无线调试下的【IP 地址和端口】以及【配对码】</div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-zinc-500 mb-1">IP 与端口 (IP:Port)</label>
                      <input
                        type="text"
                        value={adbHost}
                        onChange={(e) => setAdbHost(e.target.value)}
                        placeholder="127.0.0.1:5555"
                        className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-zinc-500 mb-1">配对码 (Pairing Code)</label>
                      <input
                        type="text"
                        value={pairingCode}
                        onChange={(e) => setPairingCode(e.target.value)}
                        placeholder="6位配对码"
                        className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      disabled={adbLoading}
                      onClick={handleAdbPair}
                      className="flex-1 py-1.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-xs font-semibold rounded-lg transition-colors"
                    >
                      配对设备 (Pair)
                    </button>
                    <button
                      disabled={adbLoading}
                      onClick={handleAdbConnect}
                      className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      连接设备 (Connect)
                    </button>
                  </div>

                  <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 text-xs">
                    <span>当前状态: </span>
                    {adbStatus.connected ? (
                      <span className="text-green-600 font-semibold">
                        已连接 ({adbStatus.manufacturer || '未知设备'})
                      </span>
                    ) : (
                      <span className="text-zinc-400">未连接</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Performance Settings Block */}
            <div className="space-y-4 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-800/50">
              <h3 className="text-sm font-semibold flex items-center text-zinc-700 dark:text-zinc-300">
                <Activity className="w-4 h-4 mr-1.5 text-zinc-500" /> 第二步: 优化与音频心跳
              </h3>

              <div className="space-y-3">
                <div className="flex gap-2">
                  <button
                    disabled={adbLoading || !adbStatus.connected}
                    onClick={() => handleAdbOptimize('universal')}
                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    🛡️ 应用通用保活
                  </button>
                  <button
                    disabled={adbLoading || !adbStatus.connected}
                    onClick={() => handleAdbOptimize('aggressive')}
                    className="flex-1 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    🔥 厂商激进优化
                  </button>
                </div>

                <div className="flex items-center justify-between p-3 bg-white dark:bg-zinc-850 rounded-lg border border-zinc-100 dark:border-zinc-800">
                  <div>
                    <span className="block text-xs font-medium text-zinc-800 dark:text-zinc-200">静音音频心跳 (Audio Heartbeat)</span>
                    <span className="block text-[10px] text-zinc-500 mt-0.5">利用系统媒体播放保护机制防止进程被休眠。</span>
                  </div>
                  <button
                    disabled={adbLoading}
                    onClick={() => handleAdbHeartbeat(!adbStatus.heartbeatRunning)}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${adbStatus.heartbeatRunning ? 'bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-700'}`}
                  >
                    <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${adbStatus.heartbeatRunning ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className="flex gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                  <button
                    disabled={adbLoading || !adbStatus.connected}
                    onClick={handleAdbRollback}
                    className="w-full py-1.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-xs font-medium rounded-lg transition-colors flex items-center justify-center text-zinc-700 dark:text-zinc-300"
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1" /> 撤销所有系统优化
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
