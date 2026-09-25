import { type AdbCredentialStore, type AdbPrivateKey } from '@yume-chan/adb';

function pemToBinary(pem: string): Uint8Array {
  const base64 = pem
    .replace(/-----BEGIN [A-Z ]+-----/, '')
    .replace(/-----END [A-Z ]+-----/, '')
    .replace(/\s+/g, '');
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export class CustomAdbCredentialStore implements AdbCredentialStore {
  private defaultStore: AdbCredentialStore;

  constructor(defaultStore: AdbCredentialStore) {
    this.defaultStore = defaultStore;
  }

  async generateKey(): Promise<AdbPrivateKey> {
    return this.defaultStore.generateKey();
  }

  async sign(token: Uint8Array): Promise<Uint8Array> {
    const customKeyPem = localStorage.getItem('custom_adb_private_key');

    if (customKeyPem) {
      try {
        const der = pemToBinary(customKeyPem);
        const privateKey = await crypto.subtle.importKey(
          'pkcs8',
          der as unknown as BufferSource,
          {
            name: 'RSASSA-PKCS1-v1_5',
            hash: 'SHA-1',
          },
          false,
          ['sign']
        );

        const signature = await crypto.subtle.sign(
          'RSASSA-PKCS1-v1_5',
          privateKey,
          token as unknown as BufferSource
        );

        return new Uint8Array(signature);
      } catch (err) {
        console.warn('Failed to sign with custom key, falling back to default store:', err);
      }
    }

    if ('sign' in (this.defaultStore as any) && typeof (this.defaultStore as any).sign === 'function') {
      return (this.defaultStore as any).sign(token);
    }
    return new Uint8Array(0);
  }

  async *iterateKeys(): AsyncGenerator<AdbPrivateKey, void, void> {
    const customKeyPem = localStorage.getItem('custom_adb_private_key');
    if (customKeyPem) {
      try {
        const der = pemToBinary(customKeyPem);
        yield {
          buffer: der,
          name: localStorage.getItem('custom_adb_key_name') || 'custom_adb_private_key',
        };
      } catch {
        // Fallback gracefully on parsing error
      }
    }
    yield* this.defaultStore.iterateKeys();
  }
}
