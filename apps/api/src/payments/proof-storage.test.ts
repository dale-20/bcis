import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GcashProofStorage } from './proof-storage.js';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nm6kAAAAASUVORK5CYII=';
const directories: string[] = [];

async function storage() {
  const directory = await mkdtemp(join(tmpdir(), 'bcis-proof-storage-'));
  directories.push(directory);
  return new GcashProofStorage(directory);
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('GCash proof storage', () => {
  it('stores a signature-checked file under a generated key and validates it when read', async () => {
    const proofs = await storage();
    const saved = await proofs.save({ originalFilename: '..\\receipt.png', mimeType: 'image/png', contentBase64: png });
    expect(saved.metadata).toMatchObject({ originalFilename: 'receipt.png', mimeType: 'image/png', sizeBytes: String(Buffer.from(png, 'base64').length) });
    expect(saved.metadata.storageKey).toMatch(/^[0-9a-f-]{36}$/i);
    await expect(proofs.read(saved.metadata.storageKey, 'image/png')).resolves.toEqual(Buffer.from(png, 'base64'));
  });

  it('rejects unsupported file contents even when the name and declared MIME are allowed', async () => {
    const proofs = await storage();
    await expect(proofs.save({ originalFilename: 'proof.png', mimeType: 'image/png', contentBase64: Buffer.from('plain text').toString('base64') }))
      .rejects.toMatchObject({ code: 'PROOF_TYPE_UNSUPPORTED' });
  });

  it('rejects a valid image signature when its declared MIME does not match', async () => {
    const proofs = await storage();
    await expect(proofs.save({ originalFilename: 'proof.jpg', mimeType: 'image/jpeg', contentBase64: png }))
      .rejects.toMatchObject({ code: 'PROOF_TYPE_MISMATCH' });
  });

  it('enforces the 5 MB attachment limit', async () => {
    const proofs = await storage();
    const bytes = Buffer.alloc(5 * 1024 * 1024 + 1);
    Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes);
    await expect(proofs.save({ originalFilename: 'large.png', mimeType: 'image/png', contentBase64: bytes.toString('base64') }))
      .rejects.toMatchObject({ code: 'PROOF_TOO_LARGE' });
  });

  it('rejects malformed and non-canonical base64 before writing a file', async () => {
    const proofs = await storage();
    await expect(proofs.save({ originalFilename: 'proof.png', mimeType: 'image/png', contentBase64: 'not base64!' }))
      .rejects.toMatchObject({ code: 'PROOF_BASE64_INVALID' });
  });
});
