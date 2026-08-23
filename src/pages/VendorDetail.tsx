import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Mail, Phone, MapPin, Pencil, Star } from "lucide-react";
import { toast } from "sonner";
import { freshness, fmtDate } from "@/lib/pricingFreshness";
import VendorW9Panel from "@/components/vendors/VendorW9Panel";

const db = supabase as any;

interface VendorInfo {
  id: string; org_id: string; vendor_name: string; category: string | null; contact_name: string | null;
  phone: string | null; email: string | null; address: string | null; markets: string | null; notes: string | null; performance_rating: number | null;
}
interface Rec {
  id: string; grain: "line" | "gross"; item_name: string | null; category: string | null;
  description: string | null; unit_price: number | null; unit: string | null; gross_price: number | null;
  price_text: string | null; quantity: number | null; room_type: string | null; project_label: string | null;
  brand: string | null; source_doc: string | null; source_url: string | null; price_date: string | null;
}

const money = (n: number | null) =>
  n == null ? "—" : Number(n).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

function StarRating({ value, onChange, size = 20 }: { value: number; onChange: (v: number) => void; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n === value ? 0 : n)}>
          <Star size={size} className={n <= value ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"} />
        </button>
      ))}
    </div>
  );
}

export default function VendorDetail() {
  const { vendorId } = useParams();
  const navigate = useNavigate();
  const [vendor, setVendor] = useState<VendorInfo | null>(null);
  const [recs, setRecs] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [form, setForm] = useState({
    vendor_name: "", category: "", contact_name: "", phone: "", email: "", address: "", markets: "", notes: "", performance_rating: 0,
  });
  const [saving, setSaving] = useState(false);

  const openEdit = () => {
    if (!vendor) return;
    setForm({
      vendor_name: vendor.vendor_name,
      category: vendor.category ?? "",
      contact_name: vendor.contact_name ?? "",
      phone: vendor.phone ?? "",
      email: vendor.email ?? "",
      address: vendor.address ?? "",
      markets: vendor.markets ?? "",
      notes: vendor.notes ?? "",
      performance_rating: vendor.performance_rating ?? 0,
    });
    setEditOpen(true);
  };

  const saveVendor = async () => {
    if (!vendor) return;
    if (!form.vendor_name.trim() || !form.category) {
      toast.error("Vendor name and category are required.");
      return;
    }
    setSaving(true);
    const payload = {
      vendor_name: form.vendor_name.trim(),
      category: form.category,
      contact_name: form.contact_name.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      markets: form.markets.trim() || null,
      notes: form.notes.trim() || null,
      performance_rating: form.performance_rating,
    };
    const { error } = await supabase.from("global_vendors").update(payload).eq("id", vendor.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Vendor updated.");
    setEditOpen(false);
    setVendor({ ...vendor, ...payload });
  };

  useEffect(() => {
    if (!vendorId) return;
    (async () => {
      setLoading(true);
      const [vRes, iRes, lRes, gRes] = await Promise.all([
        db.from("global_vendors").select("*").eq("id", vendorId).maybeSingle(),
        db.from("catalog_items").select("id, canonical_name"),
        db.from("bid_line_items").select("*").eq("global_vendor_id", vendorId),
        db.from("vendor_pricing").select("*").eq("global_vendor_id", vendorId),
      ]);
      if (!vRes.data) { setNotFound(true); setLoading(false); return; }
      const catRes = await db.from("vendor_categories").select("name").eq("org_id", vRes.data.org_id);
      setCategoryOptions(Array.from(new Set((catRes.data ?? []).map((r: any) => r.name).filter(Boolean))).sort());
      const nameById = new Map((iRes.data ?? []).map((c: any) => [c.id, c.canonical_name]));
      const line: Rec[] = (lRes.data ?? []).map((r: any) => ({
        id: "l_" + r.id, grain: "line", item_name: r.item_name,
        category: r.catalog_item_id ? (nameById.get(r.catalog_item_id) ?? null) : null,
        description: r.raw_description, unit_price: r.unit_price, unit: r.unit, gross_price: r.ext_price,
        price_text: null, quantity: r.quantity, room_type: r.room_type, project_label: r.project_label,
        brand: r.brand, source_doc: r.source_doc, source_url: r.source_url, price_date: r.price_date,
      }));
      const gross: Rec[] = (gRes.data ?? []).map((r: any) => ({
        id: "g_" + r.id, grain: "gross",
        item_name: r.catalog_item_id ? (nameById.get(r.catalog_item_id) ?? null) : null,
        category: r.catalog_item_id ? (nameById.get(r.catalog_item_id) ?? null) : null, description: r.scope,
        unit_price: null, unit: null, gross_price: r.gross_price, price_text: r.price_text, quantity: null,
        room_type: null, project_label: r.project_label, brand: r.brand, source_doc: r.source_doc,
        source_url: r.source_url, price_date: r.price_date,
      }));
      const all = [...line, ...gross].sort((a, b) => {
        if (!a.price_date && !b.price_date) return 0;
        if (!a.price_date) return 1;
        if (!b.price_date) return -1;
        return b.price_date.localeCompare(a.price_date);
      });
      setVendor(vRes.data as VendorInfo);
      setRecs(all);
      setLoading(false);
    })();
  }, [vendorId]);

  const projectCount = useMemo(() => new Set(recs.map(r => r.project_label).filter(Boolean)).size, [recs]);
  const mostRecent = useMemo(() => recs.find(r => r.price_date)?.price_date ?? null, [recs]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading vendor…</div>;
  if (notFound) return (
    <div className="mx-auto max-w-3xl p-6">
      <button onClick={() => navigate("/vendors")} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Vendors
      </button>
      <p className="text-sm text-muted-foreground">Vendor not found.</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl p-6">
      <button onClick={() => navigate(-1)} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      {/* Contact info card, top of page */}
      <div className="mb-6 rounded-lg border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-primary">{vendor!.vendor_name}</h1>
            {vendor!.category && <Badge variant="secondary" className="mt-1">{vendor!.category}</Badge>}
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={openEdit}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Contact:</span>
            <span>{vendor!.contact_name || "—"}</span>
          </div>
          <div className="flex items-center gap-2">
            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
            {vendor!.phone ? <a href={`tel:${vendor!.phone}`} className="hover:underline">{vendor!.phone}</a> : <span className="text-muted-foreground">—</span>}
          </div>
          <div className="flex items-center gap-2">
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            {vendor!.email ? <a href={`mailto:${vendor!.email}`} className="hover:underline">{vendor!.email}</a> : <span className="text-muted-foreground">—</span>}
          </div>
          {vendor!.address && (
            <div className="flex items-center gap-2 sm:col-span-3">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span>{vendor!.address}</span>
            </div>
          )}
          {vendor!.markets && (
            <div className="flex items-center gap-2 sm:col-span-3">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{vendor!.markets}</span>
            </div>
          )}
        </div>
        {vendor!.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground border-t pt-3">{vendor!.notes}</p>}
      </div>

      <div className="mb-6">
        <VendorW9Panel vendorId={vendor!.id} vendorName={vendor!.vendor_name} orgId={vendor!.org_id} mode="full" />
      </div>

      {/* Summary stats */}
      <div className="mb-4 flex gap-6 rounded-lg border bg-card p-4">
        <div><div className="text-2xl font-bold text-primary">{recs.length}</div><div className="text-xs text-muted-foreground">Price records</div></div>
        <div><div className="text-2xl font-bold text-primary">{projectCount}</div><div className="text-xs text-muted-foreground">Projects</div></div>
        <div><div className="text-2xl font-bold text-primary">{fmtDate(mostRecent)}</div><div className="text-xs text-muted-foreground">Most recent pricing</div></div>
      </div>

      {/* All items from this vendor */}
      <div className="mb-1 text-sm font-semibold text-primary">All items &amp; pricing</div>
      <div className="rounded-lg border overflow-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="bg-muted/50 text-left text-muted-foreground">
              <th className="px-3 py-2">Item / Scope</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2">Project</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Source</th>
            </tr>
          </thead>
          <tbody>
            {recs.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No pricing on file for this vendor.</td></tr>
            ) : recs.map(r => {
              const f = freshness(r.price_date);
              return (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 max-w-[280px]">
                    <div className="font-medium">{r.item_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground truncate">{r.description}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.category}</td>
                  <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                    {r.grain === "line"
                      ? <span>{money(r.unit_price)}<span className="text-xs font-normal text-muted-foreground">{r.unit ? ` /${r.unit}` : ""}</span></span>
                      : <span>{money(r.gross_price)}<span className="ml-1 rounded bg-muted px-1 text-[10px] uppercase text-muted-foreground">program</span></span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.project_label}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="text-xs">{fmtDate(r.price_date)}</div>
                    <span className={`inline-block mt-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${f.cls}`}>{f.label}</span>
                  </td>
                  <td className="px-3 py-2 text-xs max-w-[160px] truncate" title={r.source_doc ?? ""}>
                    {r.source_url ? <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{r.source_doc}</a> : <span className="text-muted-foreground">{r.source_doc}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Vendor</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Vendor Name *</Label>
              <Input value={form.vendor_name} onChange={(e) => setForm({ ...form, vendor_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Contact Name</Label>
              <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Address</Label>
              <Input
                placeholder="e.g. 123 Main St, Columbus, OH 43215"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Markets / Geographies Served</Label>
              <Input
                placeholder="e.g. New York, Miami, Chicago"
                value={form.markets}
                onChange={(e) => setForm({ ...form, markets: e.target.value })}
              />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Notes</Label>
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Performance Rating</Label>
              <StarRating value={form.performance_rating} onChange={(v) => setForm({ ...form, performance_rating: v })} size={24} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={saveVendor} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
