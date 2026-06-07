import React, { useMemo, useRef, useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fmt } from "@/components/capital-planning/types";

interface InvestorPosition {
  investing_entity: string;
  contact_name: string | null;
  committed: number;
  contributed: number;
}

interface ProjectWithInvestors {
  id: string;
  name: string;
  investors: InvestorPosition[];
}

interface InvestorRow {
  name: string;
  contactName: string;
  totalCommitted: number;
  totalContributed: number;
  totalRemaining: number;
  byProject: Map<string, { committed: number; contributed: number; remaining: number }>;
}

interface Props {
  projects: ProjectWithInvestors[];
}

const NAME_W = 200;
const CONTACT_W = 150;
const CURRENCY_W = 120;
const ROW1_H = 40;

const BG = "hsl(var(--card))";
const BG_MUTED = "hsl(var(--muted))";
const BORDER = "hsl(var(--border))";

const GROUP_COLORS = [
  "hsl(var(--muted))",
  "hsl(var(--accent))",
];

export default function InvestorsTab({ projects }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener("scroll", checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      ro.disconnect();
    };
  }, []);

  const scroll = (dir: number) =>
    scrollRef.current?.scrollBy({ left: dir * 400, behavior: "smooth" });

  const activeProjects = useMemo(
    () => projects.filter((p) => p.investors.length > 0),
    [projects]
  );

  const investors = useMemo(() => {
    const map = new Map<string, InvestorRow>();
    for (const project of activeProjects) {
      for (const inv of project.investors) {
        const key = inv.investing_entity.trim().toLowerCase();
        const committed = Number(inv.committed);
        const contributed = Number(inv.contributed);
        const remaining = committed - contributed;
        const existing = map.get(key);
        if (existing) {
          existing.totalCommitted += committed;
          existing.totalContributed += contributed;
          existing.totalRemaining += remaining;
          const prev = existing.byProject.get(project.id);
          if (prev) {
            prev.committed += committed;
            prev.contributed += contributed;
            prev.remaining += remaining;
          } else {
            existing.byProject.set(project.id, { committed, contributed, remaining });
          }
          if (!existing.contactName && inv.contact_name) {
            existing.contactName = inv.contact_name;
          }
        } else {
          const byProject = new Map<string, { committed: number; contributed: number; remaining: number }>();
          byProject.set(project.id, { committed, contributed, remaining });
          map.set(key, {
            name: inv.investing_entity,
            contactName: inv.contact_name || "",
            totalCommitted: committed,
            totalContributed: contributed,
            totalRemaining: remaining,
            byProject,
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [activeProjects]);

  if (investors.length === 0) {
    return (
      <p className="text-muted-foreground text-sm py-8 text-center">
        No investor data found across development projects.
      </p>
    );
  }

  const grandTotal = investors.reduce(
    (a, i) => ({
      c: a.c + i.totalCommitted,
      d: a.d + i.totalContributed,
      r: a.r + i.totalRemaining,
    }),
    { c: 0, d: 0, r: 0 }
  );

  const projectTotals = (pid: string) =>
    investors.reduce(
      (a, inv) => {
        const p = inv.byProject.get(pid);
        if (p) { a.c += p.committed; a.d += p.contributed; a.r += p.remaining; }
        return a;
      },
      { c: 0, d: 0, r: 0 }
    );

  const totalW = NAME_W + CONTACT_W + CURRENCY_W * 3 + activeProjects.length * CURRENCY_W * 3;

  // --- Shared style helpers ---
  const stickyNameStyle = (bg: string, extra?: React.CSSProperties): React.CSSProperties => ({
    position: "sticky",
    left: 0,
    zIndex: 2,
    backgroundColor: bg,
    minWidth: NAME_W,
    width: NAME_W,
    ...extra,
  });

  const stickyContactStyle = (bg: string, extra?: React.CSSProperties): React.CSSProperties => ({
    position: "sticky",
    left: NAME_W,
    zIndex: 2,
    backgroundColor: bg,
    minWidth: CONTACT_W,
    width: CONTACT_W,
    borderRight: `2px solid ${BORDER}`,
    ...extra,
  });

  const currCell: React.CSSProperties = {
    minWidth: CURRENCY_W,
    width: CURRENCY_W,
  };

  const groupBorderLeft: React.CSSProperties = {
    borderLeft: `2px solid ${BORDER}`,
  };

  // Group header shared style
  const groupHeaderStyle = (bg: string, extra?: React.CSSProperties): React.CSSProperties => ({
    backgroundColor: bg,
    padding: "6px 16px",
    textAlign: "center",
    fontWeight: 600,
    whiteSpace: "nowrap",
    borderBottom: `1px solid ${BORDER}`,
    ...extra,
  });

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="relative">
          {/* Scroll buttons */}
          {canScrollLeft && (
            <Button
              variant="secondary"
              size="icon"
              className="absolute left-1 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full shadow-md opacity-90 hover:opacity-100"
              style={{ zIndex: 10 }}
              onClick={() => scroll(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          {canScrollRight && (
            <Button
              variant="secondary"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full shadow-md opacity-90 hover:opacity-100"
              style={{ zIndex: 10 }}
              onClick={() => scroll(1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}

          {/* Scroll container — CSS only scroll control */}
          <div
            ref={scrollRef}
            style={{
              overflowX: "scroll",
              overflowY: "visible",
              maxHeight: "70vh",
              maxWidth: "100%",
              overscrollBehaviorX: "contain",
              WebkitOverflowScrolling: "touch",
            }}
          >
            <table
              style={{
                tableLayout: "fixed",
                width: totalW,
                minWidth: totalW,
                borderCollapse: "separate",
                borderSpacing: 0,
                fontSize: "0.8125rem",
              }}
            >
              <colgroup>
                <col style={{ width: NAME_W, minWidth: NAME_W }} />
                <col style={{ width: CONTACT_W, minWidth: CONTACT_W }} />
                <col style={{ width: CURRENCY_W }} />
                <col style={{ width: CURRENCY_W }} />
                <col style={{ width: CURRENCY_W }} />
                {activeProjects.map((p) => (
                  <React.Fragment key={p.id}>
                    <col style={{ width: CURRENCY_W }} />
                    <col style={{ width: CURRENCY_W }} />
                    <col style={{ width: CURRENCY_W }} />
                  </React.Fragment>
                ))}
              </colgroup>

              <thead>
                {/* ── Row 1: Group headers ── */}
                <tr style={{ position: "sticky", top: 0, zIndex: 3, height: ROW1_H }}>
                  {/* "Investors" group — 2 cols */}
                  <th
                    colSpan={2}
                    style={{
                      ...groupHeaderStyle(GROUP_COLORS[0]),
                      position: "sticky",
                      left: 0,
                      zIndex: 4,
                      borderRight: `2px solid ${BORDER}`,
                    }}
                    className="text-xs text-foreground"
                  >
                    Investors
                  </th>
                  {/* "Summary" group — 3 cols */}
                  <th
                    colSpan={3}
                    style={{
                      ...groupHeaderStyle(GROUP_COLORS[1]),
                      borderLeft: `2px solid ${BORDER}`,
                    }}
                    className="text-xs text-foreground"
                  >
                    Summary
                  </th>
                  {/* Project groups — 3 cols each */}
                  {activeProjects.map((p, idx) => (
                    <th
                      key={p.id}
                      colSpan={3}
                      style={{
                        ...groupHeaderStyle(GROUP_COLORS[idx % 2]),
                        borderLeft: `2px solid ${BORDER}`,
                      }}
                      className="text-xs text-foreground"
                    >
                      {p.name}
                    </th>
                  ))}
                </tr>

                {/* ── Row 2: Column headers ── */}
                <tr style={{ position: "sticky", top: ROW1_H, zIndex: 3 }}>
                  <th
                    style={stickyNameStyle(BG_MUTED, {
                      zIndex: 4,
                      padding: "8px 16px",
                      textAlign: "left",
                      borderBottom: `1px solid ${BORDER}`,
                    })}
                    className="text-xs font-medium text-muted-foreground whitespace-nowrap"
                  >
                    Investor Name
                  </th>
                  <th
                    style={stickyContactStyle(BG_MUTED, {
                      zIndex: 4,
                      padding: "8px 16px",
                      textAlign: "left",
                      borderBottom: `1px solid ${BORDER}`,
                    })}
                    className="text-xs font-medium text-muted-foreground whitespace-nowrap"
                  >
                    Contact Name
                  </th>
                  {["Total Committed", "Total Called", "Total Remaining"].map(
                    (label, i) => (
                      <th
                        key={label}
                        style={{
                          ...currCell,
                          backgroundColor: BG_MUTED,
                          padding: "8px 16px",
                          textAlign: "right",
                          borderBottom: `1px solid ${BORDER}`,
                          ...(i === 2 ? { borderRight: `2px solid ${BORDER}` } : {}),
                        }}
                        className="text-xs font-medium text-muted-foreground whitespace-nowrap"
                      >
                        {label}
                      </th>
                    )
                  )}
                  {activeProjects.map((p) =>
                    ["Committed", "Called", "Remaining"].map((label, i) => (
                      <th
                        key={`${p.id}-${label}`}
                        style={{
                          ...currCell,
                          backgroundColor: BG_MUTED,
                          padding: "8px 16px",
                          textAlign: "right",
                          borderBottom: `1px solid ${BORDER}`,
                          ...(i === 0 ? groupBorderLeft : {}),
                        }}
                        className="text-xs font-medium text-muted-foreground whitespace-nowrap"
                      >
                        {label}
                      </th>
                    ))
                  )}
                </tr>
              </thead>

              <tbody>
                {investors.map((inv) => (
                  <tr key={inv.name} style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <td
                      style={stickyNameStyle(BG, { padding: "8px 16px" })}
                      className="font-medium truncate whitespace-nowrap"
                    >
                      {inv.name}
                    </td>
                    <td
                      style={stickyContactStyle(BG, { padding: "8px 16px" })}
                      className="text-muted-foreground truncate whitespace-nowrap"
                    >
                      {inv.contactName || "—"}
                    </td>
                    <td
                      style={{ ...currCell, padding: "8px 16px", textAlign: "right", backgroundColor: BG }}
                      className="tabular-nums whitespace-nowrap"
                    >
                      {fmt(inv.totalCommitted)}
                    </td>
                    <td
                      style={{ ...currCell, padding: "8px 16px", textAlign: "right", backgroundColor: BG }}
                      className="tabular-nums whitespace-nowrap"
                    >
                      {fmt(inv.totalContributed)}
                    </td>
                    <td
                      style={{
                        ...currCell,
                        padding: "8px 16px",
                        textAlign: "right",
                        borderRight: `2px solid ${BORDER}`,
                        backgroundColor: BG,
                      }}
                      className="tabular-nums whitespace-nowrap"
                    >
                      {fmt(inv.totalRemaining)}
                    </td>
                    {activeProjects.map((p) => {
                      const pos = inv.byProject.get(p.id);
                      return (
                        <React.Fragment key={p.id}>
                          <td
                            style={{
                              ...currCell,
                              ...groupBorderLeft,
                              padding: "8px 16px",
                              textAlign: "right",
                              backgroundColor: BG,
                            }}
                            className="text-muted-foreground tabular-nums whitespace-nowrap"
                          >
                            {pos ? fmt(pos.committed) : "—"}
                          </td>
                          <td
                            style={{ ...currCell, padding: "8px 16px", textAlign: "right", backgroundColor: BG }}
                            className="text-muted-foreground tabular-nums whitespace-nowrap"
                          >
                            {pos ? fmt(pos.contributed) : "—"}
                          </td>
                          <td
                            style={{ ...currCell, padding: "8px 16px", textAlign: "right", backgroundColor: BG }}
                            className="text-muted-foreground tabular-nums whitespace-nowrap"
                          >
                            {pos ? fmt(pos.remaining) : "—"}
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr style={{ borderTop: `2px solid ${BORDER}` }}>
                  <td
                    style={stickyNameStyle(BG_MUTED, { padding: "8px 16px", fontWeight: 600 })}
                    className="whitespace-nowrap"
                  >
                    Totals
                  </td>
                  <td style={stickyContactStyle(BG_MUTED, { padding: "8px 16px" })} />
                  <td
                    style={{
                      ...currCell,
                      backgroundColor: BG_MUTED,
                      padding: "8px 16px",
                      textAlign: "right",
                      fontWeight: 600,
                    }}
                    className="tabular-nums whitespace-nowrap"
                  >
                    {fmt(grandTotal.c)}
                  </td>
                  <td
                    style={{
                      ...currCell,
                      backgroundColor: BG_MUTED,
                      padding: "8px 16px",
                      textAlign: "right",
                      fontWeight: 600,
                    }}
                    className="tabular-nums whitespace-nowrap"
                  >
                    {fmt(grandTotal.d)}
                  </td>
                  <td
                    style={{
                      ...currCell,
                      backgroundColor: BG_MUTED,
                      padding: "8px 16px",
                      textAlign: "right",
                      fontWeight: 600,
                      borderRight: `2px solid ${BORDER}`,
                    }}
                    className="tabular-nums whitespace-nowrap"
                  >
                    {fmt(grandTotal.r)}
                  </td>
                  {activeProjects.map((p) => {
                    const t = projectTotals(p.id);
                    return (
                      <React.Fragment key={p.id}>
                        <td
                          style={{
                            ...currCell,
                            ...groupBorderLeft,
                            backgroundColor: BG_MUTED,
                            padding: "8px 16px",
                            textAlign: "right",
                            fontWeight: 600,
                          }}
                          className="tabular-nums whitespace-nowrap"
                        >
                          {fmt(t.c)}
                        </td>
                        <td
                          style={{
                            ...currCell,
                            backgroundColor: BG_MUTED,
                            padding: "8px 16px",
                            textAlign: "right",
                            fontWeight: 600,
                          }}
                          className="tabular-nums whitespace-nowrap"
                        >
                          {fmt(t.d)}
                        </td>
                        <td
                          style={{
                            ...currCell,
                            backgroundColor: BG_MUTED,
                            padding: "8px 16px",
                            textAlign: "right",
                            fontWeight: 600,
                          }}
                          className="tabular-nums whitespace-nowrap"
                        >
                          {fmt(t.r)}
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
