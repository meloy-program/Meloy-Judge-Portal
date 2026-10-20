/**
 * Browser-side image processing for PWS comment sheets.
 *
 * Pipeline:
 *   1. Decode QR code → get teamId
 *   2. Detect four corner alignment markers
 *   3. Compute perspective homography from detected corners → standard page
 *   4. Warp the image to a canonical orientation
 *   5. Crop each of the 6 comment cells
 *
 * All geometry comes from pws-sheet-layout.ts so crops stay in sync with what's printed.
 */

import jsQR from 'jsqr';
import {
  PWS_SHEET_LAYOUT,
  PWS_SHEET_ROW_COUNT,
  getCommentCellRect,
  getMarkerCenters,
  decodeSheetQr,
} from './pws-sheet-layout';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProcessedSheet {
  teamId: string;
  /** The full-page warped image (blob, JPEG) */
  sheetBlob: Blob;
  /** One crop per rubric criterion, in display_order */
  clips: CropClip[];
}

export interface CropClip {
  /** 0-based row index */
  rowIndex: number;
  blob: Blob;
  /** preview data URL for UI */
  previewUrl: string;
}

export interface ProcessSheetOptions {
  /**
   * Output resolution for the warped sheet, in pixels per inch.
   * 150 dpi gives adequate quality for reading handwriting while keeping file sizes small.
   */
  dpi?: number;
  onProgress?: (step: string) => void;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

/**
 * Full pipeline: File → ProcessedSheet.
 * Throws with a descriptive message if any step fails.
 */
export async function processCommentSheet(
  file: File,
  options: ProcessSheetOptions = {}
): Promise<ProcessedSheet> {
  const { dpi = 150, onProgress = () => {} } = options;

  onProgress('Loading image…');
  const srcCanvas = await fileToCanvas(file);

  onProgress('Decoding QR code…');
  const teamId = decodeQrFromCanvas(srcCanvas);
  if (!teamId) {
    throw new Error(
      'Could not find a valid PWS QR code in the photo. Make sure the QR code in the top-right corner is visible and in focus.'
    );
  }

  onProgress('Detecting alignment markers…');
  const srcCorners = detectCornerMarkers(srcCanvas);

  onProgress('Correcting perspective…');
  const { pageCanvas, ppi } = warpPerspective(srcCanvas, srcCorners, dpi);

  onProgress('Cropping comment cells…');
  const clips = await cropCommentCells(pageCanvas, ppi);

  onProgress('Encoding images…');
  const sheetBlob = await canvasToBlob(pageCanvas, 'image/jpeg', 0.85);

  return { teamId, sheetBlob, clips };
}

// ─── Step 1: load file into canvas ───────────────────────────────────────────

async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // Scale down to at most 4000px on the long side for performance
      const maxPx = 4000;
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error('Failed to load image file.'));
    img.src = URL.createObjectURL(file);
  });
}

// ─── Step 2: QR decode ───────────────────────────────────────────────────────

function decodeQrFromCanvas(canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: 'dontInvert',
  });
  if (!code) return null;
  const decoded = decodeSheetQr(code.data);
  return decoded?.teamId ?? null;
}

// ─── Step 3: corner marker detection ─────────────────────────────────────────

interface Point { x: number; y: number }

/**
 * Finds the four corner alignment markers (solid dark squares near each corner).
 * Returns them in the order: [TL, TR, BR, BL] (clockwise from top-left).
 *
 * Strategy: for each corner region (15% of the image), find the centroid of the
 * darkest pixels. Falls back to the literal image corners if detection fails.
 */
function detectCornerMarkers(canvas: HTMLCanvasElement): [Point, Point, Point, Point] {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;

  // Region fraction to search in each corner
  const FRAC = 0.18;

  const regions: { x0: number; y0: number; x1: number; y1: number }[] = [
    { x0: 0,           y0: 0,           x1: W * FRAC, y1: H * FRAC }, // TL
    { x0: W * (1-FRAC), y0: 0,           x1: W,        y1: H * FRAC }, // TR
    { x0: W * (1-FRAC), y0: H * (1-FRAC), x1: W,       y1: H },        // BR
    { x0: 0,           y0: H * (1-FRAC), x1: W * FRAC, y1: H },        // BL
  ];

  const fallbacks: [Point, Point, Point, Point] = [
    { x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H },
  ];

  return regions.map((r, i) => {
    const rx = Math.round(r.x0);
    const ry = Math.round(r.y0);
    const rw = Math.round(r.x1 - r.x0);
    const rh = Math.round(r.y1 - r.y0);
    if (rw <= 0 || rh <= 0) return fallbacks[i];

    const data = ctx.getImageData(rx, ry, rw, rh).data;

    // Find darkest pixels (luminance below threshold)
    const DARK_THRESH = 60; // 0-255
    let sumX = 0, sumY = 0, count = 0;

    for (let py = 0; py < rh; py++) {
      for (let px = 0; px < rw; px++) {
        const idx = (py * rw + px) * 4;
        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        if (lum < DARK_THRESH) {
          sumX += px;
          sumY += py;
          count++;
        }
      }
    }

    if (count < 10) return fallbacks[i]; // not enough dark pixels → use corner
    return { x: rx + sumX / count, y: ry + sumY / count };
  }) as [Point, Point, Point, Point];
}

// ─── Step 4: perspective warp ─────────────────────────────────────────────────

