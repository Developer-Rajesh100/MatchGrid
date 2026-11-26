import React, { useEffect } from 'react';
import { X } from 'lucide-react';

/** Shared dialog pieces: an accessible modal that closes on Escape, a labelled field and an action row. */
export function Modal({ testId, title, titleClass = '', subtitle = null, wide = false, dismissOnBackdrop = false, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay ow-overlay" data-testid={testId} onClick={dismissOnBackdrop ? onClose : undefined}>
      <div className={`modal-card ow-modal ${wide ? 'ow-modal--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={dismissOnBackdrop ? (e) => e.stopPropagation() : undefined}>
        <div className="ow-modal__head">
          <div>
            <h3 className={`ow-modal__title ${titleClass}`}>{title}</h3>
            {subtitle && <div className="ow-muted">{subtitle}</div>}
          </div>
          <button type="button" className="ow-icon-btn" onClick={onClose} aria-label="Close dialog">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const Field = ({ label, children, className = '' }) => (
  <label className={`ow-field ${className}`}>
    <span className="ow-field__label">{label}</span>
    {children}
  </label>
);

export const Actions = ({ children, split = false }) => <div className={`ow-modal__actions ${split ? 'is-split' : ''}`}>{children}</div>;
