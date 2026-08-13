import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';
import { extractComicArchive } from './extractor';
import { createComic } from './db';
import { Comic, ComicPage } from './types';

function createComicPageSVG(
  title: string,
  issueNum: number,
  pageNum: number,
  totalPages: number,
  heroTheme: 'sentinel' | 'spider' | 'xdefenders'
): string {
  let primaryColor = '#ED1D24'; // Marvel Red
  let secondaryColor = '#F59E0B'; // Gold
  let bgGradient1 = '#12121c';
  let bgGradient2 = '#08080f';
  let heroName = 'THE SENTINEL';
  let dialogue1 = 'THE COSMIC CORE IS STABILIZING!';
  let dialogue2 = 'STAND BACK! QUANTUM BLAST CHARGING!';
  let soundEffect = 'BOOM!';

  if (heroTheme === 'spider') {
    primaryColor = '#2563EB'; // Spider Blue
    secondaryColor = '#DC2626'; // Red
    heroName = 'SPIDER-KNIGHT';
    dialogue1 = 'WITH GREAT POWER COMES GREAT RESPONSIBILITY!';
    dialogue2 = 'SWINGING IN FOR THE NEON TAKEDOWN!';
    soundEffect = 'THWIP!';
  } else if (heroTheme === 'xdefenders') {
    primaryColor = '#EAB308'; // Mutant Yellow
    secondaryColor = '#1D4ED8'; // Blue
    heroName = 'X-DEFENDERS';
    dialogue1 = 'MUTANT PROTOCOL INITIATED! FORM UP!';
    dialogue2 = 'COMMENCING POWER COMBINATION ATTACK!';
    soundEffect = 'KRAKATHOM!';
  }

  const isCover = pageNum === 1;

  if (isCover) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1200" width="800" height="1200">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${bgGradient1}"/>
      <stop offset="100%" stop-color="${bgGradient2}"/>
    </linearGradient>
    <radialGradient id="burst" cx="50%" cy="40%" r="50%">
      <stop offset="0%" stop-color="${secondaryColor}" stop-opacity="0.8"/>
      <stop offset="70%" stop-color="${primaryColor}" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.9"/>
    </radialGradient>
    <pattern id="halftone" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
      <circle cx="10" cy="10" r="3" fill="${primaryColor}" opacity="0.25"/>
    </pattern>
  </defs>

  <!-- Background -->
  <rect width="800" height="1200" fill="url(#bg)"/>
  <rect width="800" height="1200" fill="url(#burst)"/>
  <rect width="800" height="1200" fill="url(#halftone)"/>

  <!-- Comic Outer Frame -->
  <rect x="20" y="20" width="760" height="1160" fill="none" stroke="#000000" stroke-width="8"/>
  <rect x="28" y="28" width="744" height="1144" fill="none" stroke="${secondaryColor}" stroke-width="4"/>

  <!-- Top Banner Header -->
  <rect x="28" y="28" width="744" height="120" fill="#000000"/>
  <rect x="36" y="36" width="728" height="104" fill="${primaryColor}"/>
  <text x="50" y="80" font-family="'Bangers', Impact, sans-serif" font-size="42" fill="#FFFFFF" letter-spacing="2">HERO VAULT ARCHIVES</text>
  <text x="50" y="115" font-family="'Oswald', sans-serif" font-size="20" fill="${secondaryColor}" font-weight="bold">APPROVED BY THE MARVEL COMIC CODE • ISSUE #${issueNum}</text>

  <!-- Price Badge -->
  <polygon points="680,36 764,36 764,120 680,120" fill="${secondaryColor}"/>
  <text x="722" y="75" font-family="'Oswald', sans-serif" font-size="24" fill="#000000" font-weight="900" text-anchor="middle">75¢</text>
  <text x="722" y="105" font-family="'Oswald', sans-serif" font-size="16" fill="#000000" font-weight="bold" text-anchor="middle">AUG</text>

  <!-- Title Banner -->
  <g transform="translate(40, 240) rotate(-2)">
    <rect x="-10" y="-10" width="720" height="160" fill="#000000" rx="10"/>
    <rect x="-5" y="-5" width="710" height="150" fill="${secondaryColor}" rx="8"/>
    <text x="350" y="85" font-family="'Bangers', Impact, sans-serif" font-size="76" fill="${primaryColor}" stroke="#000000" stroke-width="6" text-anchor="middle" letter-spacing="3">${heroName}</text>
    <text x="350" y="130" font-family="'Bangers', Impact, sans-serif" font-size="36" fill="#FFFFFF" stroke="#000000" stroke-width="2" text-anchor="middle">${title.toUpperCase()}</text>
  </g>

  <!-- Hero Art Illustration Silhouette -->
  <circle cx="400" cy="620" r="220" fill="none" stroke="${primaryColor}" stroke-width="12" opacity="0.8"/>
  <path d="M 400 440 L 460 540 L 560 560 L 480 640 L 500 740 L 400 680 L 300 740 L 320 640 L 240 560 L 340 540 Z" fill="${secondaryColor}" stroke="#000000" stroke-width="6"/>

  <!-- Action Text Burst -->
  <polygon points="120,780 280,750 250,830 380,820 270,890 320,980 200,920 150,1020 120,910 20,880 90,830" fill="${primaryColor}" stroke="#000000" stroke-width="4"/>
  <text x="180" y="860" font-family="'Bangers', Impact, sans-serif" font-size="48" fill="#FFFFFF" stroke="#000000" stroke-width="3" text-anchor="middle" transform="rotate(-10, 180, 860)">${soundEffect}</text>

  <!-- Cover Caption -->
  <rect x="360" y="880" fill="#000000" width="380" height="110" rx="6"/>
  <rect x="365" y="885" fill="#FFFFFF" width="370" height="100" rx="4"/>
  <text x="550" y="925" font-family="'Oswald', sans-serif" font-size="22" fill="#000000" font-weight="900" text-anchor="middle">"THE UNIVERSE WILL NEVER BE THE SAME!"</text>
  <text x="550" y="960" font-family="'Oswald', sans-serif" font-size="18" fill="${primaryColor}" font-weight="700" text-anchor="middle">PLUS: SECRET ORIGIN REVEALED!</text>

  <!-- Footer -->
  <rect x="28" y="1120" width="744" height="44" fill="#000000"/>
  <text x="400" y="1148" font-family="'Oswald', sans-serif" font-size="16" fill="#FFFFFF" text-anchor="middle">PAGE 1 OF ${totalPages} • DIGITAL VAULT EDITION</text>
</svg>`;
  }

  // Inside Comic Story Page
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1200" width="800" height="1200">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${bgGradient1}"/>
      <stop offset="100%" stop-color="${bgGradient2}"/>
    </linearGradient>
    <pattern id="dots" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
      <circle cx="8" cy="8" r="2" fill="${secondaryColor}" opacity="0.2"/>
    </pattern>
  </defs>

  <rect width="800" height="1200" fill="url(#bg)"/>
  <rect width="800" height="1200" fill="url(#dots)"/>

  <!-- Page Header Bar -->
  <rect x="30" y="20" width="740" height="40" fill="#000000"/>
  <text x="50" y="46" font-family="'Oswald', sans-serif" font-size="18" fill="${secondaryColor}" font-weight="bold">${heroName} #${issueNum}</text>
  <text x="750" y="46" font-family="'Oswald', sans-serif" font-size="18" fill="#FFFFFF" font-weight="bold" text-anchor="end">CHAPTER ${Math.ceil(pageNum / 3)} • PAGE ${pageNum}</text>

  <!-- PANEL 1 (Top Large Action Panel) -->
  <g transform="translate(40, 80)">
    <rect x="0" y="0" width="720" height="320" fill="#181824" stroke="#000000" stroke-width="6"/>
    <rect x="6" y="6" width="708" height="308" fill="none" stroke="${primaryColor}" stroke-width="2"/>
    
    <!-- Panel Backdrop graphic -->
    <path d="M 0 0 L 720 320" stroke="${primaryColor}" stroke-width="4" stroke-dasharray="10 10" opacity="0.3"/>
    <path d="M 720 0 L 0 320" stroke="${secondaryColor}" stroke-width="4" stroke-dasharray="10 10" opacity="0.3"/>
    <circle cx="360" cy="160" r="100" fill="${primaryColor}" opacity="0.2"/>

    <!-- Narration Box -->
    <rect x="20" y="20" width="340" height="60" fill="#FDE047" stroke="#000000" stroke-width="3"/>
    <text x="35" y="45" font-family="'Oswald', sans-serif" font-size="16" fill="#000000" font-weight="bold">LOCATION: SUB-LEVEL 4 SANCTUARY...</text>
    <text x="35" y="65" font-family="'Oswald', sans-serif" font-size="14" fill="#000000">"THE ENERGY SIGNATURE IS OFF THE CHARTS!"</text>

    <!-- Speech Bubble 1 -->
    <path d="M 400 120 Q 420 90 520 90 Q 640 90 640 140 Q 640 190 520 190 Q 470 190 440 210 L 450 190 Q 400 190 400 120 Z" fill="#FFFFFF" stroke="#000000" stroke-width="3"/>
    <text x="520" y="130" font-family="'Oswald', sans-serif" font-size="18" fill="#000000" font-weight="bold" text-anchor="middle">${dialogue1}</text>
    <text x="520" y="160" font-family="'Oswald', sans-serif" font-size="14" fill="#ED1D24" font-weight="bold" text-anchor="middle">"WE ONLY HAVE 30 SECONDS!"</text>
  </g>

  <!-- PANEL 2 (Middle Left Panel) -->
  <g transform="translate(40, 420)">
    <rect x="0" y="0" width="345" height="340" fill="#1e1e2d" stroke="#000000" stroke-width="6"/>
    <polygon points="50,50 120,20 280,80 200,280 80,240" fill="${secondaryColor}" opacity="0.3"/>
    
    <!-- Action Word Burst -->
    <polygon points="170,120 240,90 220,150 290,160 230,200 260,260 190,220 150,280 140,210 70,200 120,160" fill="${primaryColor}" stroke="#000000" stroke-width="4"/>
    <text x="180" y="185" font-family="'Bangers', Impact, sans-serif" font-size="44" fill="#FFFFFF" stroke="#000000" stroke-width="2" text-anchor="middle" transform="rotate(-12, 180, 185)">${soundEffect}</text>

    <!-- Speech Bubble -->
    <rect x="20" y="20" width="220" height="50" rx="15" fill="#FFFFFF" stroke="#000000" stroke-width="3"/>
    <text x="130" y="50" font-family="'Oswald', sans-serif" font-size="15" fill="#000000" font-weight="bold" text-anchor="middle">"TAKE THIS!"</text>
  </g>

  <!-- PANEL 3 (Middle Right Panel) -->
  <g transform="translate(415, 420)">
    <rect x="0" y="0" width="345" height="340" fill="#1e1e2d" stroke="#000000" stroke-width="6"/>
    <circle cx="172" cy="170" r="110" fill="none" stroke="${secondaryColor}" stroke-width="8"/>
    
    <text x="172" y="140" font-family="'Bangers', Impact, sans-serif" font-size="32" fill="${secondaryColor}" text-anchor="middle">HEROIC MOMENT</text>
    
    <!-- Speech Bubble -->
    <path d="M 40 200 Q 40 160 170 160 Q 300 160 300 200 Q 300 240 170 240 Q 120 240 90 260 L 100 240 Q 40 240 40 200 Z" fill="#FFFFFF" stroke="#000000" stroke-width="3"/>
    <text x="170" y="195" font-family="'Oswald', sans-serif" font-size="16" fill="#000000" font-weight="bold" text-anchor="middle">${dialogue2}</text>
  </g>

  <!-- PANEL 4 (Bottom Full Width Climax Panel) -->
  <g transform="translate(40, 780)">
    <rect x="0" y="0" width="720" height="360" fill="#000000" stroke="#000000" stroke-width="6"/>
    <rect x="8" y="8" width="704" height="344" fill="${primaryColor}" opacity="0.8"/>
    
    <!-- Speed Lines -->
    <line x1="0" y1="0" x2="720" y2="360" stroke="#FFFFFF" stroke-width="3" opacity="0.4"/>
    <line x1="720" y1="0" x2="0" y2="360" stroke="#FFFFFF" stroke-width="3" opacity="0.4"/>
    <line x1="360" y1="0" x2="360" y2="360" stroke="#FFFFFF" stroke-width="5" opacity="0.4"/>

    <!-- Big Center Impact Word -->
    <text x="360" y="190" font-family="'Bangers', Impact, sans-serif" font-size="84" fill="#FDE047" stroke="#000000" stroke-width="6" text-anchor="middle" letter-spacing="4">TO BE CONTINUED...</text>

    <!-- Narration Box Bottom Right -->
    <rect x="380" y="270" width="320" height="60" fill="#FFFFFF" stroke="#000000" stroke-width="3"/>
    <text x="540" y="295" font-family="'Oswald', sans-serif" font-size="16" fill="#000000" font-weight="bold" text-anchor="middle">NEXT ISSUE: THE FINAL SHOWDOWN!</text>
    <text x="540" y="318" font-family="'Oswald', sans-serif" font-size="14" fill="${primaryColor}" font-weight="bold" text-anchor="middle">DONT MISS ISSUE #${issueNum + 1}!</text>
  </g>
</svg>`;
}

