import { useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BudgetRow, BudgetTransaction } from "./types";
import type { G702FormData } from "./G702Tab";

const APPROVED_STATUSES = new Set(["Approved", "Paid", "Deferred"]);

const DIV_TO_AIA_ITEM: Record<string, string> = {
  "01": "1", "02": "2", "03": "3", "04": "4", "05": "5",
  "06": "6", "07": "7", "08": "8", "09": "9", "10": "10",
  "11": "11", "12": "12", "13": "13", "14": "14",
  "21": "21", "22": "22", "23": "23", "26": "26", "28": "28",
  "31": "31", "32": "32", "33": "33", HC: "HC",
  "60": "60", "61": "61", "62": "62", "63": "63", "64": "64",
  "65": "65", "66": "66", "67": "67", "68": "68", "69": "69",
  "70": "70", "71": "71", "72": "72", "73": "73", "74": "74",
  "75": "75", "76": "76", "77": "77", "78": "78", "79": "79", "80": "80",
};

export function useAIAExport(
  budgetRows: BudgetRow[],
  transactions: BudgetTransaction[],
  formData: G702FormData,
) {
  const [exporting, setExporting] = useState(false);

  const divisionExportRows = useMemo(() => {
    const txByDiv = new Map<string, BudgetTransaction[]>();
    for (const txn of transactions) {
      if (!APPROVED_STATUSES.has(txn.status)) continue;
      const list = txByDiv.get(txn.division_number) ?? [];
      list.push(txn);
      txByDiv.set(txn.division_number, list);
    }
    return budgetRows.map((row) => {
      const divTxns = txByDiv.get(row.division_number) ?? [];
      return {
        divisionNumber: row.division_number,
        scheduledValue: row.scheduled_value,
        previousApplication: divTxns.filter((t) => t.draw_id != null).reduce((s, t) => s + Number(t.amount), 0),
        thisPeriod: divTxns.filter((t) => t.draw_id == null).reduce((s, t) => s + Number(t.amount), 0),
      };
    });
  }, [budgetRows, transactions]);

  const invoiceRows = useMemo(() => {
    return transactions
      .filter((t) => (t.status === "Approved" || t.status === "Paid") && !t.draw_id)
      .map((t) => ({
        vendor: t.payee,
        invoiceNumber: String(t.transaction_number),
        invoiceDate: t.date,
        drawNumber: formData.applicationNo,
        aiaItemNumber: DIV_TO_AIA_ITEM[t.division_number] ?? t.division_number,
        costType: t.transaction_type,
        costAmount: Number(t.amount),
        retainageAmount: Number(t.retainage_amount),
      }));
  }, [transactions, formData.applicationNo]);

  const handleExportAIA = useCallback(async () => {
    setExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please log in to export.");
        return;
      }

      const payload = {
        projectName: formData.projectName,
        ownerName: formData.ownerName,
        applicationNo: formData.applicationNo,
        periodTo: formData.periodTo,
        contractorName: formData.contractorName,
        architectName: formData.architectName,
        contractDate: formData.contractDate,
        projectNumber: formData.projectNumber,
        previousCertificates: formData.previousCertificates,
        retainagePctWork: formData.retainagePctWork,
        retainagePctMaterials: formData.retainagePctMaterials,
        g703Rows: divisionExportRows,
        invoiceRows,
      };

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-aia-excel`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Export failed");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const safeName = formData.projectName.replace(/\s+/g, "_");
      const fileName = `${safeName}_AIA_G702-703_App${formData.applicationNo}.xlsx`;
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("AIA G702/G703 exported successfully.");
    } catch (err: any) {
      console.error("AIA export error:", err);
      toast.error(err.message || "Failed to export AIA document.");
    } finally {
      setExporting(false);
    }
  }, [formData, divisionExportRows, invoiceRows]);

  return { exporting, handleExportAIA };
}
