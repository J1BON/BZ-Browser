import fs from 'fs/promises';
import path from 'path';
import extract from 'extract-zip';

/** Parse Chrome Web Store URL or raw 32-char extension ID. */
export function parseChromeExtensionId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[a-p]{32}$/i.test(trimmed)) return trimmed.toLowerCase();
  const patterns = [
    /chromewebstore\.google\.com\/detail\/[^/]+\/([a-p]{32})/i,
    /chrome\.google\.com\/webstore\/detail\/[^/]+\/([a-p]{32})/i,
    /\/([a-p]{32})(?:[/?#]|$)/i,
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m?.[1]) return m[1].toLowerCase();
  }
  return null;
}

export function crxPayloadToZip(buffer: Buffer): Buffer {
  // Magic: Cr24 = 0x43723234
  if (buffer.length < 16 || buffer.readUInt32BE(0) !== 0x43723234) {
    return buffer; // not a CRX, assume raw zip
  }
  const version = buffer.readUInt32LE(4);
  if (version === 2) {
    // CRX2 format: [magic(4)] [version(4)] [pubKeyLen(4)] [sigLen(4)] [pubKey] [sig] [zip]
    if (buffer.length < 16) return buffer;
    const pubKeyLen = buffer.readUInt32LE(8);
    const sigLen = buffer.readUInt32LE(12);
    const zipStart = 16 + pubKeyLen + sigLen;
    return buffer.subarray(zipStart);
  } else {
    // CRX3 format: [magic(4)] [version(4)] [headerSize(4)] [protobuf header] [zip]
    if (buffer.length < 12) return buffer;
    const headerSize = buffer.readUInt32LE(8);
    const zipStart = 12 + headerSize;
    return buffer.subarray(zipStart);
  }
}

async function extractZipBuffer(zipBuffer: Buffer, destDir: string): Promise<void> {
  await fs.mkdir(destDir, { recursive: true });
  const tmpZip = path.join(destDir, '_tmp.zip');
  await fs.writeFile(tmpZip, zipBuffer);
  try {
    await extract(tmpZip, { dir: destDir });
  } finally {
    await fs.unlink(tmpZip).catch(() => {});
  }
}

export async function downloadExtensionFromStore(
  extensionId: string,
  installDir: string,
): Promise<{ path: string; name: string; version?: string }> {
  const id = parseChromeExtensionId(extensionId);
  if (!id) throw new Error('Invalid Chrome Web Store URL or extension ID');

  const url =
    `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=131.0` +
    `&acceptformat=crx2,crx3&x=id%3D${id}%26installsource%3Dondemand%26uc`;

  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Chrome Web Store download failed (HTTP ${res.status}). Try manual upload of unpacked folder.`);
  }

  const raw = Buffer.from(await res.arrayBuffer());
  const zipBuffer = crxPayloadToZip(raw);
  const destDir = path.join(installDir, id);
  await fs.rm(destDir, { recursive: true, force: true });
  await extractZipBuffer(zipBuffer, destDir);

  const manifestPath = path.join(destDir, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as { name?: string; version?: string };
  const name = typeof manifest.name === 'string'
    ? manifest.name.replace(/^__MSG_(\w+)__$/, '$1')
    : id;

  return { path: destDir, name, version: manifest.version };
}

export async function extractCrxFile(crxPath: string, installDir: string): Promise<{ path: string; name: string; version?: string }> {
  const raw = await fs.readFile(crxPath);
  const zipBuffer = crxPayloadToZip(raw);
  const id = path.basename(crxPath, path.extname(crxPath))
    .replace(/[^a-z0-9_-]/gi, '_')
    .slice(0, 32) || `ext-${Date.now()}`;
  const destDir = path.join(installDir, id);
  await fs.rm(destDir, { recursive: true, force: true });
  await extractZipBuffer(zipBuffer, destDir);

  const manifestPath = path.join(destDir, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as { name?: string; version?: string };
  return {
    path: destDir,
    name: manifest.name ?? id,
    version: manifest.version,
  };
}
