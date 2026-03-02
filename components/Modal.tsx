import React from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[85] flex items-start justify-center overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:items-center sm:py-8">
      {/* Backdrop */}
      <div 
        className="modal-clay-backdrop absolute inset-0" 
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="modal-clay-panel relative my-auto w-full max-w-md p-6 shadow-2xl animate-fade-in max-h-[calc(100dvh-2rem)] overflow-y-auto">
        {/* Header */}
        <div className="modal-clay-header mb-4 flex items-center justify-between pb-3">
          <h3 className="modal-clay-title text-lg">
            {title}
          </h3>
          <button 
            onClick={onClose}
            className="modal-clay-close p-1 transition-colors"
          >
            <X size={20} className="modal-clay-muted" />
          </button>
        </div>
        
        {/* Body */}
        {children}
      </div>
    </div>
  );
};

export default Modal;
