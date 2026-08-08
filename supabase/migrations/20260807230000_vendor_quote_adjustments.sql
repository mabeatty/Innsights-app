-- Bid leveling: scope adjustments applied to a vendor's quote to normalize it
-- against the other bids (add back excluded scope, deduct unrequested scope,
-- etc.), so bids can be compared on a true apples-to-apples basis.
-- amount is signed: positive increases the leveled total, negative decreases it.
CREATE TABLE vendor_quote_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES vendor_quotes(id) ON DELETE CASCADE,
  description text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vendor_quote_adjustments_quote_id ON vendor_quote_adjustments(quote_id);

ALTER TABLE vendor_quote_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select vendor_quote_adjustments" ON vendor_quote_adjustments
  FOR SELECT USING (
    quote_id IN (
      SELECT vq.id FROM vendor_quotes vq
      JOIN vendor_bid_items vbi ON vbi.id = vq.bid_item_id
      WHERE vbi.project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid()))
    )
  );

CREATE POLICY "Org members can insert vendor_quote_adjustments" ON vendor_quote_adjustments
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Org members can update vendor_quote_adjustments" ON vendor_quote_adjustments
  FOR UPDATE USING (
    quote_id IN (
      SELECT vq.id FROM vendor_quotes vq
      JOIN vendor_bid_items vbi ON vbi.id = vq.bid_item_id
      WHERE vbi.project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid()))
    )
  );

CREATE POLICY "Org members can delete vendor_quote_adjustments" ON vendor_quote_adjustments
  FOR DELETE USING (
    quote_id IN (
      SELECT vq.id FROM vendor_quotes vq
      JOIN vendor_bid_items vbi ON vbi.id = vq.bid_item_id
      WHERE vbi.project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid()))
    )
  );
