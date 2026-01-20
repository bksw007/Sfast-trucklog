import React from 'react';
import { X, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

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
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  if (!isOpen) return null;

  const iconColors = {
    confirm: 'from-accent-primary to-accent-secondary',
    success: 'from-green-400 to-green-600',
    warning: 'from-amber-400 to-amber-600',
    info: 'from-blue-400 to-blue-600'
  };

  const buttonColors = {
    confirm: 'bg-gradient-to-r from-accent-primary to-accent-secondary',
    success: 'bg-green-500 hover:bg-green-600',
    warning: 'bg-amber-500 hover:bg-amber-600',
    info: 'bg-blue-500 hover:bg-blue-600'
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
        className="absolute inset-0 bg-black/50 backdrop-blur-sm" 
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className={`relative w-full max-w-md rounded-2xl p-6 shadow-2xl animate-fade-in ${
        isDark ? 'bg-dark-card' : 'bg-light-card'
      }`}>
        {/* Close Button */}
        <button 
          onClick={onClose}
          className={`absolute top-4 right-4 p-1 rounded-lg transition-colors ${
            isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
          }`}
        >
          <X size={20} className={isDark ? 'text-dark-muted' : 'text-light-muted'} />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${iconColors[type]} flex items-center justify-center shadow-lg ${
            type === 'success' ? 'animate-bounce' : ''
          }`}>
            <span className="text-white">{icons[type]}</span>
          </div>
        </div>
        
        {/* Title */}
        <h3 className={`text-xl font-bold text-center mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
          {title}
        </h3>

        {/* Message */}
        {message && (
          <p className={`text-center text-sm mb-4 ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
            {message}
          </p>
        )}

        {/* Image Preview */}
        {imagePreview && (
          <div className="mb-4 rounded-xl overflow-hidden shadow-sm h-40 flex justify-center items-center bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <img src={imagePreview} alt="Preview" className="h-full object-contain" />
          </div>
        )}

        {/* Data Review */}
        {data && data.length > 0 && (
          <div className={`max-h-60 overflow-y-auto rounded-xl p-4 mb-4 space-y-2 ${
            isDark ? 'bg-dark-bg' : 'bg-light-bg'
          }`}>
            {data.map((item, index) => (
              <div key={index} className="flex justify-between items-center py-1">
                <span className={`text-sm ${isDark ? 'text-dark-muted' : 'text-light-muted'}`}>
                  {item.label}:
                </span>
                <span className={`text-sm font-medium ${isDark ? 'text-dark-text' : 'text-light-text'}`}>
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
                className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all ${
                  isDark 
                    ? 'bg-dark-bg hover:bg-white/10 text-dark-text' 
                    : 'bg-light-bg hover:bg-black/5 text-light-text'
                }`}
              >
                {cancelText}
              </button>
            )}
            {showConfirm && (
              <button 
                onClick={onConfirm}
                className={`${showCancel ? 'flex-1' : 'px-8'} py-3 rounded-xl font-bold text-white transition-all hover:brightness-110 ${buttonColors[type]}`}
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
