import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { GCASH_PROOF_MAX_BYTES, type GcashProofUploadInput } from '@bcis/shared';
import { AppError } from '../errors.js';

export interface StoredProof {
  storageKey: string;
  originalFilename: string;
  mimeType: 'image/jpeg' | 'image/png' | 'application/pdf';
  sizeBytes: string;
  sha256: string;
}

export class GcashProofStorage {
  private readonly directory: string;

  constructor(directory: string) {
    this.directory = resolve(directory);
  }

  async save(input: GcashProofUploadInput): Promise<{ metadata: StoredProof; bytes: Buffer }> {
    const bytes = this.decode(input.contentBase64);
    if (bytes.length > GCASH_PROOF_MAX_BYTES) {
      throw new AppError(413, 'PROOF_TOO_LARGE', 'Proof file must be 5 MB or smaller');
    }
    const detectedMime = this.detectMime(bytes);
    if (detectedMime !== input.mimeType) {
      throw new AppError(400, 'PROOF_TYPE_MISMATCH', 'Proof file content does not match its declared file type');
    }
    const key = randomUUID();
    const extension = detectedMime === 'image/jpeg' ? '.jpg' : detectedMime === 'image/png' ? '.png' : '.pdf';
    const filePath = this.pathFor(key, extension);
    await mkdir(this.directory, { recursive: true });
    await writeFile(filePath, bytes, { flag: 'wx', mode: 0o600 });
    return {
      bytes,
      metadata: {
        storageKey: key,
        originalFilename: this.safeFilename(input.originalFilename, extension),
        mimeType: detectedMime,
        sizeBytes: bytes.length.toString(),
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
    };
  }

  async read(storageKey: string, mimeType: StoredProof['mimeType']): Promise<Buffer> {
    const extension = mimeType === 'image/jpeg' ? '.jpg' : mimeType === 'image/png' ? '.png' : '.pdf';
    try {
      const bytes = await readFile(this.pathFor(storageKey, extension));
      if (bytes.length > GCASH_PROOF_MAX_BYTES || this.detectMime(bytes) !== mimeType) {
        throw new AppError(500, 'PROOF_STORAGE_INVALID', 'Stored proof failed integrity validation');
      }
      return bytes;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(404, 'PROOF_NOT_FOUND', 'Proof attachment is unavailable');
    }
  }

  async remove(storageKey: string, mimeType: StoredProof['mimeType']): Promise<void> {
    const extension = mimeType === 'image/jpeg' ? '.jpg' : mimeType === 'image/png' ? '.png' : '.pdf';
    await rm(this.pathFor(storageKey, extension), { force: true });
  }

  private decode(encoded: string): Buffer {
    const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
    const contentLength = encoded.length - padding;
    if (encoded.length % 4 !== 0 || (padding === 1 && contentLength % 4 !== 3) || (padding === 2 && contentLength % 4 !== 2)) {
      throw new AppError(400, 'PROOF_BASE64_INVALID', 'Proof file data is invalid');
    }
    for (let index = 0; index < contentLength; index += 1) {
      const code = encoded.charCodeAt(index);
      const valid = (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || code === 43 || code === 47;
      if (!valid) throw new AppError(400, 'PROOF_BASE64_INVALID', 'Proof file data is invalid');
    }
    for (let index = contentLength; index < encoded.length; index += 1) {
      if (encoded.charCodeAt(index) !== 61) throw new AppError(400, 'PROOF_BASE64_INVALID', 'Proof file data is invalid');
    }
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.length === 0 || bytes.toString('base64') !== encoded) {
      throw new AppError(400, 'PROOF_BASE64_INVALID', 'Proof file data is invalid');
    }
    return bytes;
  }

  private detectMime(bytes: Buffer): StoredProof['mimeType'] {
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (bytes.length >= 8 && bytes.subarray(0, 5).toString('ascii') === '%PDF-' && bytes.includes(Buffer.from('%%EOF'))) return 'application/pdf';
    throw new AppError(400, 'PROOF_TYPE_UNSUPPORTED', 'Upload a valid JPEG, PNG, or PDF proof file');
  }

  private pathFor(storageKey: string, extension: string): string {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storageKey)) {
      throw new AppError(400, 'PROOF_KEY_INVALID', 'Proof attachment key is invalid');
    }
    return resolve(this.directory, `${storageKey}${extension}`);
  }

  private safeFilename(filename: string, extension: string): string {
    let sanitized = '';
    for (const character of basename(filename)) {
      sanitized += character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? '_' : character;
    }
    const leaf = sanitized.trim();
    const originalExtension = extname(leaf);
    const originalStem = originalExtension ? leaf.slice(0, -originalExtension.length) : leaf;
    const stem = originalStem.slice(0, 255 - extension.length).replace(/\.+$/g, '') || 'gcash-proof';
    return `${stem}${extension}`;
  }
}
