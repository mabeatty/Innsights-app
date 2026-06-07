
-- Add INSERT, UPDATE, DELETE policies for public_area_type_line_items
CREATE POLICY "Authenticated users can insert public_area_type_line_items"
ON public.public_area_type_line_items
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update public_area_type_line_items"
ON public.public_area_type_line_items
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete public_area_type_line_items"
ON public.public_area_type_line_items
FOR DELETE
TO authenticated
USING (true);
