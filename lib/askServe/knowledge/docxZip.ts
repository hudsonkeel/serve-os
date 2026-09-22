// Minimal, dependency-free ZIP reader scoped to exactly what ingesting a
// .docx requires: find a named entry (e.g. "word/document.xml") and return
// its decompressed bytes. A .docx is a standard ZIP container; Node's
// built-in zlib already implements the raw DEFLATE codec ZIP uses (method
// 8), so the only genuinely missing piece is the ZIP container format
// itself (End Of Central Directory record -> Central Directory entries ->
// Local File Header). That format is small, stable, and bounded, so it is
// implemented directly here rather than adding a general-purpose ZIP
// dependency for three source documents.
import { inflateRawSync } from "node:zlib";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;

interface CentralDirectoryEntry {
  fileName: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

function findEndOfCentralDirectory(buffer: Buffer): { centralDirectoryOffset: number; entryCount: number } {
  // The EOCD record is a fixed 22-byte structure (plus an optional comment)
  // at the very end of the file. Scan backwards for its signature rather
  // than assuming a zero-length comment, since Word occasionally appends
  // extra bytes.
  const maxCommentLength = 65535;
  const searchStart = Math.max(0, buffer.length - 22 - maxCommentLength);

  for (let offset = buffer.length - 22; offset >= searchStart; offset--) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) {
      const entryCount = buffer.readUInt16LE(offset + 10);
      const centralDirectoryOffset = buffer.readUInt32LE(offset + 16);
      return { centralDirectoryOffset, entryCount };
    }
  }

  throw new Error("Not a valid ZIP archive: End Of Central Directory record not found");
}

function readCentralDirectory(buffer: Buffer, offset: number, entryCount: number): CentralDirectoryEntry[] {
  const entries: CentralDirectoryEntry[] = [];
  let cursor = offset;

  for (let i = 0; i < entryCount; i++) {
    const signature = buffer.readUInt32LE(cursor);
    if (signature !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error(`Malformed ZIP central directory entry ${i} at offset ${cursor}`);
    }

    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraFieldLength = buffer.readUInt16LE(cursor + 30);
    const fileCommentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);

    const fileNameStart = cursor + 46;
    const fileName = buffer.toString("utf8", fileNameStart, fileNameStart + fileNameLength);

    entries.push({ fileName, compressionMethod, compressedSize, uncompressedSize, localHeaderOffset });

    cursor = fileNameStart + fileNameLength + extraFieldLength + fileCommentLength;
  }

  return entries;
}

function extractEntry(buffer: Buffer, entry: CentralDirectoryEntry): Buffer {
  const localOffset = entry.localHeaderOffset;
  if (buffer.readUInt32LE(localOffset) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error(`Malformed ZIP local file header for "${entry.fileName}"`);
  }

  const localFileNameLength = buffer.readUInt16LE(localOffset + 26);
  const localExtraFieldLength = buffer.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + localFileNameLength + localExtraFieldLength;
  const compressedData = buffer.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    return compressedData; // Stored (no compression).
  }
  if (entry.compressionMethod === 8) {
    return inflateRawSync(compressedData); // Deflate — the only other method .docx/.xlsx producers use.
  }
  throw new Error(`Unsupported ZIP compression method ${entry.compressionMethod} for "${entry.fileName}"`);
}

/** Reads one named entry out of a ZIP (e.g. .docx) buffer. Throws if the entry is absent. */
export function readZipEntry(buffer: Buffer, entryName: string): Buffer {
  const { centralDirectoryOffset, entryCount } = findEndOfCentralDirectory(buffer);
  const entries = readCentralDirectory(buffer, centralDirectoryOffset, entryCount);

  const match = entries.find((e) => e.fileName === entryName);
  if (!match) {
    throw new Error(`ZIP entry "${entryName}" not found. Available: ${entries.map((e) => e.fileName).join(", ")}`);
  }

  return extractEntry(buffer, match);
}

/** Lists every entry name in a ZIP buffer, for diagnostics. */
export function listZipEntries(buffer: Buffer): string[] {
  const { centralDirectoryOffset, entryCount } = findEndOfCentralDirectory(buffer);
  return readCentralDirectory(buffer, centralDirectoryOffset, entryCount).map((e) => e.fileName);
}
