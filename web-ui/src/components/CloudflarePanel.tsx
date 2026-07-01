import useSWR from 'swr';
import { useState, useEffect } from 'react';
import { Cloud, ExternalLink, Link as LinkIcon, PowerOff, RefreshCw, Key, Download, Loader2 } from 'lucide-react';
import { api } from '../api/client';
import { Network, Play, Save, Trash2, Plus, Globe, Upload } from 'lucide-react';

export default function CloudflarePanel({ moduleId }: { moduleId: string }) {
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [quickUrl, setQuickUrl] = useState<string | null>(null);
  const [targetUrl, setTargetUrl] = useState('http://127.0.0.1:8000');

  const { data: customIngress, mutate: mutateIngress } = useSWR(
    moduleId === 'cloudflare' ? `/api/system/ingress` : null,
    (url: string) => fetch(url).then(r => r.json())
  );
  const [newHostname, setNewHostname] = useState('');
  const [newTargetUrl, setNewTargetUrl] = useState('http://127.0.0.1:4000');
  const [addingIngress, setAddingIngress] = useState(false);

  const handleAddIngress = async () => {
    if (!newHostname || !newTargetUrl) return;
    setAddingIngress(true);
    try {
      await fetch('/api/system/ingress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostname: newHostname, targetUrl: newTargetUrl })
      });
      setNewHostname('');
      mutateIngress();
    } catch(e) {}
    setAddingIngress(false);
  };

  const handleDelIngress = async (hostname: string) => {
    try {
      await fetch(`/api/system/ingress/${encodeURIComponent(hostname)}`, { method: 'DELETE' });
      mutateIngress();
    } catch(e) {}
  };

  // Check cert status
  const { data: certStatus, mutate: mutateCert, isLoading: isCertLoading } = useSWR(
    moduleId === 'cloudflare' ? `/api/modules/${moduleId}/call/checkCert` : null,
    (url: string) => fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([])
    }).then(res => res.json())
  );

  const handleInstall = async () => {
    setInstalling(true);
    try {
      const r = await fetch(`/api/modules/${moduleId}/install`, { method: 'POST' });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error || '安装失败');
      }
      alert('安装任务已提交，正在后台下载 cloudflared 二进制文件，请稍候查看系统日志。');
      // Poll cert status to update
      let attempts = 0;
      const interval = setInterval(async () => {
        const check = await mutateCert();
        attempts++;
        if (check?.result?.binExists || attempts > 10) {
          clearInterval(interval);
        }
      }, 5000);
    } catch (e: any) {
      alert(e.message || '安装失败');
    } finally {
      setInstalling(false);
    }
  };

  const { data: settingsData, mutate: mutateSettings } = useSWR('/api/system/settings');
  const [gatewayDomain, setGatewayDomain] = useState('');
  
  useEffect(() => {
    if (settingsData && settingsData.gatewayCookieDomain) {
      setGatewayDomain(settingsData.gatewayCookieDomain.replace(/^\./, ''));
    }
  }, [settingsData]);

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

  const handleUploadCert = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      if (!text) return;
      try {
        setLoading(true);
        await api.callMethod(moduleId, 'uploadCert', { certContent: text });
        await mutateCert();
        alert('凭证上传成功！');
      } catch (err) {
        alert('上传失败: ' + err);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
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

      {isCertLoading ? (
        <div className="flex justify-center p-8">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
        </div>
      ) : !certStatus?.result?.binExists ? (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 flex items-center justify-between gap-4 animate-in fade-in">
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-amber-850 dark:text-amber-400">未检测到 Cloudflare 隧道引擎</h4>
            <p className="text-xs text-amber-600 dark:text-amber-500/80">首次使用，请先下载安装 Cloudflare 隧道核心引擎程序。</p>
          </div>
          <button
            onClick={handleInstall}
            disabled={installing}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shrink-0 transition-colors flex items-center gap-1.5"
          >
            {installing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            下载安装引擎
          </button>
        </div>
      ) : null}

      {!isCertLoading && certStatus?.result?.binExists && (
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
                <div className="flex gap-2">
                  <button 
                    onClick={checkAutoCert}
                    className="flex-1 flex items-center justify-center py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-sm rounded-lg transition-colors"
                  >
                    检测并导入 <RefreshCw className="w-3.5 h-3.5 ml-1" />
                  </button>
                  <label className="flex-1 flex items-center justify-center py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-sm rounded-lg transition-colors cursor-pointer">
                    手动上传 <Upload className="w-3.5 h-3.5 ml-1" />
                    <input type="file" className="hidden" onChange={handleUploadCert} />
                  </label>
                </div>
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
              提示: 启动总闸后，系统将在每次配置模块或添加映射规则时，自动向 Cloudflare 注册对应的 CNAME 记录，并将流量安全代理至本地服务。
            </p>
          </div>

          {/* Custom Ingress Box */}
          <div className="p-4 rounded-lg bg-white/60 dark:bg-zinc-900/60 border border-blue-100 dark:border-blue-800/30 md:col-span-2">
            <h4 className="text-xs font-semibold text-zinc-500 mb-3 flex items-center justify-between">
              <span className="flex items-center"><Globe className="w-3.5 h-3.5 mr-1" /> 自定义外网映射规则 (Custom Ingress)</span>
            </h4>
            
            <div className="flex flex-col md:flex-row gap-3 items-end mb-4">
              <div className="flex-1 w-full">
                <label className="block text-xs text-zinc-500 mb-1">自定义外网域名</label>
                <input 
                  type="text" 
                  value={newHostname}
                  onChange={(e) => setNewHostname(e.target.value)}
                  placeholder="例如: api.myhome.com"
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex-1 w-full">
                <label className="block text-xs text-zinc-500 mb-1">目标本地服务 (Target URL)</label>
                <input 
                  type="text" 
                  value={newTargetUrl}
                  onChange={(e) => setNewTargetUrl(e.target.value)}
                  placeholder="例如: http://127.0.0.1:4000"
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="w-full md:w-auto">
                <button 
                  onClick={handleAddIngress}
                  disabled={addingIngress || !newHostname || !newTargetUrl}
                  className="w-full md:w-auto px-4 py-2 bg-zinc-800 hover:bg-zinc-900 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 text-sm rounded-lg transition-colors flex items-center justify-center font-medium disabled:opacity-50"
                >
                  {addingIngress ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />} 添加映射
                </button>
              </div>
            </div>

            {customIngress && customIngress.length > 0 ? (
              <div className="space-y-2">
                {customIngress.map((rule: any) => (
                  <div key={rule.hostname} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/50 rounded-lg gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">{rule.hostname}</div>
                      <div className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5"><LinkIcon className="w-3 h-3" /> {rule.targetUrl}</div>
                    </div>
                    <button 
                      onClick={() => handleDelIngress(rule.hostname)}
                      className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors self-end sm:self-auto"
                      title="删除规则"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-center py-4 text-zinc-400 bg-zinc-50 dark:bg-zinc-800/20 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-700/50">
                暂无自定义映射规则
              </div>
            )}
            
            <p className="text-[11px] text-zinc-500 mt-3 leading-relaxed">
              提示: 添加自定义规则后，LexHub 将自动尝试在 Cloudflare DNS 中配置 CNAME 解析并绑定到 <code>lexhub-gateway</code>。
              这些规则将直接注入到底层 API 网关中，生效无需重启。
            </p>
          </div>

        </div>
      )}
    </div>
  );
}
