interface KnownImageInfo {
  format: "png" | "jpeg";
  width: number;
  height: number;
  bitDepth: number;
  hasAlphaChannel: boolean;
  hasIccProfile: boolean;
}

export type ImageInfo =
  | KnownImageInfo
  | {
      format: "unknown";
      width?: never;
      height?: never;
      bitDepth?: never;
      hasAlphaChannel?: never;
      hasIccProfile?: never;
    };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_CHUNK_HEADER_SIZE = 8;
const PNG_CHUNK_CRC_SIZE = 4;
const PNG_IHDR_SIZE = 13;
const JPEG_ICC_SIGNATURE = "ICC_PROFILE\0";

function matches(bytes: Uint8Array, offset: number, text: string): boolean {
  if (offset + text.length > bytes.length) return false;
  for (let index = 0; index < text.length; index++) {
    if (bytes[offset + index] !== text.charCodeAt(index)) return false;
  }
  return true;
}

function readPng(bytes: Uint8Array, view: DataView): ImageInfo {
  const header = PNG_SIGNATURE.length;
  const fields = header + PNG_CHUNK_HEADER_SIZE;
  if (
    bytes.length < fields + PNG_IHDR_SIZE ||
    view.getUint32(header) !== PNG_IHDR_SIZE ||
    !matches(bytes, header + 4, "IHDR")
  ) {
    return { format: "unknown" };
  }
  const info: KnownImageInfo = {
    format: "png",
    width: view.getUint32(fields),
    height: view.getUint32(fields + 4),
    bitDepth: view.getUint8(fields + 8),
    hasAlphaChannel: bytes[fields + 9] === 4 || bytes[fields + 9] === 6,
    hasIccProfile: false,
  };
  let offset = fields + PNG_IHDR_SIZE + PNG_CHUNK_CRC_SIZE;
  while (offset + PNG_CHUNK_HEADER_SIZE <= bytes.length) {
    const length = view.getUint32(offset);
    const type = offset + 4;
    if (matches(bytes, type, "IDAT") || matches(bytes, type, "IEND")) break;
    if (matches(bytes, type, "iCCP")) info.hasIccProfile = true;
    if (matches(bytes, type, "tRNS")) info.hasAlphaChannel = true;
    const end = offset + PNG_CHUNK_HEADER_SIZE + length + PNG_CHUNK_CRC_SIZE;
    if (end > bytes.length) break;
    offset = end;
  }
  return info;
}

function readJpeg(bytes: Uint8Array, view: DataView): ImageInfo {
  let offset = 2;
  let info: KnownImageInfo | undefined;
  let hasIccProfile = false;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) break;
    while (offset < bytes.length && bytes[offset] === 0xff) offset++;
    if (offset >= bytes.length) break;
    const marker = view.getUint8(offset++);
    if (marker === 0xda || marker === 0xd9) break;
    if ((marker >= 0xd0 && marker <= 0xd8) || marker === 0x01) continue;
    if (offset + 2 > bytes.length) break;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > bytes.length) break;
    const payload = offset + 2;
    if (
      marker === 0xe2 &&
      length >= 2 + JPEG_ICC_SIGNATURE.length &&
      matches(bytes, payload, JPEG_ICC_SIGNATURE)
    ) {
      hasIccProfile = true;
    }
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      if (length < 7) break;
      info = {
        format: "jpeg",
        width: view.getUint16(payload + 3),
        height: view.getUint16(payload + 1),
        bitDepth: view.getUint8(payload),
        hasAlphaChannel: false,
        hasIccProfile: false,
      };
    }
    offset += length;
  }
  return info ? { ...info, hasIccProfile } : { format: "unknown" };
}

export function readImageInfo(bytes: Uint8Array): ImageInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length >= PNG_SIGNATURE.length &&
    PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
  ) {
    return readPng(bytes, view);
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return readJpeg(bytes, view);
  return { format: "unknown" };
}
