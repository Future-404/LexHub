import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function LogViewer({ moduleId, onClose }: { moduleId: string, onClose: () => void }) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    // 1. Fetch historical logs
    const fetchUrl = moduleId === 'system' ? '/api/system/logs?lines=200' : `/api/modules/${moduleId}/logs?type=stdout&lines=200`;
    fetch(fetchUrl, { signal: controller.signal })
      .then(res => res.text())
      .then(text => {
        if (!cancelled && text && text.trim()) setLogs(text.split('\n'));
      }).catch(() => {});

    // 2. Setup real-time updates
    if (moduleId === 'system') {
      // Polling for system logs
      const timer = setInterval(() => {
        fetch(fetchUrl)
          .then(res => res.text())
          .then(text => {
            if (!cancelled && text && text.trim()) setLogs(text.split('\n'));
          }).catch(() => {});
      }, 3000);
      return () => { cancelled = true; clearInterval(timer); controller.abort(); };
    } else {
      // WebSocket for module logs
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/logs?module_id=${moduleId}`;
      const ws = new WebSocket(wsUrl);
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event === 'log' && data.message) {
            setLogs(prev => [...prev, ...data.message.trimEnd().split('\n')].slice(-1000));
          } else if (['crashed', 'started', 'stopped'].includes(data.event)) {
            setLogs(prev => [...prev, `[System Event] Module ${data.event.toUpperCase()} at ${data.timestamp}`].slice(-1000));
          }
        } catch (e) {}
      };

      return () => { cancelled = true; ws.close(); controller.abort(); };
    }
  }, [moduleId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 md:p-12 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#09090b] border-0 sm:border border-zinc-200 dark:border-zinc-800 w-full max-w-5xl h-[100dvh] sm:h-full md:h-[80vh] rounded-none sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden relative">
        <div className="px-4 md:px-5 py-3 md:py-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-900/50 shrink-0">
          <div className="font-semibold flex items-center min-w-0">
            <span className="shrink-0 w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-green-500 mr-2 md:mr-3 animate-pulse"></span>
            <span className="truncate max-w-[200px] sm:max-w-xs">{moduleId}</span>
            <span className="ml-1 whitespace-nowrap">{t('common.logs')}</span>
          </div>
          <button onClick={onClose} className="p-1.5 md:p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors shrink-0">
            <X className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-5 bg-[#09090b] text-zinc-300 font-mono text-[12px] md:text-[13px] leading-relaxed whitespace-pre-wrap selection:bg-zinc-700">
          {logs.length === 0 ? (
            <span className="text-zinc-600 italic">Waiting for log stream...</span>
          ) : (
            logs.map((log, i) => <div key={i} className="break-all">{log}</div>)
          )}
        </div>
      </div>
    </div>
  );
}
