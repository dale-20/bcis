import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export interface ScryptParameters {
  cost: number;
  blockSize: number;
  parallelization: number;
  keyLength: number;
  saltLength: number;
  maxMemory: number;
}

// OWASP's minimum scrypt profile: N=2^17, r=8, p=1 (~128 MiB).
export const productionScryptParameters: ScryptParameters = {
  cost: 131_072,
  blockSize: 8,
  parallelization: 1,
  keyLength: 32,
  saltLength: 16,
  maxMemory: 256 * 1024 * 1024,
};

function derive(password: string, salt: Buffer, parameters: ScryptParameters): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, parameters.keyLength, {
      N: parameters.cost,
      r: parameters.blockSize,
      p: parameters.parallelization,
      maxmem: parameters.maxMemory,
    }, (error, key) => error ? reject(error) : resolve(key));
  });
}

export class PasswordHasher {
  constructor(private readonly parameters: ScryptParameters = productionScryptParameters) {}

  async hash(password: string): Promise<string> {
    const salt = randomBytes(this.parameters.saltLength);
    const key = await derive(password, salt, this.parameters);
    return `$scrypt$N=${this.parameters.cost},r=${this.parameters.blockSize},p=${this.parameters.parallelization},l=${this.parameters.keyLength}$${salt.toString('base64url')}$${key.toString('base64url')}`;
  }

  async verify(password: string, encoded: string): Promise<boolean> {
    const match = /^\$scrypt\$N=(\d+),r=(\d+),p=(\d+),l=(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/.exec(encoded);
    if (!match) return false;
    const [, costValue, blockSizeValue, parallelizationValue, keyLengthValue, saltValue, hashValue] = match;
    const parameters: ScryptParameters = {
      cost: Number(costValue),
      blockSize: Number(blockSizeValue),
      parallelization: Number(parallelizationValue),
      keyLength: Number(keyLengthValue),
      saltLength: 0,
      maxMemory: Math.max(this.parameters.maxMemory, 256 * 1024 * 1024),
    };
    if (!Number.isInteger(parameters.cost) || parameters.cost < 16_384 || parameters.cost > 1_048_576
      || !Number.isInteger(parameters.blockSize) || parameters.blockSize < 1 || parameters.blockSize > 32
      || !Number.isInteger(parameters.parallelization) || parameters.parallelization < 1 || parameters.parallelization > 16
      || !Number.isInteger(parameters.keyLength) || parameters.keyLength < 16 || parameters.keyLength > 64) return false;
    const expected = Buffer.from(hashValue ?? '', 'base64url');
    if (expected.length !== parameters.keyLength) return false;
    try {
      const actual = await derive(password, Buffer.from(saltValue ?? '', 'base64url'), parameters);
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    } catch {
      return false;
    }
  }
}
