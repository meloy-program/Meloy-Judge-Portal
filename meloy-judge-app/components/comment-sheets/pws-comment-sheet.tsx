import { QRCodeSVG } from "qrcode.react"
import type { CSSProperties } from "react"
import type { RubricCriteria } from "@/lib/types/api"
import {
  PWS_SHEET_COLORS,
  PWS_SHEET_LAYOUT as L,
  encodeSheetQr,
  getCommentCellRect,
  getMarkerCenters,
} from "@/lib/comment-sheets/pws-sheet-layout"

interface PwsCommentSheetProps {
  teamId: string
  teamName: string
  eventName: string
  criteria: RubricCriteria[]
}

const FONT = 'var(--font-pws-sheet), Calibri, Carlito, "Segoe UI", Arial, sans-serif'

const inches = (value: number) => `${value}in`

const box = (x: number, y: number, width: number, height: number): CSSProperties => ({
  position: "absolute",
  left: inches(x),
  top: inches(y),
  width: inches(width),
  height: inches(height),
})

const gridLine = `0.75pt solid ${PWS_SHEET_COLORS.grid}`

export function PwsCommentSheet({ teamId, teamName, eventName, criteria }: PwsCommentSheetProps) {
  const { table } = L
  const criteriaWidth = table.commentsLeft - table.left
  const commentsWidth = table.right - table.commentsLeft
  const headerHeight = table.headerBottom - table.headerTop

  return (
    <div
      style={{
        position: "relative",
        width: inches(L.page.width),
        height: inches(L.page.height),
        background: "#FFFFFF",
        color: "#000000",
        fontFamily: FONT,
        overflow: "hidden",
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}
    >
      {getMarkerCenters().map((center, i) => (
        <div
          key={i}
          style={{
            ...box(center.x - L.marker.size / 2, center.y - L.marker.size / 2, L.marker.size, L.marker.size),
            background: "#000000",
          }}
        />
      ))}

      <div
        style={{
          ...box(L.logo.x, L.logo.y, L.logo.width, L.logo.height),
          background: PWS_SHEET_COLORS.logoBackground,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/pws-logo-white.png" alt="Problems Worth Solving" style={{ width: "88%", height: "auto" }} />
      </div>

      <div style={{ position: "absolute", left: inches(L.finalistLabel.x), top: inches(L.finalistLabel.y), fontSize: "13.5pt", whiteSpace: "nowrap" }}>
        <span style={{ fontWeight: 700 }}>Finalist Name:</span>
        <span style={{ marginLeft: "0.12in" }}>{teamName}</span>
      </div>

      <div style={{ position: "absolute", left: inches(L.judgeLabel.x), top: inches(L.judgeLabel.y), fontSize: "13.5pt", fontWeight: 700 }}>
        Judges Name:
      </div>

      <div style={box(L.qr.x, L.qr.y, L.qr.size, L.qr.size)}>
        <QRCodeSVG value={encodeSheetQr(teamId)} size={256} level="M" marginSize={0} style={{ width: "100%", height: "100%" }} />
      </div>

      <div
        style={{
          ...box(table.left, table.headerTop, table.right - table.left, headerHeight),
          background: PWS_SHEET_COLORS.headerRow,
          border: gridLine,
          boxSizing: "border-box",
          color: "#FFFFFF",
          fontSize: "11pt",
          fontWeight: 700,
        }}
      >
        <span style={{ position: "absolute", left: "0.09in", top: "0.06in" }}>Criteria</span>
        <span style={{ position: "absolute", left: inches(criteriaWidth + 0.09), top: "0.06in" }}>Comments</span>
      </div>

      {criteria.map((criterion, rowIndex) => {
        const cell = getCommentCellRect(rowIndex)
        return (
          <div key={criterion.id}>
            <div
              style={{
                ...box(table.left, cell.y, criteriaWidth, cell.height),
                background: PWS_SHEET_COLORS.bodyRow,
                border: gridLine,
                borderTop: "none",
                boxSizing: "border-box",
                padding: "0.06in 0.03in 0.06in 0.09in",
                fontSize: "11pt",
                lineHeight: 1.25,
              }}
            >
              {criterion.display_order}. {criterion.name.replace(/'/g, "\u2019")}
            </div>
            <div
              style={{
                ...box(cell.x, cell.y, commentsWidth, cell.height),
                background: PWS_SHEET_COLORS.bodyRow,
                borderRight: gridLine,
                borderBottom: gridLine,
                boxSizing: "border-box",
              }}
            />
          </div>
        )
      })}

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: inches(L.footer.y),
          textAlign: "center",
          fontSize: "6.5pt",
          color: "#9CA3AF",
          letterSpacing: "0.02em",
        }}
      >
        {eventName} · {teamName} · {teamId.slice(0, 8)}
      </div>
    </div>
  )
}
