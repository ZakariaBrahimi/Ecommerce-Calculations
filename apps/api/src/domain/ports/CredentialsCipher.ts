/**
 * Encrypts/decrypts tenant secrets (e.g. a delivery provider's API key)
 * before they touch persistence. Never logged, never returned to any HTTP
 * response, never sent to the frontend.
 */
export interface CredentialsCipher {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}
