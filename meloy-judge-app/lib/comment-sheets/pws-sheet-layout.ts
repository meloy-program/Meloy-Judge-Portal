/**
 * Geometry for the printable PWS comment sheet.
 *
 * All values are in inches on a US Letter landscape page (11 x 8.5).
 * The printed sheet and the photo cropper both read from this file, so the
 * comment-cell rectangles stay in sync with what is printed. Changing any
 * value here invalidates sheets that were already printed.
 */

export const PWS_SHEET_VERSION = 1

export const PWS_SHEET_COLORS = {
  logoBackground: "#3A0000",
  headerRow: "#410212",
  bodyRow: "#E8EBF5",
  grid: "#000000",
}

const PAGE = { width: 11, height: 8.5 }

// Corner markers sit in the outer quarter inch; everything else fills the page inside them.
const MARKER = { size: 0.14, inset: 0.25 }

const TABLE = {
  left: 0.48,
  right: PAGE.width - 0.48,
  headerTop: 1.02,
  headerBottom: 1.32,
  bottom: PAGE.height - 0.42,
  criteriaColumnWidth: 2.05,
}

const HEADER_TOP = 0.42

export const PWS_SHEET_ROW_COUNT = 6

export const PWS_SHEET_LAYOUT = {
  page: PAGE,
  logo: { x: TABLE.left + 0.015, y: HEADER_TOP, width: 1.47, height: 0.55 },
  finalistLabel: { x: TABLE.left + 1.615, y: HEADER_TOP + 0.155 },
  judgeLabel: { x: 5.75, y: HEADER_TOP + 0.155 },
  qr: { size: 0.55, x: TABLE.right - 0.55, y: HEADER_TOP },
  marker: MARKER,
  table: {
    ...TABLE,
    commentsLeft: TABLE.left + TABLE.criteriaColumnWidth,
    rowHeight: (TABLE.bottom - TABLE.headerBottom) / PWS_SHEET_ROW_COUNT,
  },
  footer: { y: PAGE.height - 0.33 },
}

export interface SheetRect {
  x: number
  y: number
  width: number
  height: number
}

/** Rectangle of the handwritten comment cell for a 0-based row (row index = display_order - 1). */
export function getCommentCellRect(rowIndex: number): SheetRect {
  const { table } = PWS_SHEET_LAYOUT
  return {
    x: table.commentsLeft,
    y: table.headerBottom + rowIndex * table.rowHeight,
    width: table.right - table.commentsLeft,
    height: table.rowHeight,
  }
}

/** Centers of the four alignment markers, clockwise from top-left. */
export function getMarkerCenters(): { x: number; y: number }[] {
  const { size, inset } = PWS_SHEET_LAYOUT.marker
  const near = inset + size / 2
  return [
    { x: near, y: near },
    { x: PAGE.width - near, y: near },
    { x: PAGE.width - near, y: PAGE.height - near },
    { x: near, y: PAGE.height - near },
  ]
}

const QR_PREFIX = `PWS${PWS_SHEET_VERSION}:`

export function encodeSheetQr(teamId: string): string {
  return `${QR_PREFIX}${teamId}`
}

export function decodeSheetQr(value: string): { teamId: string } | null {
  if (!value.startsWith(QR_PREFIX)) return null
  const teamId = value.slice(QR_PREFIX.length).trim()
  return teamId ? { teamId } : null
}