interface WarpResult {
  pageCanvas: HTMLCanvasElement;
  /** pixels per inch in the output canvas */
  ppi: number;
}

/**
 * Warps the source canvas so the four detected corners map to the four corners
 * of a standard US Letter landscape page at `dpi` pixels per inch.
 *
 * Uses an inverse bilinear perspective transform (homography).
 */
function warpPerspective(
  src: HTMLCanvasElement,
  srcCorners: [Point, Point, Point, Point],
  dpi: number
): WarpResult {
  const PAGE = PWS_SHEET_LAYOUT.page; // { width: 11, height: 8.5 }
  const outW = Math.round(PAGE.width * dpi);
  const outH = Math.round(PAGE.height * dpi);

  // Destination corners (clockwise TL, TR, BR, BL) in output canvas coords
  const dstCorners: [Point, Point, Point, Point] = [
    { x: 0, y: 0 },
    { x: outW, y: 0 },
    { x: outW, y: outH },
    { x: 0, y: outH },
  ];

  // Compute inverse homography: output pixel → source pixel
  const H = computeHomography(dstCorners, srcCorners);

  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const outCtx = out.getContext('2d')!;

  // Draw with perspective: build a temporary offscreen canvas for the src pixels
  // then do the mapping via drawImage on small quads (much faster than per-pixel).
  // For simplicity and correctness at this scale, we tile using 8x8 quads.
  const TILE = 8;
  const srcCtx = src.getContext('2d')!;

  for (let ty = 0; ty < outH; ty += TILE) {
    for (let tx = 0; tx < outW; tx += TILE) {
      const tw = Math.min(TILE, outW - tx);
      const th = Math.min(TILE, outH - ty);

      // Map tile corners through inverse homography
      const pts = [
        applyHomography(H, tx, ty),
        applyHomography(H, tx + tw, ty),
        applyHomography(H, tx + tw, ty + th),
        applyHomography(H, tx, ty + th),
      ];

      // Get a tiny source region (bounding box of the 4 mapped pts)
      const minSX = Math.max(0, Math.min(...pts.map(p => p.x)));
      const minSY = Math.max(0, Math.min(...pts.map(p => p.y)));
      const maxSX = Math.min(src.width - 1, Math.max(...pts.map(p => p.x)));
      const maxSY = Math.min(src.height - 1, Math.max(...pts.map(p => p.y)));
      const sw = maxSX - minSX;
      const sh = maxSY - minSY;

      if (sw <= 0 || sh <= 0) continue;

      // Draw that source region scaled into this tile
      outCtx.drawImage(src, minSX, minSY, sw, sh, tx, ty, tw, th);
    }
  }

  return { pageCanvas: out, ppi: dpi };
}

// ─── 4x4 homography (8-parameter perspective transform) ───────────────────────

type Matrix8 = number[];

/**
 * Computes homography matrix H such that H * [srcPt] ≈ dstPt for 4 point pairs.
 * Returns the 9-element row-major matrix (last element = 1 for normalization).
 */
function computeHomography(
  src: [Point, Point, Point, Point],
  dst: [Point, Point, Point, Point]
): Matrix8 {
  // Build 8x8 linear system Ax = b
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const sx = src[i].x, sy = src[i].y;
    const dx = dst[i].x, dy = dst[i].y;
    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
    b.push(dx);
    b.push(dy);
  }

  return gaussianElimination(A, b);
}

function applyHomography(h: Matrix8, x: number, y: number): Point {
  const w = h[6] * x + h[7] * y + 1;
  return {
    x: (h[0] * x + h[1] * y + h[2]) / w,
    y: (h[3] * x + h[4] * y + h[5]) / w,
  };
}

function gaussianElimination(A: number[][], b: number[]): number[] {
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Pivot
    let maxRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[maxRow][col])) maxRow = r;
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];

    for (let r = col + 1; r < n; r++) {
      const factor = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) {
        M[r][c] -= factor * M[col][c];
      }
    }
  }

  // Back substitution
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n];
    for (let j = i + 1; j < n; j++) {
      x[i] -= M[i][j] * x[j];
    }
    x[i] /= M[i][i];
  }
  return x;
}

// ─── Step 5: crop comment cells ───────────────────────────────────────────────

async function cropCommentCells(
  pageCanvas: HTMLCanvasElement,
  ppi: number
): Promise<CropClip[]> {
  const clips: CropClip[] = [];
  const ctx = pageCanvas.getContext('2d')!;

  for (let row = 0; row < PWS_SHEET_ROW_COUNT; row++) {
    const rect = getCommentCellRect(row);
    // Convert inches → pixels
    const px = Math.round(rect.x * ppi);
    const py = Math.round(rect.y * ppi);
    const pw = Math.round(rect.width * ppi);
    const ph = Math.round(rect.height * ppi);

    const cellCanvas = document.createElement('canvas');
    cellCanvas.width = pw;
    cellCanvas.height = ph;
    const cellCtx = cellCanvas.getContext('2d')!;
    cellCtx.drawImage(pageCanvas, px, py, pw, ph, 0, 0, pw, ph);

    const blob = await canvasToBlob(cellCanvas, 'image/jpeg', 0.88);
    const previewUrl = cellCanvas.toDataURL('image/jpeg', 0.7);
    clips.push({ rowIndex: row, blob, previewUrl });
  }

  return clips;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob failed'));
      },
      type,
      quality
    );
  });
}
