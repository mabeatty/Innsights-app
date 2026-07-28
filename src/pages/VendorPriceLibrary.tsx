import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const db = supabase as any;

interface CatalogItem { id: string; canonical_name: string; category: string | null; synonyms: string[]; }
interface LineItem {
  id: string; vendor_name: string; catalog_item_id: string | null; item_name: string | null;
  category: string | null; raw_description: string | null; quantity: number | null; unit: string | null;
  unit_price: number | null; ext_price: number | null; room_type: string | null; project_label: string | null;
  brand: string | null; price_basis: string | null; source_doc: string | null; status: string | null;
}

const money = (n: number | null) =>
  n == null ? "—" : Number(n).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export default function VendorPriceLibrary() {
  const navigate = useNavigate();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [rows, setRows] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [itemQuery, setItemQuery] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [selectedVendor, setSelectedVendor] = useState("");

  useEffect(() => {
    (async () => {
      const [iRes, pRes] = await Promise.all([
        db.from("catalog_items").select("*").order("canonical_name"),
        db.from("bid_line_items").select("*").order("unit_price", { ascending: true }),
      ]);
      setItems((iRes.data ?? []) as CatalogItem[]);
      setRows((pRes.data ?? []) as LineItem[]);
      setLoading(false);
    })();
  }, []);

  const brands = useMemo(() => Array.from(new Set(rows.map(r => r.brand).filter(Boolean))) as string[], [rows]);
  const projects = useMemo(() => Array.from(new Set(rows.map(r => r.project_label).filter(Boolean))) as string[], [rows]);
  const vendors = useMemo(() => Array.from(new Set(rows.map(r => r.vendor_name))).sort(), [rows]);

  // only items that actually have line-item pricing, plus synonym-aware search
  const pricedItemIds = useMemo(() => new Set(rows.map(r => r.catalog_item_id)), [rows]);
  const matchedItems = useMemo(() => {
    const q = itemQuery.trim().toLowerCase();
    return items
      .filter(i => pricedItemIds.has(i.id))
      .filter(i => !q || i.canonical_name.toLowerCase().includes(q) || (i.synonyms ?? []).some(s => s.toLowerCase().includes(q)));
  }, [items, itemQuery, pricedItemIds]);

  const itemRows = useMemo(() => {
    if (!selectedItemId) return [];
    return rows
      .filter(r => r.catalog_item_id === selectedItemId)
      .filter(r => brandFilter === "all" || r.brand === brandFilter)
      .filter(r => projectFilter === "all" || r.project_label === projectFilter)
      .sort((a, b) => (a.unit_price ?? Infinity) - (b.unit_price ?? Infinity));
  }, [rows, selectedItemId, brandFilter, projectFilter]);

  const vendorRows = useMemo(() => rows.filter(r => r.vendor_name === selectedVendor), [rows, selectedVendor]);
  const vendorItems = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of vendorRows) if (r.catalog_item_id && r.item_name) m.set(r.catalog_item_id, r.item_name);
    return Array.from(m.values()).sort();
  }, [vendorRows]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading vendor price library…</div>;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <button onClick={() => navigate("/vendors")} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Vendors
      </button>
      <h1 className="mb-1 text-2xl font-bold text-primary">Vendor Price Library</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        Per-unit vendor pricing across projects. Search an item to see what each vendor charged per unit, or open a vendor to see everything they've supplied.
      </p>

      <Tabs defaultValue="by-item">
        <TabsList className="bg-blue-100 text-blue-900">
          <TabsTrigger value="by-item">By Item</TabsTrigger>
          <TabsTrigger value="by-vendor">By Vendor</TabsTrigger>
        </TabsList>

        <TabsContent value="by-item" className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Find an item (try "garbage can")</label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input className="h-9 pl-7" placeholder="Search items or synonyms…" value={itemQuery} onChange={e => setItemQuery(e.target.value)} />
              </div>
              <Select value={selectedItemId} onValueChange={setSelectedItemId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select an item" /></SelectTrigger>
                <SelectContent>
                  {matchedItems.map(i => <SelectItem key={i.id} value={i.id}>{i.canonical_name}{i.category ? ` · ${i.category}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Brand</label>
                <Select value={brandFilter} onValueChange={setBrandFilter}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All brands</SelectItem>
                    {brands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Project</label>
                <Select value={projectFilter} onValueChange={setProjectFilter}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any project</SelectItem>
                    {projects.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {selectedItemId ? (
            <div className="rounded-lg border overflow-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead>
                  <tr className="bg-muted/50 text-left text-muted-foreground">
                    <th className="px-3 py-2">Vendor</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2 text-right">Unit Price</th>
                    <th className="px-3 py-2">Room / Location</th>
                    <th className="px-3 py-2">Project</th>
                    <th className="px-3 py-2">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {itemRows.length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No pricing recorded for this item yet.</td></tr>
                  ) : itemRows.map(r => (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">{r.vendor_name}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-[280px]">{r.raw_description}</td>
                      <td className="px-3 py-2 text-right font-semibold">{money(r.unit_price)}<span className="text-xs font-normal text-muted-foreground">{r.unit ? ` /${r.unit}` : ""}</span></td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.room_type}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.project_label}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-[200px] truncate" title={r.source_doc ?? ""}>{r.source_doc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Pick an item above to see every vendor's per-unit price for it.</p>
          )}
        </TabsContent>

        <TabsContent value="by-vendor" className="mt-4 space-y-4">
          <div className="max-w-sm space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Vendor</label>
            <Select value={selectedVendor} onValueChange={setSelectedVendor}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select a vendor" /></SelectTrigger>
              <SelectContent>{vendors.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {selectedVendor && (
            <>
              <div className="flex gap-6 rounded-lg border bg-card p-4">
                <div><div className="text-2xl font-bold text-primary">{vendorRows.length}</div><div className="text-xs text-muted-foreground">Line items</div></div>
                <div><div className="text-2xl font-bold text-primary">{new Set(vendorRows.map(r => r.project_label)).size}</div><div className="text-xs text-muted-foreground">Projects</div></div>
                <div><div className="text-2xl font-bold text-primary">{vendorItems.length}</div><div className="text-xs text-muted-foreground">Items supplied</div></div>
              </div>

              <div>
                <div className="mb-1 text-sm font-semibold text-primary">Items supplied</div>
                <div className="flex flex-wrap gap-1.5">
                  {vendorItems.map(name => <span key={name} className="rounded-full bg-muted px-2.5 py-1 text-xs">{name}</span>)}
                </div>
              </div>

              <div>
                <div className="mb-1 text-sm font-semibold text-primary">Price history</div>
                <div className="rounded-lg border overflow-auto">
                  <table className="w-full text-sm min-w-[820px]">
                    <thead>
                      <tr className="bg-muted/50 text-left text-muted-foreground">
                        <th className="px-3 py-2">Item</th>
                        <th className="px-3 py-2">Description</th>
                        <th className="px-3 py-2 text-right">Unit Price</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2">Project</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vendorRows.map(r => (
                        <tr key={r.id} className="border-t hover:bg-muted/30">
                          <td className="px-3 py-2">{r.item_name}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground max-w-[280px]">{r.raw_description}</td>
                          <td className="px-3 py-2 text-right font-semibold">{money(r.unit_price)}<span className="text-xs font-normal text-muted-foreground">{r.unit ? ` /${r.unit}` : ""}</span></td>
                          <td className="px-3 py-2 text-right text-xs text-muted-foreground">{r.quantity ?? "—"}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{r.project_label}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
