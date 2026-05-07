/**
 * Polyfills `chacha20-poly1305` cipher support for `node:crypto` under Bun.
 *
 * `hap-nodejs` requires this cipher for HAP encryption. Bun does not yet
 * implement it natively ([oven-sh/bun#25837](https://github.com/oven-sh/bun/issues/25837)).
 *
 * This module patches `crypto.getCiphers()`, `crypto.createCipheriv()`, and
 * `crypto.createDecipheriv()` to use the pure-JS `chacha` package when the
 * algorithm is `chacha20-poly1305`. It is idempotent and only applies when
 * the cipher is missing.
 */

import crypto from "node:crypto";
import * as chacha from "chacha";

const CHACHA20_POLY1305 = "chacha20-poly1305";

if (!crypto.getCiphers().includes(CHACHA20_POLY1305)) {
  const originalGetCiphers = crypto.getCiphers.bind(crypto);
  (crypto as unknown as Record<string, unknown>).getCiphers = () => {
    const ciphers = originalGetCiphers();
    if (!ciphers.includes(CHACHA20_POLY1305)) {
      ciphers.push(CHACHA20_POLY1305);
    }
    return ciphers;
  };

  const originalCreateCipheriv = crypto.createCipheriv.bind(crypto);
  (crypto as unknown as Record<string, unknown>).createCipheriv = (
    algorithm: string,
    key: unknown,
    iv: unknown,
    options?: unknown,
  ) => {
    if (algorithm === CHACHA20_POLY1305) {
      const cipher = chacha.createCipher(key as Buffer, iv as Buffer);
      const origSetAAD = cipher.setAAD.bind(cipher);
      cipher.setAAD = (aad: Buffer, _opts?: unknown) => origSetAAD(aad);
      return cipher as unknown as crypto.CipherGCM;
    }
    return originalCreateCipheriv(
      algorithm,
      key as crypto.CipherKey,
      iv as crypto.BinaryLike,
      options as crypto.CipherGCMOptions | undefined,
    );
  };

  const originalCreateDecipheriv = crypto.createDecipheriv.bind(crypto);
  (crypto as unknown as Record<string, unknown>).createDecipheriv = (
    algorithm: string,
    key: unknown,
    iv: unknown,
    options?: unknown,
  ) => {
    if (algorithm === CHACHA20_POLY1305) {
      const decipher = chacha.createDecipher(key as Buffer, iv as Buffer);
      const origSetAAD = decipher.setAAD.bind(decipher);
      decipher.setAAD = (aad: Buffer, _opts?: unknown) => origSetAAD(aad);
      return decipher as unknown as crypto.DecipherGCM;
    }
    return originalCreateDecipheriv(
      algorithm,
      key as crypto.CipherKey,
      iv as crypto.BinaryLike,
      options as crypto.CipherGCMOptions | undefined,
    );
  };
}
