import { createSignal, onMount } from 'solid-js';
import type { IziToastSettings } from 'izitoast';

interface ToastOptions extends Partial<IziToastSettings> {
  message: string;
  id?: string;
}

interface ToastInstance {
  id: string;
  dismiss: () => void;
}

export function useToast() {
  const [activeToasts, setActiveToasts] = createSignal<ToastInstance[]>([]);
  const [iziToast, setIziToast] = createSignal<any>(null);

  const defaultSettings: Partial<IziToastSettings> = {
    position: 'topRight',
    timeout: 3000,
    progressBar: true,
    closeOnClick: true,
    pauseOnHover: true,
  };

  onMount(async () => {
    const iziToastModule = await import('izitoast');
    const toast = iziToastModule.default;

    // Import CSS only on client
    await import('izitoast/dist/css/iziToast.min.css');

    toast.settings({
      transitionIn: 'fadeInDown',
      transitionOut: 'fadeOutUp',
    });

    setIziToast(toast);
  });

  const createToast = (
    type: 'success' | 'error' | 'info',
    options: ToastOptions,
  ) => {
    const toast = iziToast();
    if (!toast) return;

    const id = options.id || Math.random().toString(36).substr(2, 9);
    const settings = {
      ...defaultSettings,
      ...options,
      onClosed: (_instance: any, toast: any, closedBy: any) => {
        setActiveToasts((prev) => prev.filter((t) => t.id !== id));
        options.onClosed?.(_instance, toast, closedBy);
      },
    };

    const { message, ...restSettings } = settings;
    toast[type]({ message, ...restSettings });

    setActiveToasts((prev) => [
      ...prev,
      {
        id,
        dismiss: () => toast.hide({}, 'toast'),
      },
    ]);

    return id;
  };

  return {
    success: (options: ToastOptions) => createToast('success', options),
    error: (options: ToastOptions) =>
      createToast('error', {
        ...options,
        timeout: 5000,
      }),
    info: (options: ToastOptions) => createToast('info', options),
    warning: (options: ToastOptions) =>
      createToast('info', {
        ...options,
        position: 'topRight',
        timeout: 5000,
        color: 'yellow',
      }),
    dismissAll: () => {
      const toast = iziToast();
      if (!toast) return;
      activeToasts().forEach((t) => t.dismiss());
      setActiveToasts([]);
    },
    getActiveToasts: () => activeToasts(),
  };
}
