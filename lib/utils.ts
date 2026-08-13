import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getComicMimeType(filename: string, fileType?: string): string {
  if (fileType && fileType.trim().length > 0 && fileType !== 'application/octet-stream') {
    return fileType;
  }
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'cbz':
    case 'zip':
      return 'application/zip';
    case 'cbr':
    case 'rar':
      return 'application/x-rar-compressed';
    case 'cb7':
    case '7z':
      return 'application/x-7z-compressed';
    case 'cbt':
    case 'tar':
      return 'application/x-tar';
    case 'pdf':
      return 'application/pdf';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

export function naturalSortFiles(files: File[]): File[] {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  return [...files].sort((a, b) => collator.compare(a.name, b.name));
}

export function deriveMergedTitle(filenames: string[]): string {
  if (filenames.length === 0) return 'Merged Comic Book';
  const cleanNames = filenames.map((f) =>
    f.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')
  );
  let prefix = cleanNames[0];
  for (let i = 1; i < cleanNames.length; i++) {
    while (!cleanNames[i].toLowerCase().startsWith(prefix.toLowerCase()) && prefix.length > 0) {
      prefix = prefix.slice(0, -1);
    }
  }
  prefix = prefix.replace(/[\s#\-_.\d]+$/, '').trim();
  if (prefix.length >= 3) {
    return cleanComicTitle(prefix);
  }
  return cleanComicTitle(cleanNames[0].replace(/#?\d+$/, '').trim()) || 'Merged Comic Book';
}

/**
 * Cleans messy comic titles from scanlation tags, translation credits, domain watermarks,
 * and excess uppercase scanlation signatures while preserving series titles, years, and issue numbers.
 * Function is idempotent and falls back safely to the raw title if over-stripped.
 */
export function cleanComicTitle(rawTitle: string | null | undefined): string {
  if (!rawTitle || typeof rawTitle !== 'string') {
    return '';
  }

  const original = rawTitle.trim();
  if (!original) return '';

  let cleaned = original;

  // 1. Remove file extensions if present
  cleaned = cleaned.replace(/\.(?:cbz|cbr|cb7|cbt|cba|zip|rar|7z|tar|ace|pdf)$/i, '');

  // 2. Normalize underscores to spaces
  cleaned = cleaned.replace(/_/g, ' ');

  // 3. Remove URLs and domain signatures in brackets/parentheses or standalone
  cleaned = cleaned.replace(/\[\s*(?:https?:\/\/|www\.)?[a-zA-Z0-9-]+\.(?:com|org|net|io|co|me|cc|info|tv|xyz|biz|site|club|app|tr|ru|uk)[^\]]*\]/gi, '');
  cleaned = cleaned.replace(/\(\s*(?:https?:\/\/|www\.)?[a-zA-Z0-9-]+\.(?:com|org|net|io|co|me|cc|info|tv|xyz|biz|site|club|app|tr|ru|uk)[^\)]*\)/gi, '');
  cleaned = cleaned.replace(/(?:https?:\/\/|www\.)\S+/gi, '');
  cleaned = cleaned.replace(/(?:^|\s)[a-zA-Z0-9-]+\.(?:com|org|net|io|co|me|cc|info|tv|xyz|biz|site|club|app|tr|ru|uk)\b.*$/gi, '');

  // 4. Remove scanlation/release/ripper group tags in brackets or parentheses
  cleaned = cleaned.replace(/\[\s*(?:digital|digital-empire|scan|scans|c2c|novus|empire|minutemen|dcp|zone-empire|nemesis43|orochi|phobos|tlk-empire|g-empire|darthscanner|greengiant|kax|drk|f|webrip|web-dl|hd|re-rip|complete)[^\]]*\]/gi, '');
  cleaned = cleaned.replace(/\(\s*(?:digital|digital-empire|scan|scans|c2c|novus|empire|minutemen|dcp|zone-empire|nemesis43|orochi|phobos|tlk-empire|g-empire|darthscanner|greengiant|kax|drk|f|webrip|web-dl|hd|re-rip|complete)[^\)]*\)/gi, '');

  // 5. Remove known scanlation and translation signature prefixes and tails
  cleaned = cleaned.replace(/(?:^|\s|[-_:|])\s*(?:SCANS?\s+BY|ÇEVİRİ\s*:?|CEVIRI\s*:?|TRANSLATION\s*:?|RELEASED\s+BY|SCANLATION\s*:?|SCAN\s+BY|RIPPED\s+BY|EDIT\s*:?|BALONLAMA\s*:?|TEAM\s+[A-Z0-9]+).*$/giu, '');
  cleaned = cleaned.replace(/(?:^|\s|[-_:|])\s*(?:TÜRKÇE|TURKCE)\s+(?:KONSEY|DİYARI|DIYARI|ÇİZGİ|CIZGI|ROMAN|GRUP|TEAM|SCANLATION|COMICS|PAYLAŞIM|PAYLASIM).*$/giu, '');
  cleaned = cleaned.replace(/(?:^|\s|[-_:|])\s*(?:KONSEY\s+COMICS|CIZGI\s+DIYARI|ÇİZGİ\s+DİYARI|CBR\s+PAYLASIM).*$/giu, '');

  // 6. Post-Issue/Year Watermark Trimming
  // If after issue pattern (#1, #01, Issue 1) or year (2018), there is a trailing watermark phrase, trim it
  cleaned = cleaned.replace(/((?:#\d+|Issue\s+\d+|\(\d{4}\)|\[\d{4}\]))\s+(?:TÜRKÇE|TURKCE|KONSEY|SCANS?|DIGITAL|WWW|SCANLATION|ÇEVİRİ|CEVIRI|MINUTEMEN|EMPIRE|DCP|ZONE|RELEASED|RIP|HD)\b.*$/giu, '$1');

  // 7. Remove empty brackets/parentheses left behind
  cleaned = cleaned.replace(/\(\s*\)/g, '').replace(/\[\s*\]/g, '');

  // 8. Clean up trailing/leading punctuation and excess spaces
  cleaned = cleaned.replace(/[\s\-_:/|]+$/, '').replace(/^[\s\-_:/|]+/, '').trim();
  cleaned = cleaned.replace(/\s{2,}/g, ' ');

  // 9. Smart Title Case conversion: If title is entirely UPPERCASE, convert to Title Case
  const lettersOnly = cleaned.replace(/[^a-zA-Z]/g, '');
  if (lettersOnly.length > 3 && lettersOnly === lettersOnly.toUpperCase()) {
    cleaned = cleaned.replace(/\b([a-zA-Z])([a-zA-Z]*)\b/g, (match, first, rest) => {
      // Keep standard Roman numerals or established short acronyms uppercase
      if (/^(?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|CBR|CBZ|PDF|DC|MCU)$/i.test(match)) {
        return match.toUpperCase();
      }
      return first.toUpperCase() + rest.toLowerCase();
    });
  }

  // 10. Fallback if over-stripped
  if (!cleaned || cleaned.length < 2) {
    return original;
  }

  return cleaned;
}

