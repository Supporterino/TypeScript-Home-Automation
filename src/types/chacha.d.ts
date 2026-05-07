declare module "chacha" {
  export interface ChachaCipher {
    update(data: Buffer): Buffer;
    final(): void;
    getAuthTag(): Buffer;
    setAAD(aad: Buffer): void;
  }

  export interface ChachaDecipher {
    update(data: Buffer): Buffer;
    final(): void;
    setAuthTag(tag: Buffer): void;
    setAAD(aad: Buffer): void;
  }

  export function createCipher(key: Buffer, iv: Buffer): ChachaCipher;
  export function createDecipher(key: Buffer, iv: Buffer): ChachaDecipher;
}
