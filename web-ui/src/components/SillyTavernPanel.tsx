import { useState, useEffect, useCallback } from 'react';
import useSWR from 'swr';
import { fetcher } from '../api/client';
import {
  Play, Square, Download, RefreshCw, GitBranch, Archive, RotateCcw,
  Settings, Puzzle, KeyRound,
  Trash2, X, ChevronRight, ChevronDown, CheckCircle2, AlertCircle,
  Loader2, HistoryIcon, Lock, Unlock, Globe, ShieldCheck
} from 'lucide-react';
import { cn } from '../lib/utils';
import { ModuleInfo } from './Dashboard';
import DangerModal from './DangerModal';

// ── Types ────────────────────────────────────────────────────────────────────

interface VersionInfo {
  current: string | null;
  isLocked: boolean;
  channel: string | null;
  tags: string[];
}

interface PluginEntry {
  id: string;
  name: string;
  repo: string;
  serverBranch: string | null;
  clientBranch: string | null;
  dir: string;
  isInstalled: boolean;
}

interface BackupEntry {
  filename: string;
  path: string;
  size: number;
  mtime: string;
  source?: string;
}

interface AppConfigSchema {
  [category: string]: {
    label: string;
    icon: string;
    fields: Array<{
      key: string;
      label: string;
      type: 'bool' | 'int' | 'select' | 'string';
      default: unknown;
      options?: string[];
    }>;
  };
}

// ── Sub-panels ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    RUNNING: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    STOPPED: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
    INSTALLING: 'bg-blue-500/20 text-blue-400 border-blue-500/30 animate-pulse',
    CRASHED: 'bg-red-500/20 text-red-400 border-red-500/30',
    ERROR: 'bg-red-500/20 text-red-400 border-red-500/30',
  };
  return (
    <span className={cn('px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border', colors[status] || colors.STOPPED)}>
      {status}
    </span>
  );
}

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="glass-panel rounded-2xl border border-zinc-200 dark:border-zinc-800/60 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
      >
        <span className="flex items-center gap-3 font-semibold text-sm">
          {icon}
          {title}
        </span>
        {open ? <ChevronDown className="w-4 h-4 text-zinc-400" /> : <ChevronRight className="w-4 h-4 text-zinc-400" />}
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

// ── App Config Panel ──────────────────────────────────────────────────────────

