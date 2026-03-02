import React from 'react';
import { Loader2, Cloud, CheckCircle2, AlertCircle } from 'lucide-react';

interface SyncModalProps {
  isOpen: boolean;
  status: 'syncing' | 'success' | 'error';
  onClose?: () => void;
  errorMessage?: string;
}

const SyncModal: React.FC<SyncModalProps> = ({ isOpen, status, onClose, errorMessage }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="modal-clay-backdrop absolute inset-0" />
      
      {/* Modal Content */}
      <div className="modal-clay-panel relative w-full max-w-sm rounded-3xl p-8 text-center shadow-2xl animate-fade-in">
        {/* Icon Animation */}
        <div className="mb-6 flex justify-center">
          {status === 'syncing' && (
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-[#aec6cf]/35 animate-ping" />
              <div className="modal-clay-icon modal-clay-icon-info relative h-20 w-20">
                <Cloud className="animate-pulse" size={36} />
              </div>
            </div>
          )}
          {status === 'success' && (
            <div className="modal-clay-icon modal-clay-icon-success h-20 w-20 animate-bounce">
              <CheckCircle2 size={40} />
            </div>
          )}
          {status === 'error' && (
            <div className="modal-clay-icon h-20 w-20 bg-[#ffd1dc] text-[#d65a5a]">
              <AlertCircle size={40} />
            </div>
          )}
        </div>

        {/* Title */}
        <h2 className="modal-clay-title text-2xl mb-2">
          {status === 'syncing' && 'กำลังซิงค์ข้อมูล'}
          {status === 'success' && 'ซิงค์สำเร็จ!'}
          {status === 'error' && 'เกิดข้อผิดพลาด'}
        </h2>

        {/* Description */}
        <p className="modal-clay-muted text-sm mb-4">
          {status === 'syncing' && 'กำลังเชื่อมต่อกับ Firebase...'}
          {status === 'success' && 'ข้อมูลอัพเดทล่าสุดแล้ว'}
          {status === 'error' && (errorMessage || 'ไม่สามารถเชื่อมต่อได้')}
        </p>

        {/* Loading Dots for syncing */}
        {status === 'syncing' && (
          <div className="flex justify-center gap-1 mt-4">
            <div className="h-2 w-2 animate-bounce rounded-full bg-[#8aaec3]" style={{ animationDelay: '0ms' }} />
            <div className="h-2 w-2 animate-bounce rounded-full bg-[#8aaec3]" style={{ animationDelay: '150ms' }} />
            <div className="h-2 w-2 animate-bounce rounded-full bg-[#8aaec3]" style={{ animationDelay: '300ms' }} />
          </div>
        )}

        {/* Close Button for error only (retry) */}
        {status === 'error' && onClose && (
          <button
            onClick={onClose}
            className="modal-clay-btn modal-clay-btn-warning mt-4 px-6 py-2"
          >
            ลองใหม่
          </button>
        )}
      </div>
    </div>
  );
};

export default SyncModal;
