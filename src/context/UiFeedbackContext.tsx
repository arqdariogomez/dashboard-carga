import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  tone: ToastTone;
  message: string;
}

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: 'default' | 'danger';
}

interface PromptOptions {
  title: string;
  label?: string;
  initialValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
}

interface UiFeedbackContextValue {
  toast: (tone: ToastTone, message: string) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  promptText: (options: PromptOptions) => Promise<string | null>;
}

const UiFeedbackContext = createContext<UiFeedbackContextValue | null>(null);

export function UiFeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { open: boolean }) | null>(null);
  const [promptState, setPromptState] = useState<(PromptOptions & { open: boolean; value: string }) | null>(null);
  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);
  const promptResolverRef = useRef<((value: string | null) => void) | null>(null);

  const toast = useCallback((tone: ToastTone, message: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, tone, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2600);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    setConfirmState({ ...options, open: true });
    return new Promise<boolean>((resolve) => {
      confirmResolverRef.current = resolve;
    });
  }, []);

  const promptText = useCallback((options: PromptOptions) => {
    setPromptState({ ...options, open: true, value: options.initialValue || '' });
    return new Promise<string | null>((resolve) => {
      promptResolverRef.current = resolve;
    });
  }, []);

  const value = useMemo(() => ({ toast, confirm, promptText }), [toast, confirm, promptText]);

  return (
    <UiFeedbackContext.Provider value={value}>
      {children}

      <div className="fixed bottom-4 right-4 z-[240] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-lg border px-3.5 py-2.5 text-xs shadow-lg fade-in ${
              t.tone === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : t.tone === 'error'
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-white text-text-primary border-border'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>

      {confirmState?.open && (
        <div className="fixed inset-0 z-[250] bg-black/30 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-white shadow-2xl p-4">
            <div className="text-sm font-semibold text-text-primary">{confirmState.title}</div>
            {confirmState.message && (
              <div className="text-xs text-text-secondary mt-1.5">{confirmState.message}</div>
            )}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-bg-secondary"
                onClick={() => {
                  setConfirmState(null);
                  confirmResolverRef.current?.(false);
                  confirmResolverRef.current = null;
                }}
              >
                {confirmState.cancelText || 'Cancelar'}
              </button>
              <button
                className={`px-3 py-1.5 text-xs rounded-md text-white ${
                  confirmState.tone === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-text-primary hover:bg-[#2c2a25]'
                }`}
                onClick={() => {
                  setConfirmState(null);
                  confirmResolverRef.current?.(true);
                  confirmResolverRef.current = null;
                }}
              >
                {confirmState.confirmText || 'Aceptar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {promptState?.open && (
        <div className="fixed inset-0 z-[250] bg-black/30 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-white shadow-2xl p-4">
            <div className="text-sm font-semibold text-text-primary">{promptState.title}</div>
            {promptState.label && <label className="block text-xs text-text-secondary mt-3 mb-1">{promptState.label}</label>}
            <input
              autoFocus
              value={promptState.value}
              onChange={(e) => setPromptState((prev) => (prev ? { ...prev, value: e.target.value } : prev))}
              placeholder={promptState.placeholder}
              className="w-full h-9 rounded-md border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-blue-100"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const value = promptState.value.trim();
                  setPromptState(null);
                  promptResolverRef.current?.(value || null);
                  promptResolverRef.current = null;
                }
                if (e.key === 'Escape') {
                  setPromptState(null);
                  promptResolverRef.current?.(null);
                  promptResolverRef.current = null;
                }
              }}
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-bg-secondary"
                onClick={() => {
                  setPromptState(null);
                  promptResolverRef.current?.(null);
                  promptResolverRef.current = null;
                }}
              >
                {promptState.cancelText || 'Cancelar'}
              </button>
              <button
                className="px-3 py-1.5 text-xs rounded-md text-white bg-text-primary hover:bg-[#2c2a25]"
                onClick={() => {
                  const value = promptState.value.trim();
                  setPromptState(null);
                  promptResolverRef.current?.(value || null);
                  promptResolverRef.current = null;
                }}
              >
                {promptState.confirmText || 'Aceptar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </UiFeedbackContext.Provider>
  );
}

export function useUiFeedback() {
  const ctx = useContext(UiFeedbackContext);
  if (!ctx) throw new Error('useUiFeedback must be used within UiFeedbackProvider');
  return ctx;
}

