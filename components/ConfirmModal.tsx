import React from 'react';
import { X, CheckCircle2, AlertTriangle, Info } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message?: string;
  type?: 'confirm' | 'success' | 'warning' | 'info';
  confirmText?: string;
  cancelText?: string;
  data?: { label: string; value: string }[];
  showCancel?: boolean;
  showConfirm?: boolean;
  imagePreview?: string | null;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message,
  type = 'confirm',
  confirmText = 'ยืนยัน',
  cancelText = 'ยกเลิก',
  data,
  showCancel = true,
  showConfirm = true,
  imagePreview
}) => {
  if (!isOpen) return null;

  const iconClass = {
    confirm: 'modal-clay-icon-confirm',
    success: 'modal-clay-icon-success',
    warning: 'modal-clay-icon-warning',
    info: 'modal-clay-icon-info'
  };

  const buttonClass = {
    confirm: 'modal-clay-btn-confirm',
    success: 'modal-clay-btn-success',
    warning: 'modal-clay-btn-warning',
    info: 'modal-clay-btn-info'
  };

  const icons = {
    confirm: <AlertTriangle size={28} />,
    success: <CheckCircle2 size={28} />,
    warning: <AlertTriangle size={28} />,
    info: <Info size={28} />
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="modal-clay-backdrop absolute inset-0" 
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="modal-clay-panel relative w-full max-w-md p-6 shadow-2xl animate-fade-in">
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="modal-clay-close absolute right-4 top-4 p-1 transition-colors"
        >
          <X size={20} className="modal-clay-muted" />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className={`modal-clay-icon ${iconClass[type]} ${
            type === 'success' ? 'animate-bounce' : ''
          }`}>
            <span>{icons[type]}</span>
          </div>
        </div>
        
        {/* Title */}
        <h3 className="modal-clay-title text-xl text-center mb-2">
          {title}
        </h3>

        {/* Message */}
        {message && (
          <p className="modal-clay-muted text-center text-sm mb-4">
            {message}
          </p>
        )}

        {/* Image Preview */}
        {imagePreview && (
          <div className="modal-clay-soft mb-4 h-40 overflow-hidden border flex items-center justify-center">
            <img src={imagePreview} alt="Preview" className="h-full object-contain" />
          </div>
        )}

        {/* Data Review */}
        {data && data.length > 0 && (
          <div className="modal-clay-soft mb-4 max-h-60 overflow-y-auto rounded-xl p-4 space-y-2">
            {data.map((item, index) => (
              <div key={index} className="flex justify-between items-center py-1">
                <span className="modal-clay-muted text-sm">
                  {item.label}:
                </span>
                <span className="text-sm font-semibold text-[#34495e]">
                  {item.value || '-'}
                </span>
              </div>
            ))}
          </div>
        )}
        
        {/* Buttons */}
        {(showConfirm || showCancel) && (
          <div className={`flex gap-3 ${showCancel && showConfirm ? '' : 'justify-center'}`}>
            {showCancel && (
              <button 
                onClick={onClose}
                className="modal-clay-btn modal-clay-btn-secondary flex-1 px-4 py-3"
              >
                {cancelText}
              </button>
            )}
            {showConfirm && (
              <button 
                onClick={onConfirm}
                className={`modal-clay-btn ${buttonClass[type]} ${showCancel ? 'flex-1' : 'px-8'} py-3`}
              >
                {confirmText}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ConfirmModal;
