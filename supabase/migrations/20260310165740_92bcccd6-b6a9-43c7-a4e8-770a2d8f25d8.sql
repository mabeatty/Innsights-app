UPDATE public.pre_development_budget SET sort_order = CASE line_item
  WHEN 'Earnest Money' THEN 0
  WHEN 'Title' THEN 1
  WHEN 'Survey' THEN 2
  WHEN 'Environmental' THEN 3
  WHEN 'Geotechnical' THEN 4
  WHEN 'Entitlements' THEN 5
  WHEN 'Architecture' THEN 6
  WHEN 'Civil Engineering' THEN 7
  WHEN 'Franchise Fees' THEN 8
  WHEN 'Legal' THEN 9
  WHEN 'Travel' THEN 10
  WHEN 'Miscellaneous' THEN 11
END
WHERE line_item IN ('Earnest Money','Title','Survey','Environmental','Geotechnical','Entitlements','Architecture','Civil Engineering','Franchise Fees','Legal','Travel','Miscellaneous');