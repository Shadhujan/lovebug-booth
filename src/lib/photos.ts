export function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that picture.'));
    reader.readAsDataURL(file);
  });
}

export function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('This image could not be opened.'));
    img.src = source;
  });
}

export async function compressPhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose a photo file.');
  if (file.size > 25 * 1024 * 1024) throw new Error('This picture is too large. Please choose one under 25 MB.');
  const img = await loadImage(await fileToDataURL(file));
  const width = 1100, height = 825;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser cannot edit this picture.');
  const srcAspect = img.naturalWidth / img.naturalHeight;
  const destAspect = width / height;
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
  if (srcAspect > destAspect) { sw = img.naturalHeight * destAspect; sx = (img.naturalWidth - sw) / 2; }
  else { sh = img.naturalWidth / destAspect; sy = (img.naturalHeight - sh) / 2; }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.88);
}

export function captureVideoFrame(video: HTMLVideoElement): string {
  if (!video.videoWidth || !video.videoHeight) throw new Error('The camera is not ready yet.');
  const c = document.createElement('canvas');
  c.width = 1100; c.height = 825;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Your browser cannot capture this picture.');
  const aspect = c.width / c.height;
  const sourceAspect = video.videoWidth / video.videoHeight;
  let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight;
  if (sourceAspect > aspect) { sw = video.videoHeight * aspect; sx = (video.videoWidth - sw) / 2; }
  else { sh = video.videoWidth / aspect; sy = (video.videoHeight - sh) / 2; }
  ctx.translate(c.width, 0); ctx.scale(-1, 1); // front-facing preview and saved shot match
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.9);
}
