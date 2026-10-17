// A ZIP archive built in the browser, without compression (photos are compressed already): "stored" entries, CRC-32,
// UTF-8 names. Enough for downloading the photos of an asset in one file.

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** DOS date and time of a JS date. */
function dos(d: Date) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export type ZipEntry = { name: string; data: Uint8Array; date?: Date };

/** The archive of the entries (names may hold folders: "Bucătărie/01.jpg"). */
export function makeZip(entries: ZipEntry[]): Blob {
  const enc = new TextEncoder();
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const crc = crc32(e.data);
    const { time, date } = dos(e.date ?? new Date());
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true);
    head.setUint16(4, 20, true);
    head.setUint16(6, 0x0800, true); // UTF-8 names
    head.setUint16(8, 0, true); // stored
    head.setUint16(10, time, true);
    head.setUint16(12, date, true);
    head.setUint32(14, crc, true);
    head.setUint32(18, e.data.length, true);
    head.setUint32(22, e.data.length, true);
    head.setUint16(26, name.length, true);
    head.setUint16(28, 0, true);
    parts.push(head.buffer, name, e.data as Uint8Array<ArrayBuffer>);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, time, true);
    c.setUint16(14, date, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, e.data.length, true);
    c.setUint32(24, e.data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    const rec = new Uint8Array(46 + name.length);
    rec.set(new Uint8Array(c.buffer), 0);
    rec.set(name, 46);
    central.push(rec);
    offset += 30 + name.length + e.data.length;
  }
  const size = central.reduce((s, x) => s + x.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central.map((x) => x as Uint8Array<ArrayBuffer>), end.buffer], { type: "application/zip" });
}
