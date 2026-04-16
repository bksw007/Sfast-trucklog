import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import LoadingIndicator from './LoadingIndicator';

interface SyncModalProps {
  isOpen: boolean;
  status: 'syncing' | 'success' | 'error';
  progress?: number;
  detail?: string;
  onClose?: () => void;
  errorMessage?: string;
}

const SyncModal: React.FC<SyncModalProps> = ({ isOpen, status, progress = 12, detail, onClose, errorMessage }) => {
  const [displayProgress, setDisplayProgress] = useState(progress);

  useEffect(() => {
    if (!isOpen) {
      setDisplayProgress(progress);
      return undefined;
    }

    setDisplayProgress((prev) => {
      const target = Math.round(progress);
      if (target >= prev) return target;
      return target;
    });
    return undefined;
  }, [isOpen, progress]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="modal-clay-backdrop absolute inset-0" />
      
      <div className="relative w-full max-w-md animate-fade-in">
        {status === 'syncing' && (
          <LoadingIndicator
            title="กำลังซิงค์ข้อมูล"
            subtitle="กำลังเชื่อมต่อกับ Firebase และโหลดข้อมูลล่าสุด"
            detail={detail}
            progress={displayProgress}
          />
        )}

        {status === 'success' && (
          <div className="modal-clay-panel relative rounded-3xl p-8 text-center shadow-2xl">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 size={40} />
            </div>
            <h2 className="modal-clay-title text-2xl">ซิงค์สำเร็จ!</h2>
            <p className="modal-clay-muted mt-2 text-sm">{detail || 'ข้อมูลอัปเดตล่าสุดแล้ว'}</p>
            <div className="mt-5 text-4xl font-black text-emerald-600">100%</div>
          </div>
        )}

        {status === 'error' && (
          <div className="modal-clay-panel relative rounded-3xl p-8 text-center shadow-2xl">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-rose-100 text-rose-600">
              <AlertCircle size={40} />
            </div>
            <h2 className="modal-clay-title text-2xl">เกิดข้อผิดพลาด</h2>
            <p className="modal-clay-muted mt-2 text-sm">{errorMessage || detail || 'ไม่สามารถเชื่อมต่อได้'}</p>
            <div className="mt-5 text-3xl font-black text-amber-500">{Math.round(displayProgress)}%</div>
          </div>
        )}

        {status === 'error' && onClose && (
          <button
            onClick={onClose}
            className="modal-clay-btn modal-clay-btn-warning mt-4 w-full px-6 py-3"
          >
            ลองใหม่
          </button>
        )}
      </div>
    </div>
  );
};

export default SyncModal;
