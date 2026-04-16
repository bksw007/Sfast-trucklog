import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import ConfirmModal from '../components/ConfirmModal';

type DialogType = 'success' | 'warning' | 'info' | 'confirm';

type ConfirmOptions = {
  title: string;
  message: string;
  type?: DialogType;
  confirmText?: string;
  cancelText?: string;
};

type DialogContextType = {
  alert: (message: string, title?: string, type?: Exclude<DialogType, 'confirm'>) => Promise<void>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const DialogContext = createContext<DialogContextType | undefined>(undefined);

type ModalState = {
  isOpen: boolean;
  title: string;
  message: string;
  type: DialogType;
  confirmText: string;
  cancelText: string;
  showCancel: boolean;
};

const initialState: ModalState = {
  isOpen: false,
  title: '',
  message: '',
  type: 'info',
  confirmText: 'ตกลง',
  cancelText: 'ยกเลิก',
  showCancel: false,
};

export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [modalState, setModalState] = useState<ModalState>(initialState);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const closeModal = useCallback((confirmed: boolean) => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setModalState(initialState);
  }, []);

  const alert = useCallback((message: string, title = 'แจ้งเตือน', type: Exclude<DialogType, 'confirm'> = 'info') => {
    return new Promise<void>((resolve) => {
      resolverRef.current = () => {
        resolve();
      };
      setModalState({
        isOpen: true,
        title,
        message,
        type,
        confirmText: 'ตกลง',
        cancelText: 'ยกเลิก',
        showCancel: false,
      });
    });
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setModalState({
        isOpen: true,
        title: options.title,
        message: options.message,
        type: options.type ?? 'confirm',
        confirmText: options.confirmText ?? 'ยืนยัน',
        cancelText: options.cancelText ?? 'ยกเลิก',
        showCancel: true,
      });
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const originalAlert = window.alert.bind(window);
    window.alert = (message?: unknown) => {
      void alert(String(message ?? ''));
    };

    return () => {
      window.alert = originalAlert;
    };
  }, [alert]);

  const value = useMemo(() => ({ alert, confirm }), [alert, confirm]);

  return (
    <DialogContext.Provider value={value}>
      {children}
      <ConfirmModal
        isOpen={modalState.isOpen}
        onClose={() => closeModal(false)}
        onConfirm={() => closeModal(true)}
        title={modalState.title}
        message={modalState.message}
        type={modalState.type}
        confirmText={modalState.confirmText}
        cancelText={modalState.cancelText}
        showCancel={modalState.showCancel}
      />
    </DialogContext.Provider>
  );
};

export const useDialog = () => {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within DialogProvider');
  }
  return context;
};
