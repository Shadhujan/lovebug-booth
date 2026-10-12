/** Create a ZIP without a network request or a new dependency.
 * The files use ZIP's STORE format (no compression), so PNGs aren't recompressed.
 * This is a ZIP32 writer: files larger than 4 GiB are rejected explicitly.
 */
export type ZipFile = { name: string; data: Blob; modifiedAt?: number };

const encoder = new TextEncoder();
const MAX_ZIP32 = 0xffffffff;

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateAndTime(timestamp: number): { date: number; time: number } {
  const value = new Date(timestamp);
  const date = Number.isFinite(value.getTime()) ? value : new Date();
  const year = Math.max(1980, Math.min(2107, date.getFullYear()));
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  };
}

export async function createZip(files: ZipFile[]): Promise<Blob> {
  if (files.length > 65535) throw new Error('There are too many files for one backup.');
  const body: BlobPart[] = [];
  const directory: BlobPart[] = [];
  let cursor = 0;
  let directorySize = 0;

  for (const file of files) {
    // Archive paths are authored by this app, not supplied by the user.
    const name = encoder.encode(file.name);
    const size = file.data.size;
    if (name.byteLength > 65535 || size > MAX_ZIP32 || cursor + 30 + name.length + size > MAX_ZIP32) {
      throw new Error('The album is too large for one ZIP file. Download photos individually.');
    }
    const checksum = crc32(new Uint8Array(await file.data.arrayBuffer()));
    const { date, time } = dosDateAndTime(file.modifiedAt ?? Date.now());

    const local = new Uint8Array(30 + name.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, 0x0800, true); // UTF-8 names
    l.setUint16(8, 0, true); // STORE
    l.setUint16(10, time, true);
    l.setUint16(12, date, true);
    l.setUint32(14, checksum, true);
    l.setUint32(18, size, true);
    l.setUint32(22, size, true);
    l.setUint16(26, name.length, true);
    local.set(name, 30);
    body.push(local, file.data);

    const central = new Uint8Array(46 + name.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, time, true);
    c.setUint16(14, date, true);
    c.setUint32(16, checksum, true);
    c.setUint32(20, size, true);
    c.setUint32(24, size, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, cursor, true);
    central.set(name, 46);
    directory.push(central);
    directorySize += central.length;
    cursor += local.length + size;
  }

  if (cursor + directorySize > MAX_ZIP32) throw new Error('The backup is too large. Download photos individually.');
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, directorySize, true);
  e.setUint32(16, cursor, true);
  return new Blob([...body, ...directory, end], { type: 'application/zip' });
}