export async function generateAndSeedSampleComics(userId: string): Promise<number> {
  const samplesConfig = [
    {
      title: 'The Avenging Sentinel #1: Rise of the Cosmic Core',
      series: 'The Avenging Sentinel',
      issueNumber: 1,
      theme: 'sentinel' as const,
      pagesCount: 12,
      tags: ['Avengers', 'Cosmic', 'Action', 'Featured'],
      summary: 'When a mysterious cosmic anomaly threatens Manhattan, the Avenging Sentinel must harness quantum reactor energy before the Core destabilizes!',
      publisher: 'Marvel Hero Vault',
      year: 2026,
    },
    {
      title: 'Spider-Knight #14: Neon Shadows Over Manhattan',
      series: 'Spider-Knight',
      issueNumber: 14,
      theme: 'spider' as const,
      pagesCount: 10,
      tags: ['Spider-Verse', 'Manhattan', 'Street-Level'],
      summary: 'High above the neon lights of Times Square, Spider-Knight faces off against a shadowy syndicate wielding stolen Stark technology.',
      publisher: 'Marvel Hero Vault',
      year: 2026,
    },
    {
      title: 'X-Defenders #1: Mutant Protocol',
      series: 'X-Defenders',
      issueNumber: 1,
      theme: 'xdefenders' as const,
      pagesCount: 10,
      tags: ['X-Men', 'Mutants', 'Team-Up'],
      summary: 'A new mutant strike team gathers in the Danger Room to test their combined energy powers against an omega-level sentinel protocol.',
      publisher: 'Marvel Hero Vault',
      year: 2026,
    },
  ];

  let seededCount = 0;

  for (const sample of samplesConfig) {
    const zip = new JSZip();

    for (let p = 1; p <= sample.pagesCount; p++) {
      const svgStr = createComicPageSVG(
        sample.series,
        sample.issueNumber,
        p,
        sample.pagesCount,
        sample.theme
      );
      // Save SVG as string in zip (e.g. page_001.svg)
      const formattedNum = String(p).padStart(3, '0');
      zip.file(`page_${formattedNum}.svg`, svgStr);
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    const filename = `${sample.series.replace(/\s+/g, '_')}_${sample.issueNumber}.cbz`;

    // Extract archive buffer
    const extraction = await extractComicArchive(zipBuffer, filename);

    if (extraction.success && extraction.pages.length > 0) {
      const comicId = `comic_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const comicUploadDir = path.join(process.cwd(), 'public', 'uploads', userId, comicId);
      fs.mkdirSync(comicUploadDir, { recursive: true });

      const pageEntities: ComicPage[] = [];

      for (let i = 0; i < extraction.pages.length; i++) {
        const page = extraction.pages[i];
        const pageFilename = `page_${String(page.pageNumber).padStart(3, '0')}.svg`;
        const filePath = path.join(comicUploadDir, pageFilename);
        fs.writeFileSync(filePath, page.data);

        const pageUrl = `/uploads/${userId}/${comicId}/${pageFilename}`;
        pageEntities.push({
          id: `page_${comicId}_${page.pageNumber}`,
          comicId,
          pageNumber: page.pageNumber,
          filename: pageFilename,
          imageUrl: pageUrl,
        });
      }

      const coverImageUrl = pageEntities[0]?.imageUrl || '';

      const comicEntity: Comic = {
        id: comicId,
        userId,
        title: sample.title,
        series: sample.series,
        issueNumber: sample.issueNumber,
        originalFilename: filename,
        format: 'CBZ',
        coverImageUrl,
        pageCount: pageEntities.length,
        fileSizeBytes: zipBuffer.length,
        publisher: sample.publisher,
        year: sample.year,
        summary: sample.summary,
        tags: sample.tags,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await createComic(comicEntity, pageEntities);
      seededCount++;
    }
  }

  return seededCount;
}
