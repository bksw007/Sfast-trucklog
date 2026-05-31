import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  panelClassName?: string;
  bodyClassName?: string;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, panelClassName = '', bodyClassName = '' }) => {
  useEffect(() => {
    if (!isOpen) return undefined;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const resolvedBodyClassName = bodyClassName || 'hide-scrollbar max-h-[calc(100dvh-8rem)] overflow-y-auto pr-1 md:max-h-[calc(100dvh-11rem)]';
  const resolvedPanelClassName = panelClassName || 'md:max-w-xl lg:max-w-2xl';

  return (
    <div className="fixed inset-0 z-[85] flex items-start justify-center overflow-hidden px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:items-center sm:py-8 md:px-6 lg:px-10">
      {/* Backdrop */}
      <div 
        className="modal-clay-backdrop absolute inset-0" 
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className={`modal-clay-panel relative my-auto w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-hidden p-6 shadow-2xl animate-fade-in md:p-7 ${resolvedPanelClassName}`}>
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
        <div className={resolvedBodyClassName}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