function AppConfigPanel({ moduleId }: { moduleId: string }) {
  const [data, setData] = useState<{ config: Record<string, unknown>; schema: AppConfigSchema | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localConfig, setLocalConfig] = useState<Record<string, unknown>>({});
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [showPublicSetup, setShowPublicSetup] = useState(false);
  const [publicPassword, setPublicPassword] = useState('');
  const [publicLoading, setPublicLoading] = useState(false);

  const isPublicAccessEnabled = 
    localConfig.listen === true && 
    localConfig.enableUserAccounts === true;

  const handleEnablePublicAccess = async () => {
    if (!publicPassword) return;
    setPublicLoading(true);
    setMsg(null);
    try {
      const patch = {
        "listen": true,
        "whitelistMode": false,
        "enableUserAccounts": true,
        "enableDiscreetLogin": true,
        "basicAuthMode": false
      };
      
      let r = await fetch(`/api/modules/${moduleId}/app-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error(await r.text());

      r = await fetch(`/api/modules/${moduleId}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'default-user', password: publicPassword }),
      });
      if (!r.ok) throw new Error(await r.text());

      setMsg({ type: 'ok', text: '正在重启酒馆以应用安全公网配置...' });
      await fetch(`/api/modules/${moduleId}/stop`, { method: 'POST' });
      await fetch(`/api/modules/${moduleId}/start`, { method: 'POST' });

      setLocalConfig(prev => ({
        ...prev,
        ...patch
      }));
      setShowPublicSetup(false);
      setPublicPassword('');
      setMsg({ type: 'ok', text: '安全公网访问已成功开启！您的酒馆已绑定至 0.0.0.0:8000，且已启用多用户密码隔离系统。' });
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message || '开启失败' });
    } finally {
      setPublicLoading(false);
    }
  };

  useEffect(() => {
    fetch(`/api/modules/${moduleId}/app-config`)
      .then(r => r.json())
      .then(d => {
        setData(d);
        setLocalConfig(d.config || {});
        if (d.schema) setActiveCategory(Object.keys(d.schema)[0]);
      })
      .catch(() => setMsg({ type: 'err', text: '加载配置失败' }))
      .finally(() => setLoading(false));
  }, [moduleId]);

  const getVal = (key: string) => {
    return key.split('.').reduce((acc: Record<string, unknown> | unknown, k) => (acc as Record<string, unknown>)?.[k], localConfig);
  };

  const setVal = (key: string, value: unknown) => {
    setLocalConfig(prev => {
      const next = { ...prev };
      const keys = key.split('.');
      let cur: Record<string, unknown> = next;
      for (let i = 0; i < keys.length - 1; i++) {
        cur[keys[i]] = cur[keys[i]] ? { ...cur[keys[i]] } : {};
        cur = cur[keys[i]];
      }
      cur[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const patch: Record<string, unknown> = {};
      if (data?.schema) {
        for (const cat of Object.values(data.schema)) {
          for (const f of cat.fields) {
            patch[f.key] = getVal(f.key) ?? f.default;
          }
        }
      }
      const r = await fetch(`/api/modules/${moduleId}/app-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error(await r.text());
      setMsg({ type: 'ok', text: '配置已保存！重启服务后生效。' });
    } catch (e: unknown) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div>;
  if (!data?.schema) return <div className="py-4 text-sm text-zinc-500">该模块没有 app 配置 schema。</div>;

  const categories = Object.entries(data.schema);

  return (
    <div className="space-y-4">
      {/* One-click Public Access Banner & Form */}
      {!isPublicAccessEnabled && (
        <div className="glass-panel p-5 rounded-2xl border border-amber-500/20 dark:border-amber-500/10 bg-amber-500/5 dark:bg-amber-500/5 space-y-4">
          <div className="flex items-start gap-3">
            <Globe className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-bold text-amber-600 dark:text-amber-400">一键开启安全公网访问</h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                自动将监听地址改为 0.0.0.0（允许公网访问），关闭 IP 白名单，并<strong>强制启用多用户密码隔离系统</strong>，确保您的公网酒馆不会被裸奔扫描。
              </p>
            </div>
          </div>

          {!showPublicSetup ? (
            <button
              onClick={() => setShowPublicSetup(true)}
              className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-semibold transition-all shadow-sm flex items-center justify-center gap-1.5"
            >
              <ShieldCheck className="w-3.5 h-3.5" /> 一键开启安全公网
            </button>
          ) : (
            <div className="space-y-3 pt-3 border-t border-zinc-150 dark:border-zinc-800/60">
              <div className="text-xs text-zinc-600 dark:text-zinc-400">
                请为管理员账号 <span className="font-semibold text-zinc-800 dark:text-zinc-200">default-user</span> 设置一个安全的公网登录密码：
              </div>
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="请输入新密码"
                  value={publicPassword}
                  onChange={e => setPublicPassword(e.target.value)}
                  className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-xs focus:ring-2 focus:ring-amber-500 outline-none text-zinc-900 dark:text-zinc-100"
                  disabled={publicLoading}
                />
                <button
                  onClick={handleEnablePublicAccess}
                  disabled={publicLoading || !publicPassword}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shrink-0 transition-all flex items-center gap-1"
                >
                  {publicLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  确认开启
                </button>
                <button
                  onClick={() => { setShowPublicSetup(false); setPublicPassword(''); }}
                  disabled={publicLoading}
                  className="px-3 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-semibold transition-all"
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2">
        {categories.map(([key, cat]) => (
          <button
            key={key}
            onClick={() => setActiveCategory(key)}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-semibold transition-all',
              activeCategory === key
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            )}
          >
            {cat.icon} {cat.label}
          </button>
        ))}
      </div>

      {/* Fields */}
      {activeCategory && data.schema[activeCategory] && (
        <div className="space-y-3">
          {data.schema[activeCategory].fields.map(field => {
            const val = getVal(field.key) ?? field.default;
            return (
              <div key={field.key} className="flex items-center justify-between py-2.5 border-b border-zinc-100 dark:border-zinc-800/50 last:border-0 gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{field.label}</div>
                  <div className="text-[11px] text-zinc-500 font-mono">{field.key}</div>
                </div>
                <div className="shrink-0">
                  {field.type === 'bool' ? (
                    <button
                      onClick={() => setVal(field.key, !val)}
                      className={cn(
                        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                        val ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'
                      )}
                    >
                      <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white transition-transform', val ? 'translate-x-6' : 'translate-x-1')} />
                    </button>
                  ) : field.type === 'select' ? (
                    <select
                      value={String(val)}
                      onChange={e => setVal(field.key, e.target.value)}
                      className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : field.type === 'string' ? (
                    <input
                      type="text"
                      value={String(val)}
                      onChange={e => setVal(field.key, e.target.value)}
                      className="w-48 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-right"
                    />
                  ) : (
                    <input
                      type="number"
                      value={Number(val)}
                      onChange={e => setVal(field.key, Number(e.target.value))}
                      className="w-24 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-right"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {msg && (
        <div className={cn('flex items-center gap-2 p-3 rounded-xl text-sm', msg.type === 'ok' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400')}>
          {msg.type === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {msg.text}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button onClick={save} disabled={saving} className="flex-1 flex items-center justify-center py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-sm font-semibold hover:bg-zinc-800 transition-all disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          保存配置
        </button>
      </div>
    </div>
  );
}

// ── Version Panel ─────────────────────────────────────────────────────────────

function VersionPanel({ moduleId }: { moduleId: string }) {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/modules/${moduleId}/versions`);
      setInfo(await r.json());
    } catch {
      setMsg('获取版本信息失败');
    } finally {
      setLoading(false);
    }
  }, [moduleId]);

  useEffect(() => { refresh(); }, [refresh]);

  const action = async (url: string, body?: unknown) => {
    setBusy(url);
    setMsg(null);
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error || '操作失败');
      }
      setMsg('操作已触发，请查看系统日志了解进度...');
      setTimeout(refresh, 3000);
    } catch (e: any) {
      setMsg(e.message || '操作失败');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>;

  return (
    <div className="space-y-4">
      {/* Current state */}
      <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-900/60 rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div>
          <div className="text-xs text-zinc-500 mb-1">当前版本</div>
          <div className="font-mono font-semibold text-sm">{info?.current || '未知'}</div>
          <div className="text-xs text-zinc-500 mt-1">
            {info?.isLocked ? '🔒 版本已锁定' : `通道: ${info?.channel || 'release'}`}
          </div>
        </div>
        <div>
          {info?.isLocked
            ? <span className="flex items-center gap-1.5 text-amber-500 text-xs font-medium"><Lock className="w-4 h-4" /> 已锁定</span>
            : <span className="flex items-center gap-1.5 text-emerald-500 text-xs font-medium"><Unlock className="w-4 h-4" /> 跟踪最新</span>
          }
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <button
          onClick={() => action(`/api/modules/${moduleId}/update`)}
          disabled={!!busy || info?.isLocked}
          className="w-full flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-900/60 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-800 transition-colors disabled:opacity-40 text-sm font-medium"
        >
          <RefreshCw className={cn('w-4 h-4 text-blue-500', busy === `/api/modules/${moduleId}/update` && 'animate-spin')} />
          拉取最新版本并更新
        </button>

        {info?.isLocked && (
          <button
            onClick={() => action(`/api/modules/${moduleId}/unlock`)}
            disabled={!!busy}
            className="w-full flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 rounded-xl border border-amber-200 dark:border-amber-500/30 transition-colors disabled:opacity-40 text-sm font-medium text-amber-700 dark:text-amber-400"
          >
            <Unlock className="w-4 h-4" />
            解锁版本 (切回 release)
          </button>
        )}

        <div className="flex gap-2">
          {['release', 'staging'].map(ch => (
            <button
              key={ch}
              onClick={() => action(`/api/modules/${moduleId}/channel`, { channel: ch })}
              disabled={!!busy || info?.channel === ch}
              className={cn('flex-1 flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all disabled:opacity-40', info?.channel === ch ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-transparent' : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40')}
            >
              <GitBranch className="w-3.5 h-3.5" />
              {ch}
            </button>
          ))}
        </div>
      </div>

      {/* Historical versions */}
      {info?.tags && info.tags.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-zinc-500 mb-2">历史版本回退</div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {info.tags.map(tag => (
              <button
                key={tag}
                onClick={() => action(`/api/modules/${moduleId}/rollback`, { version: tag })}
                disabled={!!busy || tag === info.current}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 rounded-xl border border-zinc-200 dark:border-zinc-800 transition-colors disabled:opacity-40 text-sm"
              >
                <span className="font-mono text-sm">{tag}</span>
                {tag === info.current
                  ? <span className="text-[10px] text-emerald-500 font-bold">CURRENT</span>
                  : <HistoryIcon className="w-3.5 h-3.5 text-zinc-400" />
                }
              </button>
            ))}
          </div>
        </div>
      )}

      {msg && <div className="text-xs text-zinc-500 p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl">{msg}</div>}
    </div>
  );
}

