import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// One QuickBooks account's amount for one month, under a top-level company
// expense category (see company_expense_detail). Actuals only.
export interface ExpenseDetailRow {
  category_id: string;
  account_name: string;
  month: string; // yyyy-MM-dd (first of month)
  amount: number;
}

const PAGE = 1000;

// Loads every account-level expense row for the org. RLS scopes it to the
// user's organization. Paginated so it keeps working past the API's 1000-row cap.
export function useCompanyExpenseDetail() {
  const [rows, setRows] = useState<ExpenseDetailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all: ExpenseDetailRow[] = [];
      // (supabase as any): the generated client types predate this table
      for (let from = 0; ; from += PAGE) {
        const { data, error: err } = await (supabase as any)
          .from("company_expense_detail")
          .select("category_id, account_name, month, amount")
          .order("month")
          .order("account_name")
          .range(from, from + PAGE - 1);
        if (err) { if (!cancelled) { setError(err.message); setLoading(false); } return; }
        // numeric columns come back from Postgres as strings — coerce, or sums concatenate
        for (const r of data ?? []) all.push({ ...r, amount: Number(r.amount) });
        if (!data || data.length < PAGE) break;
      }
      if (!cancelled) { setRows(all); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  return { rows, loading, error };
}
