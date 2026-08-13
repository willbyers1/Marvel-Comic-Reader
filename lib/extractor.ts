import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import * as tar from 'tar';
import { createExtractorFromData } from 'node-unrar-js';
import { ComicFormat } from './types';

export interface ExtractedPage {
  pageNumber: number;
  filename: string;
  data: Buffer;
  mimeType: string;
}

export interface ExtractionResult {
  success: boolean;
  format: ComicFormat;
  pages: ExtractedPage[];
  error?: string;
  totalUncompressedSize?: number;
}

const MAX_UNCOMPRESSED_BYTES = 500 * 1024 * 1024; // 500MB safety cap
const MAX_PAGES = 500;

// Magic byte signature detection
export function detectFormat(buffer: Buffer, filename: string): ComicFormat {
  if (buffer.length < 10) return 'UNKNOWN';

  // Check ZIP (CBZ): 0x50 0x4B 0x03 0x04 ('PK\x03\x04')
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    return 'CBZ';
  }

  // Check RAR (CBR): 0x52 0x61 0x72 0x21 0x1A 0x07 ('Rar!\x1a\x07')
  if (buffer[0] === 0x52 && buffer[1] === 0x61 && buffer[2] === 0x72 && buffer[3] === 0x21) {
    return 'CBR';
  }

  // Check 7Z (CB7): 0x37 0x7A 0xBC 0xAF 0x27 0x1C ('7z\xbc\xaf\x27\x1c')
  if (buffer[0] === 0x37 && buffer[1] === 0x7a && buffer[2] === 0xbc && buffer[3] === 0xaf) {
    return 'CB7';
  }

  // Check TAR (CBT): 'ustar' at offset 257
  if (buffer.length > 262) {
    const magicTar = buffer.subarray(257, 262).toString('ascii');
    if (magicTar === 'ustar') {
      return 'CBT';
    }
  }

  // Check ACE (CBA): '**ACE**' at offset 7
  if (buffer.length > 14) {
    const magicAce = buffer.subarray(7, 14).toString('ascii');
    if (magicAce === '**ACE**') {
      return 'CBA';
    }
  }

  // Fallback to extension check
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.cbz' || ext === '.zip') return 'CBZ';
  if (ext === '.cbr' || ext === '.rar') return 'CBR';
  if (ext === '.cb7' || ext === '.7z') return 'CB7';
  if (ext === '.cbt' || ext === '.tar') return 'CBT';
  if (ext === '.cba' || ext === '.ace') return 'CBA';

  return 'UNKNOWN';
}

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.bmp':
      return 'image/bmp';
    default:
      return 'image/jpeg';
  }
}

function isValidImageFile(entryPath: string): boolean {
  if (entryPath.includes('__MACOSX') || entryPath.includes('.DS_Store') || entryPath.startsWith('.')) {
    return false;
  }
  const ext = path.extname(entryPath).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'].includes(ext);
}

// Natural numerical sort: "page2.jpg" before "page10.jpg"
export function naturalSortFilenames(filenames: string[]): string[] {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  return [...filenames].sort((a, b) => collator.compare(path.basename(a), path.basename(b)));
}

// ZIP (CBZ) Extraction
async function extractZip(buffer: Buffer): Promise<{ pages: ExtractedPage[]; totalSize: number }> {
  const zip = new AdmZip(buffer);
  const zipEntries = zip.getEntries();

  const imageEntries = zipEntries.filter((entry) => !entry.isDirectory && isValidImageFile(entry.entryName));
  const entryNames = imageEntries.map((e) => e.entryName);
  const sortedNames = naturalSortFilenames(entryNames);

  let totalSize = 0;
  const pages: ExtractedPage[] = [];

  for (let i = 0; i < sortedNames.length && i < MAX_PAGES; i++) {
    const entryName = sortedNames[i];
    const entry = imageEntries.find((e) => e.entryName === entryName);
    if (entry) {
      const data = entry.getData();
      totalSize += data.length;
      if (totalSize > MAX_UNCOMPRESSED_BYTES) {
        throw new Error(`Archive exceeds maximum uncompressed safety limit (${MAX_UNCOMPRESSED_BYTES / 1024 / 1024}MB)`);
      }
      pages.push({
        pageNumber: i + 1,
        filename: path.basename(entryName),
        data,
        mimeType: getMimeType(entryName),
      });
    }
  }

  return { pages, totalSize };
}

function getUnrarWasmBinary(): ArrayBuffer | undefined {
  const candidatePaths = [
    path.join(process.cwd(), 'node_modules', 'node-unrar-js', 'dist', 'js', 'unrar.wasm'),
    path.join(process.cwd(), 'node_modules', 'node-unrar-js', 'esm', 'js', 'unrar.wasm'),
  ];

  try {
    const mainPath = require.resolve('node-unrar-js');
    const baseDir = path.dirname(mainPath);
    candidatePaths.push(
      path.join(baseDir, 'js', 'unrar.wasm'),
      path.join(baseDir, '..', 'dist', 'js', 'unrar.wasm'),
      path.join(baseDir, '..', 'esm', 'js', 'unrar.wasm')
    );
  } catch {
    // Ignore resolution error
  }

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      try {
        const buf = fs.readFileSync(candidate);
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      } catch (err) {
        console.warn('Failed reading unrar.wasm at:', candidate, err);
      }
    }
  }
  return undefined;
}