// ── Backup Panel ──────────────────────────────────────────────────────────────

function BackupPanel({ moduleId }: { moduleId: string }) {
  const { data: backups, mutate } = useSWR<BackupEntry[]>(`/api/modules/${moduleId}/backups`, fetcher);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [restorePath, setRestorePath] = useState<string | null>(null);

  const doBackup = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/modules/${moduleId}/backup`, { method: 'POST' });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error || '备份失败');
      }
      setMsg({ type: 'ok', text: '备份任务已启动，请稍候查看日志...' });
      setTimeout(() => mutate(), 3000);
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message || '备份失败' });
    } finally {
      setBusy(false);
    }
  };

  const executeRestore = async (backupPath: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/modules/${moduleId}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupPath }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error || '恢复失败');
      }
      setMsg({ type: 'ok', text: '恢复任务已启动，完成后请重启服务！' });
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message || '恢复失败' });
    } finally {
      setBusy(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  return (
    <div className="space-y-4">
      <button
        onClick={doBackup}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-sm font-semibold hover:bg-zinc-800 transition-all disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
        立即备份
      </button>

      {msg && (
        <div className={cn('flex items-center gap-2 p-3 rounded-xl text-xs', msg.type === 'ok' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400')}>
          {msg.type === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {msg.text}
        </div>
      )}

      <div className="space-y-2">
        <div className="text-xs font-semibold text-zinc-500">备份列表</div>
        {!backups || backups.length === 0 ? (
          <div className="text-xs text-zinc-500 py-4 text-center">暂无备份文件</div>
        ) : (
          backups.map(b => (
            <div key={b.filename} className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-900/60 rounded-xl border border-zinc-200 dark:border-zinc-800">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="text-xs font-mono truncate">{b.filename}</div>
                  {b.source && (
                    <span className={cn(
                      'px-1.5 py-0.5 rounded-[4px] text-[9px] font-bold uppercase tracking-wider',
                      b.source.includes('TAVX') ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20' : 'bg-zinc-200/50 dark:bg-zinc-800 text-zinc-500 border border-zinc-300 dark:border-zinc-700'
                    )}>
                      {b.source}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5">{formatSize(b.size)} · {new Date(b.mtime).toLocaleString()}</div>
              </div>
              <button
                onClick={() => setRestorePath(b.filename)} // We show filename in confirm input
                disabled={busy}
                className="ml-3 shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                恢复
              </button>
            </div>
          ))
        )}
      </div>

      <DangerModal
        isOpen={!!restorePath}
        title="确认恢复备份"
        description={`警告：您即将恢复备份 "${restorePath}"！这将会覆盖当前酒馆中所有最新的聊天记录、设置和本地数据。未备份的聊天修改将彻底丢失，该操作不可逆！`}
        actionText="确认覆盖恢复"
        confirmWord="RESTORE"
        isLoading={busy}
        onConfirm={async () => {
          if (!restorePath) return;
          // Find path from backups matching filename
          const b = backups?.find(item => item.filename === restorePath);
          if (b) {
            await executeRestore(b.path);
          }
          setRestorePath(null);
        }}
        onClose={() => setRestorePath(null)}
      />
    </div>
  );
}

// ── Plugin Panel ──────────────────────────────────────────────────────────────

function PluginPanel({ moduleId }: { moduleId: string }) {
  const { data: plugins, mutate } = useSWR<PluginEntry[]>(`/api/modules/${moduleId}/plugins`, fetcher, { refreshInterval: 0 });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const install = async (pluginId: string) => {
    setBusy(pluginId);
    setMsg(null);
    try {
      const r = await fetch(`/api/modules/${moduleId}/plugins/${pluginId}/install`, { method: 'POST' });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error || '安装失败');
      }
      setMsg(`插件安装任务已提交，完成后请重启服务`);
      setTimeout(() => mutate(), 2000);
    } catch (e: any) {
      setMsg(e.message || '安装失败');
    } finally {
      setBusy(null);
    }
  };

  const uninstall = async (pluginId: string) => {
    if (!confirm('确认卸载该插件？')) return;
    setBusy(pluginId);
    setMsg(null);
    try {
      const r = await fetch(`/api/modules/${moduleId}/plugins/${pluginId}`, { method: 'DELETE' });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error || '卸载失败');
      }
      mutate();
    } catch (e: any) {
      setMsg(e.message || '卸载失败');
    } finally {
      setBusy(null);
    }
  };

  const executeResetAll = async () => {
    setResetLoading(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/modules/${moduleId}/plugins/reset`, { method: 'POST' });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error || '重置失败');
      }
      setMsg('所有第三方扩展已成功清除！');
      mutate();
    } catch (e: any) {
      setMsg(e.message || '重置失败');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {msg && <div className="text-xs text-blue-600 dark:text-blue-400 p-3 bg-blue-50 dark:bg-blue-500/10 rounded-xl">{msg}</div>}

      <div className="space-y-2">
        {!plugins ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>
        ) : plugins.map(p => (
          <div key={p.id} className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-900/60 rounded-xl border border-zinc-200 dark:border-zinc-800 gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className={cn('w-2 h-2 rounded-full shrink-0', p.isInstalled ? 'bg-emerald-500' : 'bg-zinc-400')} />
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{p.name}</div>
                <div className="text-[11px] text-zinc-500">{p.serverBranch ? '服务端' : '前端'} 扩展</div>
              </div>
            </div>
            <div className="shrink-0">
              {p.isInstalled ? (
                <button
                  onClick={() => uninstall(p.id)}
                  disabled={busy === p.id}
                  className="p-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                >
                  {busy === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              ) : (
                <button
                  onClick={() => install(p.id)}
                  disabled={busy === p.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg text-xs font-semibold hover:bg-zinc-800 transition-all disabled:opacity-50"
                >
                  {busy === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  安装
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => setShowResetConfirm(true)}
        className="w-full flex items-center justify-center gap-2 py-2.5 text-red-500 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-xl border border-red-200 dark:border-red-500/30 text-sm font-medium transition-colors"
      >
        <Trash2 className="w-4 h-4" />
        重置所有第三方扩展
      </button>

      <DangerModal
        isOpen={showResetConfirm}
        title="确认重置所有插件"
        description="警告：您即将删除在酒馆中安装的所有第三方扩展插件！此操作将清空公网/本地的所有第三方扩展插件目录，且此操作不可逆！"
        actionText="确认清除全部插件"
        confirmWord="RESET"
        isLoading={resetLoading}
        onConfirm={async () => {
          await executeResetAll();
          setShowResetConfirm(false);
        }}
        onClose={() => setShowResetConfirm(false)}
      />
    </div>
  );
}

// ── Reset Password Panel ───────────────────────────────────────────────────────

function PasswordPanel({ moduleId }: { moduleId: string }) {
  const [username, setUsername] = useState('default-user');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const reset = async () => {
    if (!password) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/modules/${moduleId}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!r.ok) throw new Error(await r.text());
      setMsg({ type: 'ok', text: '密码已重置！' });
      setPassword('');
    } catch (e: unknown) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium mb-1.5">用户名</label>
        <input value={username} onChange={e => setUsername(e.target.value)} className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1.5">新密码</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
      </div>
      {msg && (
        <div className={cn('flex items-center gap-2 p-3 rounded-xl text-xs', msg.type === 'ok' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400')}>
          {msg.text}
        </div>
      )}
      <button onClick={reset} disabled={busy || !password} className="w-full py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-sm font-semibold hover:bg-zinc-800 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
        重置密码
      </button>
    </div>
  );
}

// ── Network Panel (Gateway Config) ──────────────────────────────────────────

function NetworkPanel({ module, onSaved }: { module: ModuleInfo; onSaved?: () => void }) {
  const [config, setConfig] = useState<Record<string, unknown>>(module.config || {});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/modules/${module.id}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (!r.ok) throw new Error('保存失败');
      setMsg({ type: 'ok', text: '网络与网关配置已保存生效！' });
      if (onSaved) onSaved();
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-4 bg-blue-50 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/20 rounded-xl">
        <h4 className="text-sm font-semibold flex items-center mb-1 text-blue-700 dark:text-blue-400">
          <Globe className="w-4 h-4 mr-1.5" /> 零信任公网访问 (Zero Trust Proxy)
        </h4>
        <p className="text-xs text-blue-600/80 dark:text-blue-400/80 leading-relaxed mb-4">
          当且仅当启动了 Cloudflare 核心引擎，且设置了有效的域名时，LexHub 将自动为您完成内网穿透与反向代理。
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">外网域名 (publicHost)</label>
            <input 
              type="text" 
              value={(config.publicHost as string) || ''} 
              onChange={e => setConfig({...config, publicHost: e.target.value})} 
              placeholder="例如: tavern.myhome.com" 
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 transition-shadow outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">本地端口 (publicPort)</label>
            <input 
              type="number" 
              value={(config.publicPort as number) || ''} 
              onChange={e => setConfig({...config, publicPort: Number(e.target.value)})} 
              placeholder="8000" 
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 transition-shadow outline-none"
            />
          </div>
        </div>
      </div>

      {msg && (
        <div className={cn('flex items-center gap-2 p-3 rounded-xl text-xs', msg.type === 'ok' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400')}>
          {msg.text}
        </div>
      )}

      <button onClick={save} disabled={saving} className="w-full flex items-center justify-center py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-sm font-semibold hover:bg-zinc-800 transition-all disabled:opacity-50">
        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
        保存网络配置
      </button>
    </div>
  );
}

// ── Main SillyTavern Detail Panel ─────────────────────────────────────────────

interface Props {
  module: ModuleInfo;
  onClose: () => void;
  onAction: (id: string, action: 'start' | 'stop') => Promise<void>;
  loadingAction: string | null;
}

export default function SillyTavernPanel({ module, onClose, onAction, loadingAction }: Props) {
  const isRunning = module.status === 'RUNNING';

  const sections = [
    { key: 'network', label: '网络与域名网关', icon: <Globe className="w-4 h-4 text-blue-500" />, content: <NetworkPanel module={module} /> },
    { key: 'app-config', label: 'SillyTavern 配置', icon: <Settings className="w-4 h-4 text-zinc-500" />, content: <AppConfigPanel moduleId={module.id} /> },
    { key: 'versions', label: '版本管理', icon: <GitBranch className="w-4 h-4 text-purple-500" />, content: <VersionPanel moduleId={module.id} /> },
    { key: 'plugins', label: '插件管理', icon: <Puzzle className="w-4 h-4 text-amber-500" />, content: <PluginPanel moduleId={module.id} /> },
    { key: 'backup', label: '备份与恢复', icon: <Archive className="w-4 h-4 text-emerald-500" />, content: <BackupPanel moduleId={module.id} /> },
    { key: 'password', label: '重置密码', icon: <KeyRound className="w-4 h-4 text-red-500" />, content: <PasswordPanel moduleId={module.id} /> },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex overflow-hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="relative ml-auto h-full w-full max-w-2xl bg-white dark:bg-zinc-950 shadow-2xl flex flex-col animate-in slide-in-from-right-10 duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800/60 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{module.icon || '🎭'}</span>
            <div>
              <h2 className="text-lg font-bold">{module.name}</h2>
              <StatusBadge status={module.status} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isRunning ? (
              <button
                onClick={() => onAction(module.id, 'stop')}
                disabled={loadingAction === `${module.id}-stop`}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 transition-all disabled:opacity-50"
              >
                {loadingAction === `${module.id}-stop` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4 fill-current" />}
                停止
              </button>
            ) : (
              <button
                onClick={() => onAction(module.id, 'start')}
                disabled={loadingAction === `${module.id}-start`}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-xl text-sm font-semibold hover:bg-emerald-600 transition-all disabled:opacity-50"
              >
                {loadingAction === `${module.id}-start` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                启动
              </button>
            )}
            <button onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {sections.map(s => (
            <SectionCard key={s.key} title={s.label} icon={s.icon}>
              {s.content}
            </SectionCard>
          ))}
        </div>
      </div>
    </div>
  );
}
