import { create } from 'zustand';

export type ToastKind = 'info' | 'error' | 'success';

interface Toast {
  id: number;
  text: string;
  kind: ToastKind;
}

export interface ConfirmRequest {
  title: string;
  body?: string;
  confirmLabel: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

interface FeedbackState {
  toasts: Toast[];
  confirm: ConfirmRequest | null;
}

export const useFeedback = create<FeedbackState>()(() => ({ toasts: [], confirm: null }));

let nextId = 1;

export function dismissToast(id: number) {
  useFeedback.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

/** A brief note that doesn't interrupt. Problems stay up longer, since they may need reading twice. */
export function toast(text: string, kind: ToastKind = 'info') {
  const id = nextId++;
  useFeedback.setState((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
  setTimeout(() => dismissToast(id), kind === 'error' ? 9000 : 5000 + text.length * 30);
}

export function toastError(e: unknown) {
  toast((e as Error).message, 'error');
}

/** Resolves true once the person confirms, false if they back out. */
export function askConfirm(request: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => useFeedback.setState({ confirm: { ...request, resolve } }));
}
