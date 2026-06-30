export const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('API Error');
  return res.json();
});

export const api = {
  install: (id: string) => fetch(`/api/modules/${id}/install`, { method: 'POST' }),
  start: (id: string) => fetch(`/api/modules/${id}/start`, { method: 'POST' }),
  stop: (id: string) => fetch(`/api/modules/${id}/stop`, { method: 'POST' }),
  uninstall: (id: string) => fetch(`/api/modules/${id}`, { method: 'DELETE' }),
  getAutostart: () => fetch('/api/system/autostart').then(res => res.json()),
  setAutostart: (enabled: boolean) => fetch('/api/system/autostart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled })
  }).then(res => res.json()),
  setMirror: (action: string) => fetch('/api/system/mirrors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action })
  }).then(res => res.json()),
  scanMigrate: () => fetch('/api/system/migrate/scan').then(res => res.json()),
  executeMigrate: (id: string) => fetch(`/api/system/migrate/execute/${id}`, { method: 'POST' }).then(res => res.json()),
  callMethod: (id: string, method: string, args: Record<string, unknown> = {}) => fetch(`/api/modules/${id}/call/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  }).then(res => res.json()),
};
