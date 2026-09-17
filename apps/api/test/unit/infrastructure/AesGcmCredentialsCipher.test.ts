import { randomBytes } from 'node:crypto';
import { AesGcmCredentialsCipher } from '../../../src/infrastructure/security/AesGcmCredentialsCipher';

describe('AesGcmCredentialsCipher', () => {
  const key = randomBytes(32).toString('base64');

  it('round-trips a plaintext secret', () => {
    const cipher = new AesGcmCredentialsCipher(key);
    const plaintext = 'e10adc3949ba59abbe56e057f20f883e';

    const ciphertext = cipher.encrypt(plaintext);

    expect(ciphertext).not.toContain(plaintext);
    expect(cipher.decrypt(ciphertext)).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext each time (random IV)', () => {
    const cipher = new AesGcmCredentialsCipher(key);
    const a = cipher.encrypt('same-secret');
    const b = cipher.encrypt('same-secret');
    expect(a).not.toBe(b);
  });

  it('rejects a master key that is not exactly 32 bytes', () => {
    expect(() => new AesGcmCredentialsCipher(Buffer.from('too-short').toString('base64'))).toThrow();
  });

  it('fails to decrypt with a different key (auth tag mismatch)', () => {
    const cipherA = new AesGcmCredentialsCipher(key);
    const cipherB = new AesGcmCredentialsCipher(randomBytes(32).toString('base64'));
    const ciphertext = cipherA.encrypt('secret');
    expect(() => cipherB.decrypt(ciphertext)).toThrow();
  });
});
