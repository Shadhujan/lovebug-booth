import { useEffect, useRef } from 'react';

type Props = {
  src: string;
  description: string;
  onClose: () => void;
  onDownload: () => void;
  onDelete?: () => void;
};

/** The same full-size viewer for on-device, private-backup, and shared photos. */
export default function MemoryPhotoViewer({ src, description, onClose, onDownload, onDelete }: Props) {
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
        <span>Our little moment ♡</span>
        <button ref={closeButton} type="button" onClick={onClose} aria-label="Close photo preview">✕ close</button>
      </div>
      <img src={src} alt={description} />
      <div className="lovebug-viewer-buttons">
        <button type="button" className="soft-button" onClick={onDownload}>↓ download photo</button>
        {onDelete && <button type="button" className="plain-button" onClick={onDelete}>remove photo</button>}
      </div>
    </section>
  </div>;
}
