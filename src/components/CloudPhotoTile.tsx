import { useEffect, useState } from 'react';
import { downloadCloudPhoto, type CloudPhoto } from '../lib/cloudAlbumV6';
import { downloadBlob } from '../lib/storage';
import MemoryPhotoViewer from './MemoryPhotoViewer';

export default function CloudPhotoTile({ photo, onDelete, onRestore, onShare, busy }: {
  photo: CloudPhoto;
  onDelete?: (photo: CloudPhoto) => void;
  onRestore?: (photo: CloudPhoto) => void;
  onShare?: (photo: CloudPhoto) => void;
  busy?: boolean;
}) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let active = true;
    let created = '';
    setBlob(null); setUrl(''); setError(false); setOpen(false);
    void downloadCloudPhoto(photo).then(data => {
      if (!active) return;
      created = URL.createObjectURL(data);
      setBlob(data); setUrl(created);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; if (created) URL.revokeObjectURL(created); };
  }, [photo.id, photo.object_path]);

  const download = () => { if (blob) downloadBlob(blob, `lovebug-${photo.id.slice(0, 8)}.png`); };
  return <article className="cloud-photo">
    <button className="cloud-photo-open" type="button" disabled={!url} onClick={() => setOpen(true)} aria-label="View photo full size">
      <div className="cloud-photo-preview">{url ? <img src={url} alt="Saved Lovebug Booth photo strip" loading="lazy" />
        : <span className="cloud-hint">{error ? 'Photo unavailable' : 'Opening photo…'}</span>}</div>
      <span className="cloud-v6-open-hint">tap to view ♡</span>
    </button>
    <small>{new Date(photo.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</small>
    <div className="cloud-photo-actions">
      <button type="button" onClick={download} disabled={!blob}>↓ download</button>
      {onRestore && <button type="button" onClick={() => onRestore(photo)} disabled={busy || !blob}>↙ on this device</button>}
      {onShare && <button type="button" onClick={() => onShare(photo)} disabled={busy || !blob}>♡ share</button>}
      {onDelete && <button type="button" onClick={() => onDelete(photo)} disabled={busy}>delete</button>}
    </div>
    {open && url && <MemoryPhotoViewer src={url} description="Full-size Lovebug Booth photo" onClose={() => setOpen(false)} onDownload={download} />}
  </article>;
}
