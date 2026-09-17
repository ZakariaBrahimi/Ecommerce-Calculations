import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { CredentialsCipher } from '../../domain/ports/CredentialsCipher';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;

/**
 * Envelope-encrypts tenant secrets with a single master key held in memory
 * (loaded from DELIVERY_CREDENTIALS_ENCRYPTION_KEY, base64, 32 bytes).
 *
 * Production note: this is the local/single-key form of the pattern. In
 * staging/production the master key itself should come from a real KMS
 * (AWS KMS / GCP KMS) - inject the *key material* via a securely-fetched
 * data key at boot, never a long-lived plaintext key sitting in a `.env`
 * file on a server. See docs/integrations/elogistia-api.md.
 */
export class AesGcmCredentialsCipher implements CredentialsCipher {
  private readonly key: Buffer;

  constructor(masterKeyBase64: string) {
    const key = Buffer.from(masterKeyBase64, 'base64');
    if (key.length !== 32) {
      throw new Error('DELIVERY_CREDENTIALS_ENCRYPTION_KEY must decode to exactly 32 bytes');
    }
    this.key = key;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // iv || authTag || ciphertext, base64-encoded as one opaque blob
    return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
  }

  decrypt(ciphertext: string): string {
    const buf = Buffer.from(ciphertext, 'base64');
    const iv = buf.subarray(0, IV_LENGTH_BYTES);
    const authTag = buf.subarray(IV_LENGTH_BYTES, IV_LENGTH_BYTES + 16);
    const encrypted = buf.subarray(IV_LENGTH_BYTES + 16);

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }
}
