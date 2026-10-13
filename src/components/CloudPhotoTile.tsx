import { useEffect, useState } from 'react';
import { downloadCloudPhoto, type CloudPhoto } from '../lib/cloudAlbumV6';
import { downloadBlob } from '../lib/storage';
import MemoryPhotoViewer from './MemoryPhotoViewer';

/** Gallery cards are only a photo and date; all actions live in the viewer. */
export default function CloudPhotoTile({ photo, onDelete, onRestore, onShare, busy, deleteLabel }: {
  photo: CloudPhoto;
  onDelete?: (photo: CloudPhoto) => void;
  onRestore?: (photo: CloudPhoto) => void;
  onShare?: (photo: CloudPhoto) => void;
  busy?: boolean;
  deleteLabel?: string;
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
  return <article className="cloud-photo lovebug-v64-photo">
    <button className="cloud-photo-open" type="button" disabled={!url} onClick={() => setOpen(true)} aria-label="View photo full size">
      <div className="cloud-photo-preview">{url ? <img src={url} alt="Saved Lovebug Booth photo strip" loading="lazy" />
        : <span className="cloud-hint">{error ? 'Photo unavailable' : 'Opening photo...'}</span>}</div>
    </button>
    <small>{new Date(photo.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</small>
    {open && url && <MemoryPhotoViewer src={url} description="Full-size Lovebug Booth photo" onClose={() => setOpen(false)} onDownload={download}
      onDelete={onDelete ? () => { setOpen(false); onDelete(photo); } : undefined}
      deleteLabel={deleteLabel} busy={busy}
      extraActions={[
        ...(onRestore ? [{ label: 'On this device', onClick: () => { setOpen(false); onRestore(photo); } }] : []),
        ...(onShare ? [{ label: 'Share', onClick: () => { setOpen(false); onShare(photo); } }] : []),
      ]} />}
  </article>;
}
