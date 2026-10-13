import { useEffect, useRef } from 'react';

type Props = {
  src: string;
  description: string;
  onClose: () => void;
  onDownload: () => void;
  onDelete?: () => void;
  deleteLabel?: string;
  extraActions?: { label: string; onClick: () => void; disabled?: boolean }[];
  busy?: boolean;
};

/** One gentle, keyboard-accessible viewer for local, cloud and shared photos. */
export default function MemoryPhotoViewer({ src, description, onClose, onDownload, onDelete, deleteLabel, extraActions = [], busy }: Props) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', escape);
    closeButton.current?.focus();
    return () => { window.removeEventListener('keydown', escape); previous?.focus(); };
  }, [onClose]);

  return <div className="cloud-v6-lightbox" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="cloud-v6-lightbox-content" role="dialog" aria-modal="true" aria-label={description}>
      <div className="cloud-v6-lightbox-actions">
        <span>Our little moment &#9825;</span>
        <button ref={closeButton} type="button" onClick={onClose} aria-label="Close photo preview">Close</button>
      </div>
      <img src={src} alt={description} />
      <div className="lovebug-viewer-buttons">
        <button type="button" className="soft-button" disabled={busy} onClick={onDownload}>Download photo</button>
        {extraActions.map(action => <button type="button" key={action.label} className="soft-button" disabled={busy || action.disabled} onClick={action.onClick}>{action.label}</button>)}
        {onDelete && <button type="button" className="plain-button" disabled={busy} onClick={onDelete}>{deleteLabel ?? 'Remove photo'}</button>}
      </div>
    </section>
  </div>;
}
