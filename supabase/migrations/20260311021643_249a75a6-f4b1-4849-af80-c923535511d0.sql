
-- Allow authenticated users to insert brands
CREATE POLICY "Authenticated users can insert brands"
ON public.brands
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to delete brands
CREATE POLICY "Authenticated users can delete brands"
ON public.brands
FOR DELETE
TO authenticated
USING (true);
