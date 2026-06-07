import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCapitalData } from "./capital-planning/useCapitalData";
import PreDevelopmentBudgetSubPage from "./capital-planning/PreDevelopmentBudgetSubPage";
import EquitySubPage from "./capital-planning/EquitySubPage";
import DebtSubPage from "./capital-planning/DebtSubPage";
import CashFlowSubPage from "./capital-planning/CashFlowSubPage";
import FinancialModelSubPage from "./capital-planning/FinancialModelSubPage";
import { cn } from "@/lib/utils";

interface Props {
  projectId: string;
}

const SUB_PAGES = [
  { key: "predev", label: "Pre-Development Budget" },
  { key: "cashflow", label: "Cash Planning" },
  { key: "equity", label: "Equity" },
  { key: "debt", label: "Debt" },
  { key: "model", label: "Financial Model" },
] as const;

type SubPage = (typeof SUB_PAGES)[number]["key"];

export default function CapitalPlanningModule({ projectId }: Props) {
  const [activePage, setActivePage] = useState<SubPage>("predev");
  const [plaidAccountId, setPlaidAccountId] = useState<string | null>(null);
  const data = useCapitalData(projectId);

  useEffect(() => {
    supabase
      .from("projects")
      .select("plaid_account_id")
      .eq("id", projectId)
      .single()
      .then(({ data: proj }) => {
        setPlaidAccountId((proj as any)?.plaid_account_id ?? null);
      });
  }, [projectId]);

  if (data.loading) return <p className="text-sm text-muted-foreground py-4">Loading capital planning…</p>;

  return (
    <div className="space-y-4 pt-2">
      {/* Sub-navigation */}
      <nav className="flex gap-1 border-b">
        {SUB_PAGES.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActivePage(key)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              activePage === key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Sub-page content */}
      {activePage === "predev" && (
        <PreDevelopmentBudgetSubPage projectId={projectId} />
      )}
      {activePage === "equity" && (
        <EquitySubPage
          projectId={projectId}
          investorPositions={data.investorPositions}
          reloadPositions={data.reload}
        />
      )}
      {activePage === "debt" && (
        <DebtSubPage
          budgetTotal={data.budgetTotal}
          debtTranches={data.debtTranches}
          addDebt={data.addDebt}
          updateDebt={data.updateDebt}
          deleteDebt={data.deleteDebt}
        />
      )}
      {activePage === "cashflow" && (
        <CashFlowSubPage
          projectId={projectId}
          budgetTotal={data.budgetTotal}
          cashFlowRows={data.cashFlowRows}
          upsertCashFlow={data.upsertCashFlow}
          deleteCashFlowAll={data.deleteCashFlowAll}
          plaidAccountId={plaidAccountId}
        />
      )}
      {activePage === "model" && (
        <FinancialModelSubPage projectId={projectId} />
      )}
    </div>
  );
}
