import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ConfirmDialogProps {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onCancel]);

  return createPortal(
    <div
      className="modal"
      role="presentation"
      onMouseDown={(event) => {
        event.stopPropagation();
        if (!busy) onCancel();
      }}
    >
      <div
        className="modal__panel modal__panel--narrow"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">
          <span className="eyebrow__pip" aria-hidden="true" />
          {destructive ? 'DESTRUCTIVE ACTION' : 'CONFIRM'}
        </p>
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-body" className="modal__body">
          {body}
        </p>
        <div className="modal__actions">
          <button
            ref={cancelRef}
            className="btn btn--ghost"
            type="button"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            className={`btn ${destructive ? 'btn--danger' : 'btn--ink'}`}
            type="button"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
