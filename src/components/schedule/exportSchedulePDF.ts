import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { format, differenceInDays, startOfMonth, endOfMonth, addDays, eachMonthOfInterval } from "date-fns";
import type { SchedulePhase, ScheduleMilestone } from "./types";
import { STATUS_COLORS } from "./types";

const PHASE_HEX_COLORS: Record<number, string> = {
  1: "#0D9488",
  2: "#2563EB",
  3: "#D97706",
  4: "#16A34A",
};

const LABEL_WIDTH = 220;
const ROW_H = 32;
const HEADER_H = 24;
const MONTH_COL_W = 60;

function hexToRgba(hex: string, alpha = 1): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export async function exportSchedulePDF(
  projectName: string,
  phases: SchedulePhase[],
  milestones: ScheduleMilestone[],
) {
  // ─── Compute timeline range ───
  const allDates: Date[] = [new Date()];
  milestones.forEach((m) => {
    if (m.planned_date) allDates.push(new Date(m.planned_date + "T00:00:00"));
    if (m.actual_date) allDates.push(new Date(m.actual_date + "T00:00:00"));
  });
  phases.forEach((p) => {
    if (p.start_date) allDates.push(new Date(p.start_date + "T00:00:00"));
    if (p.end_date) allDates.push(new Date(p.end_date + "T00:00:00"));
  });

  const min = new Date(Math.min(...allDates.map((d) => d.getTime())));
  const max = new Date(Math.max(...allDates.map((d) => d.getTime())));
  const timelineStart = startOfMonth(addDays(min, -30));
  const timelineEnd = endOfMonth(addDays(max, 30));
  const totalDays = differenceInDays(timelineEnd, timelineStart) || 1;
  const months = eachMonthOfInterval({ start: timelineStart, end: timelineEnd });
  const TIMELINE_WIDTH = months.length * MONTH_COL_W;
  const TOTAL_WIDTH = LABEL_WIDTH + TIMELINE_WIDTH;

  const getXpx = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return (differenceInDays(d, timelineStart) / totalDays) * TIMELINE_WIDTH;
  };

  // ─── Group phases ───
  const phaseGroups = new Map<number, { phase_name: string; sub_phases: SchedulePhase[] }>();
  phases.forEach((p) => {
    if (!phaseGroups.has(p.phase_number)) {
      phaseGroups.set(p.phase_number, { phase_name: p.phase_name, sub_phases: [] });
    }
    phaseGroups.get(p.phase_number)!.sub_phases.push(p);
  });
  const sortedGroups = Array.from(phaseGroups.entries()).sort(([a], [b]) => a - b);

  // ─── Count rows ───
  let rowCount = 0;
  sortedGroups.forEach(([, { sub_phases }]) => {
    rowCount += 1; // phase header
    rowCount += sub_phases.length;
  });

  const CHART_H = rowCount * ROW_H;
  const TITLE_AREA = 50;
  const CANVAS_H = TITLE_AREA + HEADER_H * 2 + CHART_H;

  // ─── Build offscreen canvas ───
  const container = document.createElement("div");
  container.style.cssText = `position:absolute;left:-9999px;top:0;width:${TOTAL_WIDTH}px;height:${CANVAS_H}px;background:#fff;font-family:system-ui,-apple-system,sans-serif;`;
  document.body.appendChild(container);

  // Title area
  const titleDiv = document.createElement("div");
  titleDiv.style.cssText = `display:flex;justify-content:space-between;align-items:flex-end;padding:12px 16px 8px;`;
  titleDiv.innerHTML = `
    <div>
      <div style="font-size:16px;font-weight:700;color:#111">${projectName}</div>
      <div style="font-size:11px;color:#666">Project Schedule</div>
    </div>
    <div style="font-size:10px;color:#888">Exported ${format(new Date(), "MMM d, yyyy")}</div>
  `;
  container.appendChild(titleDiv);

  // ─── Year header ───
  const yearRow = document.createElement("div");
  yearRow.style.cssText = `display:flex;height:${HEADER_H}px;border-bottom:1px solid #e5e7eb;`;
  const yearLabelCell = document.createElement("div");
  yearLabelCell.style.cssText = `width:${LABEL_WIDTH}px;border-right:1px solid #e5e7eb;background:#f9fafb;`;
  yearRow.appendChild(yearLabelCell);

  // Group months by year
  const yearGroups: { year: number; span: number }[] = [];
  months.forEach((m) => {
    const y = m.getFullYear();
    if (yearGroups.length && yearGroups[yearGroups.length - 1].year === y) {
      yearGroups[yearGroups.length - 1].span++;
    } else {
      yearGroups.push({ year: y, span: 1 });
    }
  });
  yearGroups.forEach((yg) => {
    const cell = document.createElement("div");
    cell.style.cssText = `width:${yg.span * MONTH_COL_W}px;text-align:center;font-size:10px;font-weight:600;color:#6b7280;line-height:${HEADER_H}px;border-right:1px solid #e5e7eb;`;
    cell.textContent = String(yg.year);
    yearRow.appendChild(cell);
  });
  container.appendChild(yearRow);

  // ─── Month header ───
  const monthRow = document.createElement("div");
  monthRow.style.cssText = `display:flex;height:${HEADER_H}px;border-bottom:1px solid #e5e7eb;`;
  const monthLabelCell = document.createElement("div");
  monthLabelCell.style.cssText = `width:${LABEL_WIDTH}px;border-right:1px solid #e5e7eb;background:#f9fafb;`;
  monthRow.appendChild(monthLabelCell);
  months.forEach((m) => {
    const cell = document.createElement("div");
    cell.style.cssText = `width:${MONTH_COL_W}px;text-align:center;font-size:9px;color:#9ca3af;line-height:${HEADER_H}px;border-right:1px solid #f3f4f6;`;
    cell.textContent = format(m, "MMM");
    monthRow.appendChild(cell);
  });
  container.appendChild(monthRow);

  // ─── Rows ───
  const todayPx = (differenceInDays(new Date(), timelineStart) / totalDays) * TIMELINE_WIDTH;

  sortedGroups.forEach(([phaseNum, { phase_name, sub_phases }]) => {
    const phaseColor = PHASE_HEX_COLORS[phaseNum] || PHASE_HEX_COLORS[1];

    // Phase header row
    const phaseRow = document.createElement("div");
    phaseRow.style.cssText = `display:flex;height:${ROW_H}px;align-items:center;background:${hexToRgba(phaseColor, 0.1)};border-bottom:1px solid #e5e7eb;`;
    const phaseLabel = document.createElement("div");
    phaseLabel.style.cssText = `width:${TOTAL_WIDTH}px;padding:0 12px;font-size:11px;font-weight:600;color:${phaseColor};`;
    phaseLabel.textContent = `Phase ${phaseNum} — ${phase_name}`;
    phaseRow.appendChild(phaseLabel);
    container.appendChild(phaseRow);

    // Sub-phase rows
    sub_phases.forEach((sp) => {
      const row = document.createElement("div");
      row.style.cssText = `display:flex;height:${ROW_H}px;border-bottom:1px solid #f3f4f6;`;

      // Label
      const label = document.createElement("div");
      label.style.cssText = `width:${LABEL_WIDTH}px;display:flex;align-items:center;gap:6px;padding:0 12px;border-right:1px solid #e5e7eb;font-size:10px;`;
      label.innerHTML = `<span style="color:#9ca3af">${sp.sub_phase_number}</span><span style="color:#374151">${sp.sub_phase_name}</span>`;
      row.appendChild(label);

      // Timeline cell
      const timeline = document.createElement("div");
      timeline.style.cssText = `width:${TIMELINE_WIDTH}px;position:relative;height:${ROW_H}px;`;

      // Month gridlines
      months.forEach((_, i) => {
        const line = document.createElement("div");
        line.style.cssText = `position:absolute;left:${i * MONTH_COL_W}px;top:0;bottom:0;width:1px;background:#f3f4f6;`;
        timeline.appendChild(line);
      });

      // Sub-phase bar
      if (sp.start_date && sp.end_date) {
        const barStart = getXpx(sp.start_date);
        const barEnd = getXpx(sp.end_date);
        const barW = Math.max(barEnd - barStart, 4);
        const bar = document.createElement("div");
        bar.style.cssText = `position:absolute;top:50%;transform:translateY(-50%);left:${barStart}px;width:${barW}px;height:28px;background:${phaseColor};opacity:0.85;border-radius:3px;display:flex;align-items:center;justify-content:center;`;
        if (barW > 50) {
          bar.innerHTML = `<span style="font-size:8px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;max-width:100%;padding:0 4px;line-height:28px;">${sp.sub_phase_name}</span>`;
        }
        timeline.appendChild(bar);
      }

      // Milestone diamonds
      const spMilestones = milestones.filter((m) => m.sub_phase_id === sp.id);
      spMilestones.forEach((m) => {
        if (!m.planned_date) return;
        const xPx = getXpx(m.planned_date);
        // Use a simple colored diamond via SVG
        const statusColorMap: Record<string, string> = {
          "Upcoming": "#6b7280",
          "In Progress": "#0D9488",
          "Complete": "#16a34a",
          "At Risk": "#d97706",
          "Delayed": "#dc2626",
        };
        const color = statusColorMap[m.status] || "#6b7280";
        const diamond = document.createElement("div");
        diamond.style.cssText = `position:absolute;top:50%;left:${xPx}px;transform:translate(-50%,-50%);z-index:5;`;
        diamond.innerHTML = `<svg width="12" height="12" viewBox="0 0 14 14"><rect x="2" y="2" width="10" height="10" rx="1" transform="rotate(45 7 7)" fill="${color}" stroke="#fff" stroke-width="1.5"/></svg>`;
        timeline.appendChild(diamond);

        // Actual date marker
        if (m.actual_date && m.actual_date !== m.planned_date) {
          const axPx = getXpx(m.actual_date);
          const ad = document.createElement("div");
          ad.style.cssText = `position:absolute;top:50%;left:${axPx}px;transform:translate(-50%,-50%);z-index:5;`;
          ad.innerHTML = `<svg width="12" height="12" viewBox="0 0 14 14"><rect x="2" y="2" width="10" height="10" rx="1" transform="rotate(45 7 7)" fill="transparent" stroke="${color}" stroke-width="2"/></svg>`;
          timeline.appendChild(ad);
        }
      });

      // Today line
      if (todayPx >= 0 && todayPx <= TIMELINE_WIDTH) {
        const todayLine = document.createElement("div");
        todayLine.style.cssText = `position:absolute;left:${todayPx}px;top:0;bottom:0;width:2px;background:#ef4444;z-index:10;`;
        timeline.appendChild(todayLine);
      }

      row.appendChild(timeline);
      container.appendChild(row);
    });
  });

  // ─── Render to canvas ───
  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      width: TOTAL_WIDTH,
      height: CANVAS_H,
    });

    // ─── Build PDF ───
    const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 20;
    const usableW = pageW - margin * 2;

    const imgRatio = canvas.height / canvas.width;
    const imgW = usableW;
    const imgH = imgW * imgRatio;

    // If image is taller than one page, split across pages
    const usableH = pageH - margin * 2;
    if (imgH <= usableH) {
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", margin, margin, imgW, imgH);
    } else {
      // Multi-page: slice the canvas
      const pagesNeeded = Math.ceil(imgH / usableH);
      const srcSliceH = canvas.height / pagesNeeded;
      for (let i = 0; i < pagesNeeded; i++) {
        if (i > 0) pdf.addPage();
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = Math.ceil(srcSliceH);
        const ctx = sliceCanvas.getContext("2d")!;
        ctx.drawImage(canvas, 0, i * srcSliceH, canvas.width, srcSliceH, 0, 0, canvas.width, srcSliceH);
        pdf.addImage(sliceCanvas.toDataURL("image/png"), "PNG", margin, margin, imgW, usableH);
      }
    }

    pdf.save(`${projectName} - Schedule.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}
