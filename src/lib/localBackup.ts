import { dataUrlToBlob, listCustomStickers, listStrips } from './storage';
import { createZip, type ZipFile } from './zipArchive';

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 65);
}

function stickerExtension(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('jpeg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('svg')) return 'svg';
  return 'bin';
}

/** All processing happens in the browser; only an explicit click starts a download. */
export async function makeLocalBackup(): Promise<{ zip: Blob; photos: number; stickers: number }> {
  const [photos, stickers] = await Promise.all([listStrips(), listCustomStickers()]);
  if (!photos.length && !stickers.length) throw new Error('There are no saved memories to back up yet.');

  const files: ZipFile[] = [];
  const manifest = {
    app: 'Lovebug Booth', version: 1, exportedAt: new Date().toISOString(),
    photos: photos.map(photo => ({ id: photo.id, createdAt: photo.createdAt, theme: photo.theme, note: photo.note })),
    stickers: stickers.map(sticker => ({ id: sticker.id, createdAt: sticker.createdAt })),
  };
  files.push({ name: 'memories.json', data: new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }) });
  files.push({ name: 'README.txt', data: new Blob([
    'Lovebug Booth local backup\n\n',
    'The photos/ folder contains your saved strips. The stickers/ folder contains custom stickers.\n',
    'Keep this file private. A ZIP backup does not automatically sync or restore to the app.\n',
    'For now, open the PNG files directly or keep the ZIP in a safe place.\n',
  ], { type: 'text/plain' }) });

  for (const photo of photos) {
    files.push({
      name: `photos/lovebug-${safeId(photo.id)}.png`,
      data: photo.image,
      modifiedAt: photo.createdAt,
    });
  }
  for (const sticker of stickers) {
    const blob = await dataUrlToBlob(sticker.src);
    files.push({
      name: `stickers/sticker-${safeId(sticker.id)}.${stickerExtension(blob.type)}`,
      data: blob,
      modifiedAt: sticker.createdAt,
    });
  }

  return { zip: await createZip(files), photos: photos.length, stickers: stickers.length };
}
