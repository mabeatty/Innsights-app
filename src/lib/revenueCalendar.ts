// Fixed 24-month calendar window for the Revenue tabs: Jan of the current
// year through Dec of the following year. Matches the horizon already
// loaded into dev_fee_schedule and what sync-dev-fee-revenue-quickbooks
// pulls from QuickBooks, so every Revenue chart shows the same 24 months
// regardless of which months actually have data yet.
export function getRevenueCalendarMonths(): string[] {
  const year1 = new Date().getFullYear();
  const months: string[] = [];
  for (let y = year1; y <= year1 + 1; y++) {
    for (let m = 1; m <= 12; m++) {
      months.push(`${y}-${String(m).padStart(2, "0")}`);
    }
  }
  return months;
}
