-- Add price_date to bid_line_items so pricing freshness can be shown
-- (vendor_pricing already has this column; bid_line_items didn't).
ALTER TABLE public.bid_line_items ADD COLUMN price_date date;
CREATE INDEX idx_bli_price_date ON public.bid_line_items(price_date);
CREATE INDEX idx_vendor_pricing_price_date ON public.vendor_pricing(price_date);
