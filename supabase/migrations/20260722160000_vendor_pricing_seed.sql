DO $$ DECLARE v_org uuid;
BEGIN
  SELECT id INTO v_org FROM public.organizations LIMIT 1;
  INSERT INTO public.catalog_items (org_id, canonical_name, category, synonyms) VALUES (v_org, 'Procurement Services (PM)', 'Services', ARRAY['procurement services','program management','pm fee','purchasing management']::text[]) ON CONFLICT (org_id, canonical_name) DO NOTHING;
  INSERT INTO public.catalog_items (org_id, canonical_name, category, synonyms) VALUES (v_org, 'Guestroom Casegoods Package', 'FF&E', ARRAY['casegoods','guestroom casegoods','soft seating','furniture package']::text[]) ON CONFLICT (org_id, canonical_name) DO NOTHING;
  INSERT INTO public.catalog_items (org_id, canonical_name, category, synonyms) VALUES (v_org, 'Guestroom FF&E Sample Room', 'FF&E', ARRAY['sample room','prototype room','model room']::text[]) ON CONFLICT (org_id, canonical_name) DO NOTHING;
  INSERT INTO public.catalog_items (org_id, canonical_name, category, synonyms) VALUES (v_org, 'Lighting Fixtures', 'FF&E', ARRAY['lighting','light fixtures','sconces','pendants','lamps']::text[]) ON CONFLICT (org_id, canonical_name) DO NOTHING;
  INSERT INTO public.catalog_items (org_id, canonical_name, category, synonyms) VALUES (v_org, 'Outdoor Furniture', 'FF&E', ARRAY['outdoor furniture','pool furniture','patio furniture']::text[]) ON CONFLICT (org_id, canonical_name) DO NOTHING;
  INSERT INTO public.catalog_items (org_id, canonical_name, category, synonyms) VALUES (v_org, 'Wall Graphics', 'FF&E', ARRAY['wall mural','graphics','signage']::text[]) ON CONFLICT (org_id, canonical_name) DO NOTHING;
  INSERT INTO public.catalog_items (org_id, canonical_name, category, synonyms) VALUES (v_org, 'Artwork', 'FF&E', ARRAY['artwork','art','framed art']::text[]) ON CONFLICT (org_id, canonical_name) DO NOTHING;
  INSERT INTO public.catalog_items (org_id, canonical_name, category, synonyms) VALUES (v_org, 'Closet Storage Systems', 'FF&E', ARRAY['closet storage','closet system','storage unit']::text[]) ON CONFLICT (org_id, canonical_name) DO NOTHING;
  INSERT INTO public.catalog_items (org_id, canonical_name, category, synonyms) VALUES (v_org, 'Closet Organization System', 'FF&E', ARRAY['closet organization','elfa','closet kit']::text[]) ON CONFLICT (org_id, canonical_name) DO NOTHING;
  INSERT INTO public.catalog_items (org_id, canonical_name, category, synonyms) VALUES (v_org, 'Wall Vinyl / Wallcovering', 'FF&E', ARRAY['wallcovering','wall vinyl','wallpaper']::text[]) ON CONFLICT (org_id, canonical_name) DO NOTHING;
  INSERT INTO public.catalog_items (org_id, canonical_name, category, synonyms) VALUES (v_org, 'Flooring & Carpet', 'FF&E', ARRAY['carpet','flooring','lvt','rubber base','area rug','guestroom carpet','corridor carpet']::text[]) ON CONFLICT (org_id, canonical_name) DO NOTHING;
  INSERT INTO public.catalog_items (org_id, canonical_name, category, synonyms) VALUES (v_org, 'Carpet Padding', 'FF&E', ARRAY['carpet padding','cushion','underlayment']::text[]) ON CONFLICT (org_id, canonical_name) DO NOTHING;
  INSERT INTO public.catalog_items (org_id, canonical_name, category, synonyms) VALUES (v_org, 'Mattresses', 'FF&E', ARRAY['mattress','mattresses','box spring']::text[]) ON CONFLICT (org_id, canonical_name) DO NOTHING;
  INSERT INTO public.catalog_items (org_id, canonical_name, category, synonyms) VALUES (v_org, 'Access Control / Electronic Locks', 'Technology', ARRAY['locks','rfid locks','access control','keycard','door locks']::text[]) ON CONFLICT (org_id, canonical_name) DO NOTHING;
  INSERT INTO public.catalog_items (org_id, canonical_name, category, synonyms) VALUES (v_org, 'Doors, Frames & Hardware', 'Division 08', ARRAY['doors','frames','hardware','hollow metal','wood doors']::text[]) ON CONFLICT (org_id, canonical_name) DO NOTHING;
  INSERT INTO public.catalog_items (org_id, canonical_name, category, synonyms) VALUES (v_org, 'Bath Accessories', 'FF&E', ARRAY['bath accessories','grab bars','towel bars','robe hooks','toilet paper holder']::text[]) ON CONFLICT (org_id, canonical_name) DO NOTHING;
  INSERT INTO public.catalog_items (org_id, canonical_name, category, synonyms) VALUES (v_org, 'Countertops / Millwork / Shower Surrounds', 'Millwork', ARRAY['countertops','quartz','millwork','cabinets','shower doors']::text[]) ON CONFLICT (org_id, canonical_name) DO NOTHING;
  INSERT INTO public.catalog_items (org_id, canonical_name, category, synonyms) VALUES (v_org, 'Shower/Tub Surrounds & Glass', 'Millwork', ARRAY['shower surround','tub surround','cultured marble','shower glass','shower pan']::text[]) ON CONFLICT (org_id, canonical_name) DO NOTHING;
  INSERT INTO public.catalog_items (org_id, canonical_name, category, synonyms) VALUES (v_org, 'Kitchen Cabinets & Vanity Bases', 'Millwork', ARRAY['kitchen cabinets','vanity bases','vanities']::text[]) ON CONFLICT (org_id, canonical_name) DO NOTHING;
  INSERT INTO public.catalog_items (org_id, canonical_name, category, synonyms) VALUES (v_org, 'Public Area Millwork', 'Millwork', ARRAY['public area millwork','welcome desk','reception desk','handrail']::text[]) ON CONFLICT (org_id, canonical_name) DO NOTHING;
  INSERT INTO public.catalog_items (org_id, canonical_name, category, synonyms) VALUES (v_org, 'Fitness Equipment', 'Equipment', ARRAY['fitness equipment','gym equipment','treadmill','elliptical','weights']::text[]) ON CONFLICT (org_id, canonical_name) DO NOTHING;
  INSERT INTO public.catalog_items (org_id, canonical_name, category, synonyms) VALUES (v_org, 'Kitchen/Breakroom Equipment', 'Equipment', ARRAY['kitchen equipment','breakroom equipment','refrigerator','dishwasher','ice maker']::text[]) ON CONFLICT (org_id, canonical_name) DO NOTHING;
  INSERT INTO public.catalog_items (org_id, canonical_name, category, synonyms) VALUES (v_org, 'Trash Cans', 'Site Accessories', ARRAY['trash can','trash cans','waste receptacle','garbage can','refuse container','waste bin']::text[]) ON CONFLICT (org_id, canonical_name) DO NOTHING;
  INSERT INTO public.catalog_items (org_id, canonical_name, category, synonyms) VALUES (v_org, 'Tree Removal', 'Site Work', ARRAY['tree removal','tree clearing','land clearing']::text[]) ON CONFLICT (org_id, canonical_name) DO NOTHING;
  INSERT INTO public.catalog_items (org_id, canonical_name, category, synonyms) VALUES (v_org, 'Builders Risk Insurance', 'Insurance', ARRAY['builders risk','insurance','inland marine']::text[]) ON CONFLICT (org_id, canonical_name) DO NOTHING;
  INSERT INTO public.global_vendors (org_id, vendor_name, category) SELECT v_org, 'Premier Project Management, LLC', 'Procurement Services (PM)' WHERE NOT EXISTS (SELECT 1 FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Premier Project Management, LLC');
  INSERT INTO public.global_vendors (org_id, vendor_name, category) SELECT v_org, 'Innovative Furnishings LLC (dba Inn Furnishings)', 'FF&E Supplier' WHERE NOT EXISTS (SELECT 1 FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Innovative Furnishings LLC (dba Inn Furnishings)');
  INSERT INTO public.global_vendors (org_id, vendor_name, category) SELECT v_org, 'RR Import Inc (via Rising Sun Hospitality)', 'FF&E Supplier' WHERE NOT EXISTS (SELECT 1 FROM public.global_vendors WHERE org_id=v_org AND vendor_name='RR Import Inc (via Rising Sun Hospitality)');
  INSERT INTO public.global_vendors (org_id, vendor_name, category) SELECT v_org, 'Daiso Construction LLC', 'FF&E Supplier' WHERE NOT EXISTS (SELECT 1 FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Daiso Construction LLC');
  INSERT INTO public.global_vendors (org_id, vendor_name, category) SELECT v_org, 'Trinity Lighting Inc', 'Lighting fixtures' WHERE NOT EXISTS (SELECT 1 FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Trinity Lighting Inc');
  INSERT INTO public.global_vendors (org_id, vendor_name, category) SELECT v_org, 'Tropitone Furniture Company Inc', 'Outdoor furniture' WHERE NOT EXISTS (SELECT 1 FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Tropitone Furniture Company Inc');
  INSERT INTO public.global_vendors (org_id, vendor_name, category) SELECT v_org, 'Indiewalls Inc', 'Wall murals / graphics' WHERE NOT EXISTS (SELECT 1 FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Indiewalls Inc');
  INSERT INTO public.global_vendors (org_id, vendor_name, category) SELECT v_org, 'Wendover Art Group', 'Artwork' WHERE NOT EXISTS (SELECT 1 FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Wendover Art Group');
  INSERT INTO public.global_vendors (org_id, vendor_name, category) SELECT v_org, 'JG Edelen Co Inc', 'Closet storage systems' WHERE NOT EXISTS (SELECT 1 FROM public.global_vendors WHERE org_id=v_org AND vendor_name='JG Edelen Co Inc');
  INSERT INTO public.global_vendors (org_id, vendor_name, category) SELECT v_org, 'The Container Store', 'Closet organization system' WHERE NOT EXISTS (SELECT 1 FROM public.global_vendors WHERE org_id=v_org AND vendor_name='The Container Store');
  INSERT INTO public.global_vendors (org_id, vendor_name, category) SELECT v_org, 'MDC Wallcoverings', 'Wall vinyl / wallcovering' WHERE NOT EXISTS (SELECT 1 FROM public.global_vendors WHERE org_id=v_org AND vendor_name='MDC Wallcoverings');
  INSERT INTO public.global_vendors (org_id, vendor_name, category) SELECT v_org, 'Shaw Industries Inc', 'Flooring, carpet, rubber base' WHERE NOT EXISTS (SELECT 1 FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Shaw Industries Inc');
  INSERT INTO public.global_vendors (org_id, vendor_name, category) SELECT v_org, 'Sponge Cushion Inc', 'Carpet padding' WHERE NOT EXISTS (SELECT 1 FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Sponge Cushion Inc');
  INSERT INTO public.global_vendors (org_id, vendor_name, category) SELECT v_org, 'Serta (Restokraft / SSB Hospitality)', 'FF&E Supplier' WHERE NOT EXISTS (SELECT 1 FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Serta (Restokraft / SSB Hospitality)');
  INSERT INTO public.global_vendors (org_id, vendor_name, category) SELECT v_org, 'Onity', 'Access Control Systems' WHERE NOT EXISTS (SELECT 1 FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Onity');
  INSERT INTO public.global_vendors (org_id, vendor_name, category) SELECT v_org, 'TACC, Inc.', 'Doors, Frames & Hardware' WHERE NOT EXISTS (SELECT 1 FROM public.global_vendors WHERE org_id=v_org AND vendor_name='TACC, Inc.');
  INSERT INTO public.global_vendors (org_id, vendor_name, category) SELECT v_org, 'MGroup (Mstone/Mshower/Mteriors)', 'Countertops, Millwork, Shower' WHERE NOT EXISTS (SELECT 1 FROM public.global_vendors WHERE org_id=v_org AND vendor_name='MGroup (Mstone/Mshower/Mteriors)');
  INSERT INTO public.global_vendors (org_id, vendor_name, category) SELECT v_org, 'MPL Company', 'Shower/Tub Surrounds & Glass' WHERE NOT EXISTS (SELECT 1 FROM public.global_vendors WHERE org_id=v_org AND vendor_name='MPL Company');
  INSERT INTO public.global_vendors (org_id, vendor_name, category) SELECT v_org, 'Sun Granite', 'Kitchen Cabinets & Vanity Bases' WHERE NOT EXISTS (SELECT 1 FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Sun Granite');
  INSERT INTO public.global_vendors (org_id, vendor_name, category) SELECT v_org, 'Felver Custom Cabinets, LLC', 'Public Area Millwork' WHERE NOT EXISTS (SELECT 1 FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Felver Custom Cabinets, LLC');
  INSERT INTO public.global_vendors (org_id, vendor_name, category) SELECT v_org, 'Life Fitness', 'Fitness Equipment' WHERE NOT EXISTS (SELECT 1 FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Life Fitness');
  INSERT INTO public.global_vendors (org_id, vendor_name, category) SELECT v_org, 'C&T Design', 'Kitchen/Breakroom Equipment' WHERE NOT EXISTS (SELECT 1 FROM public.global_vendors WHERE org_id=v_org AND vendor_name='C&T Design');
  INSERT INTO public.global_vendors (org_id, vendor_name, category) SELECT v_org, 'Architectural Brass Co', 'Trash cans / site accessories' WHERE NOT EXISTS (SELECT 1 FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Architectural Brass Co');
  INSERT INTO public.global_vendors (org_id, vendor_name, category) SELECT v_org, 'Monster Tree Service', 'Tree Removal' WHERE NOT EXISTS (SELECT 1 FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Monster Tree Service');
  INSERT INTO public.global_vendors (org_id, vendor_name, category) SELECT v_org, 'Liberty Mutual Insurance (via Insurance Associates)', 'Builders Risk Insurance' WHERE NOT EXISTS (SELECT 1 FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Liberty Mutual Insurance (via Insurance Associates)');
  INSERT INTO public.vendor_pricing (org_id, global_vendor_id, vendor_name, catalog_item_id, project_label, brand, gross_price, price_text, source_doc, status, notes) VALUES (
    v_org,
    (SELECT id FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Premier Project Management, LLC' LIMIT 1),
    'Premier Project Management, LLC',
    (SELECT id FROM public.catalog_items WHERE org_id=v_org AND canonical_name='Procurement Services (PM)' LIMIT 1),
    'AC Hotel Cleveland [217]', 'AC Hotel', 70000, '$70,000 flat fee', 'Witness Capital - AC Cleveland - Proc ONLY_060625.pdf', 'Proposal', NULL);
  INSERT INTO public.vendor_pricing (org_id, global_vendor_id, vendor_name, catalog_item_id, project_label, brand, gross_price, price_text, source_doc, status, notes) VALUES (
    v_org,
    (SELECT id FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Premier Project Management, LLC' LIMIT 1),
    'Premier Project Management, LLC',
    (SELECT id FROM public.catalog_items WHERE org_id=v_org AND canonical_name='Procurement Services (PM)' LIMIT 1),
    'Intech TPS [169]', 'TownePlace Suites', 1465694, '$1,465,694 total FF&E program', 'TownPlace Suites - Indy - NO F&W (2).pdf', 'Reference', 'Program total Premier managed, not confirmed as Premier''s own fee');
  INSERT INTO public.vendor_pricing (org_id, global_vendor_id, vendor_name, catalog_item_id, project_label, brand, gross_price, price_text, source_doc, status, notes) VALUES (
    v_org,
    (SELECT id FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Innovative Furnishings LLC (dba Inn Furnishings)' LIMIT 1),
    'Innovative Furnishings LLC (dba Inn Furnishings)',
    (SELECT id FROM public.catalog_items WHERE org_id=v_org AND canonical_name='Guestroom Casegoods Package' LIMIT 1),
    'Intech Home2 [214]', 'Home2 Suites', 800417.22, '$800,417.22 delivered (incl freight+tariff)', 'Proforma Proposal Home2 Indianapolis Aug 23.pdf', 'Proposal', NULL);
  INSERT INTO public.vendor_pricing (org_id, global_vendor_id, vendor_name, catalog_item_id, project_label, brand, gross_price, price_text, source_doc, status, notes) VALUES (
    v_org,
    (SELECT id FROM public.global_vendors WHERE org_id=v_org AND vendor_name='RR Import Inc (via Rising Sun Hospitality)' LIMIT 1),
    'RR Import Inc (via Rising Sun Hospitality)',
    (SELECT id FROM public.catalog_items WHERE org_id=v_org AND canonical_name='Guestroom FF&E Sample Room' LIMIT 1),
    'Intech TPS [169]', 'TownePlace Suites', 5809.64, '$5,809.64 (1 sample room)', 'Estimate DDP TownePlace Suites SAMPLE ROOM.IN.2026.3.15.pdf', 'Comparison', NULL);
  INSERT INTO public.vendor_pricing (org_id, global_vendor_id, vendor_name, catalog_item_id, project_label, brand, gross_price, price_text, source_doc, status, notes) VALUES (
    v_org,
    (SELECT id FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Daiso Construction LLC' LIMIT 1),
    'Daiso Construction LLC',
    (SELECT id FROM public.catalog_items WHERE org_id=v_org AND canonical_name='Guestroom Casegoods Package' LIMIT 1),
    'Intech TPS [169]', 'TownePlace Suites', 634032.0, '$634,032.00 actual purchase total', '169_FFE Comparison.xlsx', 'Awarded', 'Confirm Indianapolis-addressed version (template reused for other property)');
  INSERT INTO public.vendor_pricing (org_id, global_vendor_id, vendor_name, catalog_item_id, project_label, brand, gross_price, price_text, source_doc, status, notes) VALUES (
    v_org,
    (SELECT id FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Trinity Lighting Inc' LIMIT 1),
    'Trinity Lighting Inc',
    (SELECT id FROM public.catalog_items WHERE org_id=v_org AND canonical_name='Lighting Fixtures' LIMIT 1),
    'Intech TPS [169]', 'TownePlace Suites', 1041.6, '~$1,041.60 corridor lighting subtotal', '169_Marriott_03.09.2026 TPS Indy NW FFE Quote.pdf', 'Comparison', 'Partial (corridor only); guestroom lamps priced elsewhere');
  INSERT INTO public.vendor_pricing (org_id, global_vendor_id, vendor_name, catalog_item_id, project_label, brand, gross_price, price_text, source_doc, status, notes) VALUES (
    v_org,
    (SELECT id FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Tropitone Furniture Company Inc' LIMIT 1),
    'Tropitone Furniture Company Inc',
    (SELECT id FROM public.catalog_items WHERE org_id=v_org AND canonical_name='Outdoor Furniture' LIMIT 1),
    'Intech TPS [169]', 'TownePlace Suites', 10888.34, '$10,888.34 pool furniture subtotal', '169_FFE_Teresa_20260327revm.xlsx', 'Comparison', NULL);
  INSERT INTO public.vendor_pricing (org_id, global_vendor_id, vendor_name, catalog_item_id, project_label, brand, gross_price, price_text, source_doc, status, notes) VALUES (
    v_org,
    (SELECT id FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Indiewalls Inc' LIMIT 1),
    'Indiewalls Inc',
    (SELECT id FROM public.catalog_items WHERE org_id=v_org AND canonical_name='Wall Graphics' LIMIT 1),
    'Intech TPS [169]', 'TownePlace Suites', NULL, 'N/A - placeholder only', '169_FFE_Teresa_20260327revm.xlsx', 'Needs review', 'Marriott Exhibit A value is a QTY:1 placeholder, not real PO');
  INSERT INTO public.vendor_pricing (org_id, global_vendor_id, vendor_name, catalog_item_id, project_label, brand, gross_price, price_text, source_doc, status, notes) VALUES (
    v_org,
    (SELECT id FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Wendover Art Group' LIMIT 1),
    'Wendover Art Group',
    (SELECT id FROM public.catalog_items WHERE org_id=v_org AND canonical_name='Artwork' LIMIT 1),
    'Intech TPS [169]', 'TownePlace Suites', 1003.36, '$1,003.36', '169_FFE_Teresa_20260327revm.xlsx', 'Comparison', NULL);
  INSERT INTO public.vendor_pricing (org_id, global_vendor_id, vendor_name, catalog_item_id, project_label, brand, gross_price, price_text, source_doc, status, notes) VALUES (
    v_org,
    (SELECT id FROM public.global_vendors WHERE org_id=v_org AND vendor_name='JG Edelen Co Inc' LIMIT 1),
    'JG Edelen Co Inc',
    (SELECT id FROM public.catalog_items WHERE org_id=v_org AND canonical_name='Closet Storage Systems' LIMIT 1),
    'Intech TPS [169]', 'TownePlace Suites', 48292.17, '$48,292.17 (exercise room subtotal)', 'TPS Indy-FITNESS COMPARISON.xlsx', 'Needs review', 'Full exercise-room line, not JG Edelen standalone; confirm split');
  INSERT INTO public.vendor_pricing (org_id, global_vendor_id, vendor_name, catalog_item_id, project_label, brand, gross_price, price_text, source_doc, status, notes) VALUES (
    v_org,
    (SELECT id FROM public.global_vendors WHERE org_id=v_org AND vendor_name='The Container Store' LIMIT 1),
    'The Container Store',
    (SELECT id FROM public.catalog_items WHERE org_id=v_org AND canonical_name='Closet Organization System' LIMIT 1),
    'Intech TPS [169]', 'TownePlace Suites', 4550.2, '$4,550.20', '169_FFE_Teresa_20260327revm.xlsx', 'Comparison', NULL);
  INSERT INTO public.vendor_pricing (org_id, global_vendor_id, vendor_name, catalog_item_id, project_label, brand, gross_price, price_text, source_doc, status, notes) VALUES (
    v_org,
    (SELECT id FROM public.global_vendors WHERE org_id=v_org AND vendor_name='MDC Wallcoverings' LIMIT 1),
    'MDC Wallcoverings',
    (SELECT id FROM public.catalog_items WHERE org_id=v_org AND canonical_name='Wall Vinyl / Wallcovering' LIMIT 1),
    'Intech TPS [169]', 'TownePlace Suites', NULL, 'N/A - placeholder only', '169_Marriott_03.09.2026 TPS Indy NW FFE Quote.pdf', 'Needs review', 'Marriott Exhibit A values are QTY:1 placeholders');
  INSERT INTO public.vendor_pricing (org_id, global_vendor_id, vendor_name, catalog_item_id, project_label, brand, gross_price, price_text, source_doc, status, notes) VALUES (
    v_org,
    (SELECT id FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Shaw Industries Inc' LIMIT 1),
    'Shaw Industries Inc',
    (SELECT id FROM public.catalog_items WHERE org_id=v_org AND canonical_name='Flooring & Carpet' LIMIT 1),
    'Intech TPS [169]', 'TownePlace Suites', 92523.7, '$92,523.70 program total (corridor+guestroom+public)', '169_Marriott_03.09.2026 TPS Indy NW FFE Quote.pdf', 'Awarded', NULL);
  INSERT INTO public.vendor_pricing (org_id, global_vendor_id, vendor_name, catalog_item_id, project_label, brand, gross_price, price_text, source_doc, status, notes) VALUES (
    v_org,
    (SELECT id FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Sponge Cushion Inc' LIMIT 1),
    'Sponge Cushion Inc',
    (SELECT id FROM public.catalog_items WHERE org_id=v_org AND canonical_name='Carpet Padding' LIMIT 1),
    'Intech TPS [169]', 'TownePlace Suites', 7449.9, '$7,449.90 program total', '169_Marriott_03.09.2026 TPS Indy NW FFE Quote.pdf', 'Comparison', NULL);
  INSERT INTO public.vendor_pricing (org_id, global_vendor_id, vendor_name, catalog_item_id, project_label, brand, gross_price, price_text, source_doc, status, notes) VALUES (
    v_org,
    (SELECT id FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Serta (Restokraft / SSB Hospitality)' LIMIT 1),
    'Serta (Restokraft / SSB Hospitality)',
    (SELECT id FROM public.catalog_items WHERE org_id=v_org AND canonical_name='Mattresses' LIMIT 1),
    'Intech TPS [169]', 'TownePlace Suites', 55219.19, '$55,219.19 (Queen $318/ea, King $399/ea)', '169_Serta_20260203.xlsx', 'Proposal', NULL);
  INSERT INTO public.vendor_pricing (org_id, global_vendor_id, vendor_name, catalog_item_id, project_label, brand, gross_price, price_text, source_doc, status, notes) VALUES (
    v_org,
    (SELECT id FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Onity' LIMIT 1),
    'Onity',
    (SELECT id FROM public.catalog_items WHERE org_id=v_org AND canonical_name='Access Control / Electronic Locks' LIMIT 1),
    'Intech TPS [169]', 'TownePlace Suites', 63294.45, '$63,294.45 after discount', '169_Onity Quote - TownePlace_Intech_Indy-64170041-1.pdf', 'Proposal', NULL);
  INSERT INTO public.vendor_pricing (org_id, global_vendor_id, vendor_name, catalog_item_id, project_label, brand, gross_price, price_text, source_doc, status, notes) VALUES (
    v_org,
    (SELECT id FROM public.global_vendors WHERE org_id=v_org AND vendor_name='TACC, Inc.' LIMIT 1),
    'TACC, Inc.',
    (SELECT id FROM public.catalog_items WHERE org_id=v_org AND canonical_name='Doors, Frames & Hardware' LIMIT 1),
    'Intech TPS [169]', 'TownePlace Suites', 316702.0, '$316,702.00 (revised door package)', 'TOWNEPLACE SUITES INDIANAPOLIS IN REVISED DOOR PKG.pdf', 'Proposal', NULL);
  INSERT INTO public.vendor_pricing (org_id, global_vendor_id, vendor_name, catalog_item_id, project_label, brand, gross_price, price_text, source_doc, status, notes) VALUES (
    v_org,
    (SELECT id FROM public.global_vendors WHERE org_id=v_org AND vendor_name='TACC, Inc.' LIMIT 1),
    'TACC, Inc.',
    (SELECT id FROM public.catalog_items WHERE org_id=v_org AND canonical_name='Bath Accessories' LIMIT 1),
    'Intech TPS [169]', 'TownePlace Suites', 53000, '~$53,000+ (partial room-type subtotals)', 'TOWNEPLACE SUITES INDIANAPOLIS IN BATH ACCESSORIES PKG QUOTE.pdf', 'Needs review', 'Partial sum; confirm grand total');
  INSERT INTO public.vendor_pricing (org_id, global_vendor_id, vendor_name, catalog_item_id, project_label, brand, gross_price, price_text, source_doc, status, notes) VALUES (
    v_org,
    (SELECT id FROM public.global_vendors WHERE org_id=v_org AND vendor_name='MGroup (Mstone/Mshower/Mteriors)' LIMIT 1),
    'MGroup (Mstone/Mshower/Mteriors)',
    (SELECT id FROM public.catalog_items WHERE org_id=v_org AND canonical_name='Countertops / Millwork / Shower Surrounds' LIMIT 1),
    'Intech TPS [169]', 'TownePlace Suites', 483880.09, '$483,880.09 combined across 2 quotes', '169_MGroup_Coutertops=Millwork_20260203.pdf', 'Proposal', 'Separate POs required per division');
  INSERT INTO public.vendor_pricing (org_id, global_vendor_id, vendor_name, catalog_item_id, project_label, brand, gross_price, price_text, source_doc, status, notes) VALUES (
    v_org,
    (SELECT id FROM public.global_vendors WHERE org_id=v_org AND vendor_name='MPL Company' LIMIT 1),
    'MPL Company',
    (SELECT id FROM public.catalog_items WHERE org_id=v_org AND canonical_name='Shower/Tub Surrounds & Glass' LIMIT 1),
    'Intech TPS [169]', 'TownePlace Suites', 119584.87, '$119,584.87 combined (marble + glass)', 'MPL-Q#26642_TownePlace_Suites-IN_12-01-2025 Cultured Marble.pdf', 'Proposal', NULL);
  INSERT INTO public.vendor_pricing (org_id, global_vendor_id, vendor_name, catalog_item_id, project_label, brand, gross_price, price_text, source_doc, status, notes) VALUES (
    v_org,
    (SELECT id FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Sun Granite' LIMIT 1),
    'Sun Granite',
    (SELECT id FROM public.catalog_items WHERE org_id=v_org AND canonical_name='Kitchen Cabinets & Vanity Bases' LIMIT 1),
    'Intech TPS [169]', 'TownePlace Suites', 598960, '~$598,960 itemized (unconfirmed)', '169_Sun Granite_2025-25-Witness-Townplace-Intech.docx', 'Needs review', 'Quote addressed to another party; comparison workbook shows lower figures - reconcile');
  INSERT INTO public.vendor_pricing (org_id, global_vendor_id, vendor_name, catalog_item_id, project_label, brand, gross_price, price_text, source_doc, status, notes) VALUES (
    v_org,
    (SELECT id FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Felver Custom Cabinets, LLC' LIMIT 1),
    'Felver Custom Cabinets, LLC',
    (SELECT id FROM public.catalog_items WHERE org_id=v_org AND canonical_name='Public Area Millwork' LIMIT 1),
    'Intech TPS [169]', 'TownePlace Suites', 31640.0, '~$31,640 subtotal', '169_Felver-PA Milwork_5101-20241206.pdf', 'Needs review', 'Subtotal only; confirm tax/grand total');
  INSERT INTO public.vendor_pricing (org_id, global_vendor_id, vendor_name, catalog_item_id, project_label, brand, gross_price, price_text, source_doc, status, notes) VALUES (
    v_org,
    (SELECT id FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Life Fitness' LIMIT 1),
    'Life Fitness',
    (SELECT id FROM public.catalog_items WHERE org_id=v_org AND canonical_name='Fitness Equipment' LIMIT 1),
    'Intech TPS [169]', 'TownePlace Suites', 52712.54, '$52,712.54 total', 'TPS-Life fitness quote 3-27-26.pdf', 'Proposal', NULL);
  INSERT INTO public.vendor_pricing (org_id, global_vendor_id, vendor_name, catalog_item_id, project_label, brand, gross_price, price_text, source_doc, status, notes) VALUES (
    v_org,
    (SELECT id FROM public.global_vendors WHERE org_id=v_org AND vendor_name='C&T Design' LIMIT 1),
    'C&T Design',
    (SELECT id FROM public.catalog_items WHERE org_id=v_org AND canonical_name='Kitchen/Breakroom Equipment' LIMIT 1),
    'Intech TPS [169]', 'TownePlace Suites', 62933.4, '$62,933.40 (selected vendor)', '169_Kitchen Equipment_Price Comparison', 'Awarded', 'Beat Wasserstrom/Webstaurant/Katom/Hoshizaki on full package');
  INSERT INTO public.vendor_pricing (org_id, global_vendor_id, vendor_name, catalog_item_id, project_label, brand, gross_price, price_text, source_doc, status, notes) VALUES (
    v_org,
    (SELECT id FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Architectural Brass Co' LIMIT 1),
    'Architectural Brass Co',
    (SELECT id FROM public.catalog_items WHERE org_id=v_org AND canonical_name='Trash Cans' LIMIT 1),
    'Intech TPS [169]', 'TownePlace Suites', 980.0, '$980.00 for 2 (~$490/ea)', '169_Marriott_03.09.2026 TPS Indy NW FFE Quote.pdf', 'Comparison', NULL);
  INSERT INTO public.vendor_pricing (org_id, global_vendor_id, vendor_name, catalog_item_id, project_label, brand, gross_price, price_text, source_doc, status, notes) VALUES (
    v_org,
    (SELECT id FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Monster Tree Service' LIMIT 1),
    'Monster Tree Service',
    (SELECT id FROM public.catalog_items WHERE org_id=v_org AND canonical_name='Tree Removal' LIMIT 1),
    'Intech TPS [169]', 'TownePlace Suites', 40320.0, '$40,320.00', '169_Monster Tree Service_2486_20241118.pdf', 'Proposal', NULL);
  INSERT INTO public.vendor_pricing (org_id, global_vendor_id, vendor_name, catalog_item_id, project_label, brand, gross_price, price_text, source_doc, status, notes) VALUES (
    v_org,
    (SELECT id FROM public.global_vendors WHERE org_id=v_org AND vendor_name='Liberty Mutual Insurance (via Insurance Associates)' LIMIT 1),
    'Liberty Mutual Insurance (via Insurance Associates)',
    (SELECT id FROM public.catalog_items WHERE org_id=v_org AND canonical_name='Builders Risk Insurance' LIMIT 1),
    'Intech TPS [169]', 'TownePlace Suites', 58810.0, '$58,810.00 premium', '169_Liberty Mutual-Builders Risk_20251014.pdf', 'Proposal', 'Not a construction vendor; insurance-cost tracking');
END $$;
