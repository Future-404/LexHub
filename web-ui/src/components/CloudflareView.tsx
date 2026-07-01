import React from 'react';
import CloudflarePanel from './CloudflarePanel';

export default function CloudflareView() {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">CF 穿透网关</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            提供端到端的隧道穿透服务，实现无感知的内网穿透与公网反向代理。
          </p>
        </div>
      </div>
      
      <div className="glass-panel p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800/60">
        <CloudflarePanel moduleId="cloudflare" />
      </div>
    </div>
  );
}
