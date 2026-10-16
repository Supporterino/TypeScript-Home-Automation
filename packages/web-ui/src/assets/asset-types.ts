/**
 * Shared types and helpers for the web UI's build-time asset manifest, shared
 * by the generator and the server-side consumers.
 */

/**
 * One compiled asset (a JS or CSS bundle chunk). Bodies are base64-encoded so
 * they survive as a generated TypeScript string constant.
 */
export interface BuiltAsset {
  /** Content-hashed file name, e.g. "index-a1b2c3d4.js". Unique per build. */
  fileName: string;
  /** MIME type to serve, e.g. "application/javascript" or "text/css". */
  contentType: string;
  /** Hex digest of the raw (uncompressed) body, used to derive `fileName`. */
  hash: string;
  /** Raw, uncompressed body, base64-encoded. */
  rawBase64: string;
  /** Gzip-compressed body, base64-encoded; may grow for already-compressed payloads. */
  gzipBase64: string;
  /**
   * Whether this asset is required for first paint; `false` for chunks only
   * reachable via a dynamic import.
   */
  firstPaint: boolean;
}

/** Decodes a base64 string into raw bytes. */
export function base64ToBytes(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, "base64"));
}

/** Encodes raw bytes into a base64 string. */
export function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/**
 * Whether the `Accept-Encoding` header indicates the client accepts gzip. A
 * missing header, or an explicit `gzip;q=0`, means no gzip.
 */
export function clientAcceptsGzip(acceptEncodingHeader: string | undefined | null): boolean {
  if (!acceptEncodingHeader) return false;

  for (const rawToken of acceptEncodingHeader.split(",")) {
    const [name, ...params] = rawToken
      .trim()
      .toLowerCase()
      .split(";")
      .map((part) => part.trim());
    if (name !== "gzip") continue;

    const qParam = params.find((p) => p.startsWith("q="));
    if (qParam) {
      const q = Number.parseFloat(qParam.slice(2));
      if (!Number.isNaN(q) && q === 0) return false;
    }
    return true;
  }

  return false;
}

/**
 * Selects the best body to serve for an asset given whether the client
 * accepts gzip. Returns the raw body when it does not.
 */
export function selectAssetBody(
  asset: BuiltAsset,
  acceptsGzip: boolean,
): { body: Uint8Array; contentEncoding: "gzip" | null } {
  if (acceptsGzip) {
    return { body: base64ToBytes(asset.gzipBase64), contentEncoding: "gzip" };
  }
  return { body: base64ToBytes(asset.rawBase64), contentEncoding: null };
}

/** Total transferred (gzip) bytes of every first-paint asset. */
export function firstPaintTransferredBytes(assets: readonly BuiltAsset[]): number {
  let total = 0;
  for (const asset of assets) {
    if (!asset.firstPaint) continue;
    total += base64ToBytes(asset.gzipBase64).byteLength;
  }
  return total;
}
