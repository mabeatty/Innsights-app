import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import ExpensesTab from "./ExpensesTab";

beforeAll(() => {
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  // The tab's calendar is "this year + next": pin the year the fixtures use.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T12:00:00"));
});
afterAll(() => vi.useRealTimers());

vi.mock("recharts", () => {
  const Pass = ({ children }: any) => <div>{children}</div>;
  const Nil = () => null;
  return { BarChart: Pass, ResponsiveContainer: Pass, Bar: Nil, XAxis: Nil, YAxis: Nil, CartesianGrid: Nil, Tooltip: Nil };
});

const cats = [
  { id: "c-pay", name: "Payroll & Related", type: "expense" },
  { id: "c-off", name: "Office Expenses", type: "expense" },
  { id: "c-pd", name: "Personal & Professional Development", type: "expense" },
];
// Jan–Mar closed, Apr–Dec projected
const series = (cat: (typeof cats)[number], actuals: number[]) => ({
  category: cat,
  months: Array.from({ length: 12 }, (_, i) => ({
    month: `2026-${String(i + 1).padStart(2, "0")}-01`, actual: i < actuals.length ? actuals[i] : 0, budget: 500, is_projected: i >= actuals.length,
  })),
});
const FIN1 = { loading: false, error: null, categories: cats, toDateExpenses: 3300, expenseBudgetToDateTotal: 4500,
  expenseSeries: [series(cats[0], [1000, 1000, 1000]), series(cats[1], [100, 100, 100]), series(cats[2], [])] };
const FIN2 = { loading: false, error: null, categories: cats, toDateExpenses: 0, expenseBudgetToDateTotal: 0, expenseSeries: [] };
vi.mock("@/hooks/useCompanyFinancials", () => ({ useCompanyFinancials: (year: number) => (year === 2026 ? FIN1 : FIN2) }));

const d = (category_id: string, account_name: string, month: string, amount: number) => ({ category_id, account_name, month: `${month}-01`, amount });
const DETAIL = { loading: false, error: null, rows: [
  ...["2026-01", "2026-02", "2026-03"].flatMap((m) => [d("c-pay", "Regular Payroll", m, 700), d("c-pay", "6018 Guaranteed Payments - Sachin Patel", m, 300)]), // adds up to 1000 each month
  ...["2026-01", "2026-02", "2026-03"].map((m) => d("c-off", "6501 Rent", m, 100)),
  d("c-off", "6503 Software & Web Services", "2026-03", 50), // March accounts = 150 vs category total 100
] };
vi.mock("@/hooks/useCompanyExpenseDetail", () => ({ useCompanyExpenseDetail: () => DETAIL }));

const rowCell = (name: string) => screen.getByRole("cell", { name });

describe("Expenses tab — category drill-down", () => {
  it("shows no sub-categories until a category is opened", () => {
    render(<ExpensesTab />);
    expect(screen.queryByTestId("subcategory-row")).not.toBeInTheDocument();
    expect(screen.getByText("Click a row to see its sub-categories by month.")).toBeInTheDocument();
  });

  it("opening a category lists its accounts (biggest first, numbers stripped)", () => {
    render(<ExpensesTab />);
    fireEvent.click(rowCell("Payroll & Related"));
    expect(screen.getAllByTestId("subcategory-row").map((r) => within(r).getAllByRole("cell")[0].textContent))
      .toEqual(["Regular Payroll", "Guaranteed Payments - Sachin Patel"]);
    // only the closed months are columns...
    expect(screen.getByRole("columnheader", { name: "Mar 26" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Apr 26" })).not.toBeInTheDocument();
    // ...and the old month-by-month summary strip is gone (it labelled every month, projected and next year's included)
    expect(screen.queryByText("Apr 26")).not.toBeInTheDocument();
    expect(screen.queryByText("Dec 27")).not.toBeInTheDocument();
    expect(screen.queryByText(/Sub-categories \(QuickBooks accounts\)/)).not.toBeInTheDocument(); // no heading above the table
    expect(screen.queryByTestId("subcategory-difference")).not.toBeInTheDocument(); // accounts add up to the total
  });

  it("flags a category whose accounts don't add up to its total", () => {
    render(<ExpensesTab />);
    fireEvent.click(rowCell("Office Expenses"));
    expect(screen.getAllByTestId("subcategory-row")).toHaveLength(2);
    const diff = screen.getByTestId("subcategory-difference");
    expect(within(diff).getAllByRole("cell").map((c) => c.textContent)).toEqual(["Difference vs. category total", "—", "—", "-$50", "-$50"]);
  });

  it("says so for a category with no account detail", () => {
    render(<ExpensesTab />);
    fireEvent.click(rowCell("Personal & Professional Development"));
    expect(screen.getByText("No sub-category detail for this category.")).toBeInTheDocument();
  });

  it("only one category is open at a time, and the same row closes it", () => {
    render(<ExpensesTab />);
    fireEvent.click(rowCell("Payroll & Related"));
    fireEvent.click(rowCell("Office Expenses"));
    expect(screen.queryByText("Regular Payroll")).not.toBeInTheDocument();
    expect(screen.getByText("Rent")).toBeInTheDocument();
    fireEvent.click(rowCell("Office Expenses"));
    expect(screen.queryByTestId("subcategory-row")).not.toBeInTheDocument();
  });
});