// RAR (CBR) Extraction via node-unrar-js WASM
async function extractRar(buffer: Buffer): Promise<{ pages: ExtractedPage[]; totalSize: number }> {
  const wasmBinary = getUnrarWasmBinary();
  const extractor = await createExtractorFromData({
    data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
    ...(wasmBinary ? { wasmBinary } : {}),
  });

  const list = extractor.getFileList();
  const fileHeaders = [...list.fileHeaders];

  const imageHeaders = fileHeaders.filter((h) => !h.flags.directory && isValidImageFile(h.name));
  const sortedNames = naturalSortFilenames(imageHeaders.map((h) => h.name));

  const extracted = extractor.extract({
    files: sortedNames,
  });

  const filesArray = [...extracted.files];
  let totalSize = 0;
  const pages: ExtractedPage[] = [];

  for (let i = 0; i < sortedNames.length && i < MAX_PAGES; i++) {
    const targetName = sortedNames[i];
    const fileResult = filesArray.find((f) => f.fileHeader.name === targetName);
    if (fileResult && fileResult.extraction) {
      const pageData = Buffer.from(fileResult.extraction);
      totalSize += pageData.length;
      if (totalSize > MAX_UNCOMPRESSED_BYTES) {
        throw new Error('CBR archive exceeds maximum uncompressed size safety limit.');
      }
      pages.push({
        pageNumber: i + 1,
        filename: path.basename(targetName),
        data: pageData,
        mimeType: getMimeType(targetName),
      });
    }
  }

  return { pages, totalSize };
}

// TAR (CBT) Extraction
async function extractTar(buffer: Buffer, tempDir: string): Promise<{ pages: ExtractedPage[]; totalSize: number }> {
  const tarFile = path.join(tempDir, 'temp.tar');
  fs.writeFileSync(tarFile, buffer);

  const extractDir = path.join(tempDir, 'tar_out');
  fs.mkdirSync(extractDir, { recursive: true });

  await tar.x({
    file: tarFile,
    cwd: extractDir,
  });

  function readDirRecursive(dir: string): string[] {
    let results: string[] = [];
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat && stat.isDirectory()) {
        results = results.concat(readDirRecursive(fullPath));
      } else {
        results.push(fullPath);
      }
    }
    return results;
  }

  const allFiles = readDirRecursive(extractDir);
  const imageFiles = allFiles.filter((f) => isValidImageFile(f));
  const sortedFiles = naturalSortFilenames(imageFiles);

  let totalSize = 0;
  const pages: ExtractedPage[] = [];

  for (let i = 0; i < sortedFiles.length && i < MAX_PAGES; i++) {
    const filePath = sortedFiles[i];
    const pageData = fs.readFileSync(filePath);
    totalSize += pageData.length;
    if (totalSize > MAX_UNCOMPRESSED_BYTES) {
      throw new Error('CBT archive exceeds max size limit.');
    }
    pages.push({
      pageNumber: i + 1,
      filename: path.basename(filePath),
      data: pageData,
      mimeType: getMimeType(filePath),
    });
  }

  return { pages, totalSize };
}

// Main Extraction Entry Point
export async function extractComicArchive(buffer: Buffer, filename: string): Promise<ExtractionResult> {
  const format = detectFormat(buffer, filename);

  if (format === 'UNKNOWN') {
    return {
      success: false,
      format,
      pages: [],
      error: 'Unsupported or corrupted archive file format. Supported formats: CBZ, CBR, CB7, CBT, CBA.',
    };
  }

  if (format === 'CBA') {
    return {
      success: false,
      format,
      pages: [],
      error: 'CBA (ACE) format detected. ACE is a legacy archive format with limited web runtime support. Please convert your comic to CBZ or CBR format.',
    };
  }

  const tempDir = path.join(process.cwd(), 'tmp_extract', `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    let resultPages: ExtractedPage[] = [];
    let totalSize = 0;

    if (format === 'CBZ') {
      const zipRes = await extractZip(buffer);
      resultPages = zipRes.pages;
      totalSize = zipRes.totalSize;
    } else if (format === 'CBR') {
      const rarRes = await extractRar(buffer);
      resultPages = rarRes.pages;
      totalSize = rarRes.totalSize;
    } else if (format === 'CBT') {
      const tarRes = await extractTar(buffer, tempDir);
      resultPages = tarRes.pages;
      totalSize = tarRes.totalSize;
    } else if (format === 'CB7') {
      // Attempt CBZ zip fallback parsing if 7z container wraps zip/images or throw clean 7z guidance
      try {
        const zipRes = await extractZip(buffer);
        resultPages = zipRes.pages;
        totalSize = zipRes.totalSize;
      } catch {
        return {
          success: false,
          format,
          pages: [],
          error: 'CB7 (7-Zip) extraction failed. For optimal compatibility across all platforms, please re-pack your archive as CBZ (ZIP) or CBR (RAR).',
        };
      }
    }

    if (resultPages.length === 0) {
      return {
        success: false,
        format,
        pages: [],
        error: 'No valid comic page images (.jpg, .png, .webp, .gif) were found inside the archive.',
      };
    }

    return {
      success: true,
      format,
      pages: resultPages,
      totalUncompressedSize: totalSize,
    };
  } catch (err: any) {
    console.error('Archive extraction exception:', err);
    return {
      success: false,
      format,
      pages: [],
      error: err.message || 'Failed to extract comic archive. The file may be damaged or password-protected.',
    };
  } finally {
    // Cleanup temp dir
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (cleanErr) {
      console.warn('Failed to clean temp dir:', cleanErr);
    }
  }
}
