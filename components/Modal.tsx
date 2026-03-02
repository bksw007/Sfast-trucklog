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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="modal-clay-backdrop absolute inset-0" 
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="modal-clay-panel relative w-full max-w-md p-6 shadow-2xl animate-fade-in">
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
