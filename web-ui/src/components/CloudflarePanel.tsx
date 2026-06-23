import useSWR from 'swr';
import { useState } from 'react';
import { Cloud, ExternalLink, Link as LinkIcon, PowerOff, RefreshCw, Key } from 'lucide-react';
import { api } from '../api/client';
import { Network, Play, Save } from 'lucide-react';

export default function CloudflarePanel({ moduleId }: { moduleId: string }) {
  const [loading, setLoading] = useState(false);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [quickUrl, setQuickUrl] = useState<string | null>(null);
  const [targetUrl, setTargetUrl] = useState('http://127.0.0.1:8000');

  // Check cert status
  const { data: certStatus, mutate: mutateCert } = useSWR(
    moduleId === 'cloudflare' ? `/api/modules/${moduleId}/call/checkCert` : null,
    (url: string) => fetch(url, { method: 'POST' }).then(res => res.json())
  );

  const { data: settingsData, mutate: mutateSettings } = useSWR('/api/system/settings');
  const [gatewayDomain, setGatewayDomain] = useState('');
  
  // Set gateway domain initial value
  if (settingsData && !gatewayDomain && settingsData.gatewayCookieDomain) {
    setGatewayDomain(settingsData.gatewayCookieDomain.replace(/^\./, ''));
  }

  const handleLogin = async () => {
    setLoading(true);
    setAuthUrl(null);
    try {
      const res = await api.callMethod(moduleId, 'login');
      if (res.result?.ok) {
        setAuthUrl(res.result.url);
      } else {
        alert('登录失败: ' + res.result?.message);
      }
    } catch (e) {
      alert('调用失败: ' + String(e));
    } finally {
      setLoading(false);
    }
  };

  const checkAutoCert = async () => {
    setLoading(true);
    try {
      const res = await api.callMethod(moduleId, 'scanDownloadsForCert');
      if (res.result?.found) {
        alert('成功！已自动检测并导入证书。');
        await mutateCert();
        setAuthUrl(null);
      } else {
        alert('未在下载目录中检测到 cert.pem，请确保在浏览器中完成授权。');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuickTunnel = async () => {
    setLoading(true);
    setQuickUrl(null);
    try {
      const res = await api.callMethod(moduleId, 'quickTunnel', { targetUrl });
      if (res.result?.ok) {
        setQuickUrl(res.result.url);
      } else {
        alert('启动失败: ' + res.result?.message);
      }
    } catch (e) {
      alert('调用失败: ' + String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleStopQuickTunnel = async () => {
    setLoading(true);
    try {
      await api.callMethod(moduleId, 'stopQuickTunnel');
      setQuickUrl(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGatewayDomain = async () => {
    if (!gatewayDomain) return;
    setLoading(true);
    try {
      await fetch('/api/system/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gatewayCookieDomain: '.' + gatewayDomain.replace(/^\./, '') })
      });
      await mutateSettings();
      alert('已保存。请确保您已将 *.' + gatewayDomain.replace(/^\./, '') + ' 解析到了 LexHub 隧道。');
    } finally {
      setLoading(false);
    }
  };

  const handleStartGateway = async () => {
    setLoading(true);
    try {
      await api.callMethod(moduleId, 'createGatewayTunnel');
      const webPort = settingsData?.webPort || 3000;
      await api.callMethod(moduleId, 'startGatewayTunnel', { webPort });
      alert('核心网关隧道已启动！现在各个模块即可使用前缀直达。');
    } catch (e) {
      alert('启动失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4 p-4 rounded-xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-900/10 space-y-4">
      <div className="flex items-center space-x-2 text-blue-800 dark:text-blue-200">
        <Cloud className="w-5 h-5" />
        <h3 className="font-medium text-sm">Cloudflare Tunnel 控制台</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Auth Box */}
        <div className="p-4 rounded-lg bg-white/60 dark:bg-zinc-900/60 border border-blue-100 dark:border-blue-800/30">
          <h4 className="text-xs font-semibold text-zinc-500 mb-3 flex items-center">
            <Key className="w-3.5 h-3.5 mr-1" /> 账号授权
          </h4>
          
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm">状态: 
              {certStatus?.result?.exists 
                ? <span className="text-green-600 font-medium ml-2">已登录</span> 
                : <span className="text-red-500 font-medium ml-2">未授权</span>}
            </span>
          </div>

          {!certStatus?.result?.exists && !authUrl && (
            <button 
              disabled={loading}
              onClick={handleLogin}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
            >
              {loading ? '正在获取授权链接...' : '启动浏览器授权'}
            </button>
          )}

          {authUrl && (
            <div className="space-y-3 animate-in fade-in">
              <a 
                href={authUrl} 
                target="_blank" 
                rel="noreferrer"
                className="w-full flex items-center justify-center py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors"
              >
                点击前往浏览器授权 <ExternalLink className="w-3.5 h-3.5 ml-1" />
              </a>
              <button 
                onClick={checkAutoCert}
                className="w-full flex items-center justify-center py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-sm rounded-lg transition-colors"
              >
                我已授权，检测凭证 <RefreshCw className="w-3.5 h-3.5 ml-1" />
              </button>
              <p className="text-[11px] text-zinc-500 leading-tight">
                提示: 若浏览器下载了 cert.pem，请点击上方按钮，系统会自动去下载目录寻找并导入。
              </p>
            </div>
          )}
        </div>

        {/* Quick Tunnel Box */}
        <div className="p-4 rounded-lg bg-white/60 dark:bg-zinc-900/60 border border-blue-100 dark:border-blue-800/30">
          <h4 className="text-xs font-semibold text-zinc-500 mb-3 flex items-center">
            <LinkIcon className="w-3.5 h-3.5 mr-1" /> 临时快速暴露 (Quick Tunnel)
          </h4>
          
          <div className="space-y-3">
            <input 
              type="text" 
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="http://127.0.0.1:8000"
              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
            />
            
            {!quickUrl ? (
              <button 
                disabled={loading}
                onClick={handleQuickTunnel}
                className="w-full flex items-center justify-center py-2 bg-zinc-800 hover:bg-zinc-900 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 text-sm rounded-lg transition-colors"
              >
                {loading ? '启动中...' : '启动穿透'}
              </button>
            ) : (
              <div className="space-y-2 animate-in fade-in">
                <div className="p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 rounded-lg">
                  <a href={quickUrl} target="_blank" rel="noreferrer" className="text-xs text-green-700 dark:text-green-400 break-all hover:underline flex items-center">
                    {quickUrl} <ExternalLink className="w-3 h-3 ml-1 flex-shrink-0" />
                  </a>
                </div>
                <button 
                  onClick={handleStopQuickTunnel}
                  className="w-full flex items-center justify-center py-1.5 bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 text-sm rounded-lg transition-colors"
                >
                  <PowerOff className="w-3.5 h-3.5 mr-1" /> 停止穿透
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Zero Trust Gateway Box */}
        <div className="p-4 rounded-lg bg-white/60 dark:bg-zinc-900/60 border border-blue-100 dark:border-blue-800/30 md:col-span-2">
          <h4 className="text-xs font-semibold text-zinc-500 mb-3 flex items-center">
            <Network className="w-3.5 h-3.5 mr-1" /> 主域名与零信任网关 (Zero Trust Gateway)
          </h4>
          
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 w-full">
              <label className="block text-xs text-zinc-500 mb-1">主根域名 (Root Domain)</label>
              <div className="flex space-x-2">
                <input 
                  type="text" 
                  value={gatewayDomain}
                  onChange={(e) => setGatewayDomain(e.target.value)}
                  placeholder="例如: myhome.com"
                  className="flex-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button 
                  onClick={handleSaveGatewayDomain}
                  disabled={loading || !gatewayDomain}
                  className="px-4 py-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-sm rounded-lg transition-colors flex items-center"
                >
                  <Save className="w-3.5 h-3.5 mr-1" /> 保存
                </button>
              </div>
            </div>
            <div className="flex-1 w-full">
              <button 
                onClick={handleStartGateway}
                disabled={loading || !certStatus?.result?.exists}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm rounded-lg transition-colors flex items-center justify-center font-medium shadow-sm"
              >
                <Play className="w-4 h-4 mr-1.5" /> 启动核心反代总闸隧道
              </button>
            </div>
          </div>
          <p className="text-[11px] text-zinc-500 mt-3 leading-relaxed">
            启用此功能前，请确保您已授权，并在 Cloudflare 控制台中将一条 <code>CNAME</code> 泛解析 (例如 <code>*.{gatewayDomain || 'yourdomain.com'}</code>) 指向了该隧道。
            启动总闸后，任何模块只需在设置中配置 <code>publicHost</code> (如 <code>tavern.{gatewayDomain || 'yourdomain.com'}</code>)，LexHub 即可自动对其进行零信任免密穿透反向代理。
          </p>
        </div>

      </div>
    </div>
  );
}
