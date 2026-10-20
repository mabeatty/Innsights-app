import { format } from "date-fns";
import type { ExpenseDetailRow } from "@/hooks/useCompanyExpenseDetail";

const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.round(Math.abs(n)).toLocaleString()}`;
const signedMoney = (n: number) => `${n > 0 ? "+" : n < 0 ? "-" : ""}$${Math.round(Math.abs(n)).toLocaleString()}`;
// QuickBooks account names start with the account number ("6501 Rent"); the number is noise here.
export const displayAccountName = (name: string) => name.replace(/^\d+\s+/, "");

interface Props {
  rows: ExpenseDetailRow[];                // this category's account rows only
  months: string[];                        // closed months to show, "yyyy-MM"
  categoryActuals: Map<string, number>;    // "yyyy-MM" -> the category's reported actual
  loading?: boolean;
}

// The accounts inside one top-level expense category, by month. If the accounts
// don't add up to the category total for a month (the total and the account
// detail are synced separately, so one can be newer than the other), that gap is
// shown as its own row instead of being hidden.
export default function SubCategoryTable({ rows, months, categoryActuals, loading }: Props) {
  if (loading) return <p className="text-xs text-muted-foreground">Loading sub-categories…</p>;
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">No sub-category detail for this category.</p>;

  const byAccount = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const key = r.month.slice(0, 7);
    if (!months.includes(key)) continue;
    const m = byAccount.get(r.account_name) ?? new Map<string, number>();
    m.set(key, (m.get(key) ?? 0) + r.amount);
    byAccount.set(r.account_name, m);
  }
  const accounts = [...byAccount.entries()]
    .map(([name, byMonth]) => ({ name, byMonth, total: months.reduce((s, m) => s + (byMonth.get(m) ?? 0), 0) }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const diffs = months.map((month) => ({
    month,
    diff: (categoryActuals.get(month) ?? 0) - accounts.reduce((s, a) => s + (a.byMonth.get(month) ?? 0), 0),
  }));
  const hasDiff = diffs.some((d) => Math.abs(d.diff) >= 1);
  const totalDiff = diffs.reduce((s, d) => s + (Math.abs(d.diff) >= 1 ? d.diff : 0), 0);

  return (
    <div className="overflow-x-auto">
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">Sub-categories (QuickBooks accounts)</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="py-1 pr-3 text-left font-normal">Account</th>
            {months.map((m) => (
              <th key={m} className="whitespace-nowrap px-2 py-1 text-right font-normal">{format(new Date(`${m}-01T00:00:00`), "MMM yy")}</th>
            ))}
            <th className="py-1 pl-3 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => (
            <tr key={a.name} className="border-t" data-testid="subcategory-row">
              <td className="whitespace-nowrap py-1 pr-3">{displayAccountName(a.name)}</td>
              {months.map((m) => (
                <td key={m} className="px-2 py-1 text-right tabular-nums">{a.byMonth.get(m) ? money(a.byMonth.get(m)!) : "—"}</td>
              ))}
              <td className="py-1 pl-3 text-right font-medium tabular-nums">{money(a.total)}</td>
            </tr>
          ))}
          {hasDiff && (
            <tr className="border-t italic text-muted-foreground" data-testid="subcategory-difference">
              <td className="whitespace-nowrap py-1 pr-3">Difference vs. category total</td>
              {diffs.map((d) => (
                <td key={d.month} className="px-2 py-1 text-right tabular-nums">{Math.abs(d.diff) >= 1 ? signedMoney(d.diff) : "—"}</td>
              ))}
              <td className="py-1 pl-3 text-right tabular-nums">{signedMoney(totalDiff)}</td>
            </tr>
          )}
        </tbody>
      </table>
      {hasDiff && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Sub-category amounts and the category total were synced at different times, so they differ until both are refreshed.
          A negative difference means the accounts add up to more than the category total.
        </p>
      )}
    </div>
  );
}
