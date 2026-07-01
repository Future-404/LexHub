import { useState, useEffect } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface DangerModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  actionText: string;
  confirmWord?: string; // If provided, user must type this exactly
  placeholder?: string;
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export default function DangerModal({
  isOpen,
  title,
  description,
  actionText,
  confirmWord,
  placeholder,
  isLoading,
  onConfirm,
  onClose,
}: DangerModalProps) {
  const [input, setInput] = useState('');

  useEffect(() => {
    if (isOpen) {
      setInput('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const canConfirm = !confirmWord || input === confirmWord;

  const handleConfirm = async () => {
    if (!canConfirm || isLoading) return;
    await onConfirm();
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-950 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800/80 animate-in zoom-in-95 duration-200 flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-150 dark:border-zinc-800/60 bg-red-500/5 dark:bg-red-500/5">
          <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-500/10 flex items-center justify-center text-red-500 shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">{title}</h3>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{description}</p>

          {confirmWord && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-350">
                请输入 <span className="font-mono text-red-500 bg-red-50 dark:bg-red-500/10 px-1.5 py-0.5 rounded font-bold">{confirmWord}</span> 以确认操作：
              </label>
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={placeholder || `输入 ${confirmWord}`}
                disabled={isLoading}
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-red-500 outline-none text-zinc-900 dark:text-zinc-100 font-mono"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-900/40 border-t border-zinc-150 dark:border-zinc-800/60 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm || isLoading}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 shadow-sm shadow-red-500/10"
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {actionText}
          </button>
        </div>
      </div>
    </div>
  );
}
