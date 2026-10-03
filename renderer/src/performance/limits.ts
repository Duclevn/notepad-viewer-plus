/** Hard renderer work limits. Keep these independent of host-configured input limits. */
export const MAX_MATH_EXPRESSIONS = 200;
export const MAX_HIGHLIGHT_BLOCK_BYTES = 128 * 1024;
export const MAX_HIGHLIGHT_TOTAL_BYTES = 512 * 1024;
export const MAX_MARKDOWN_SOURCE_BYTES = 1024 * 1024;
export const MAX_MARKDOWN_LINES = 20_000;
export const MAX_MARKDOWN_RENDERED_TAGS = 20_000;

/**
 * Checks UTF-8 size without allocating a byte array for the complete source.
 * The early character-length check is useful for the common ASCII case; the
 * scan handles multibyte and unpaired-surrogate input conservatively.
 */
export function exceedsUtf8ByteLimit(value: string, maximumBytes: number): boolean {
  return utf8ByteLength(value, maximumBytes) > maximumBytes;
}

export function utf8ByteLength(value: string, stopAfter = Number.MAX_SAFE_INTEGER): number {
  if (value.length > stopAfter) return stopAfter + 1;

  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
    if (bytes > stopAfter) return stopAfter + 1;
  }
  return bytes;
}

export function exceedsLineLimit(value: string, maximumLines: number): boolean {
  let lines = 1;
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) === 0x0a && ++lines > maximumLines) return true;
  }
  return false;
}
