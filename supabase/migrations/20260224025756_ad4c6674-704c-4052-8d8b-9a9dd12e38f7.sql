
-- Allow authenticated users to INSERT into room_type_line_items
CREATE POLICY "Authenticated users can insert room_type_line_items"
ON public.room_type_line_items
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to UPDATE room_type_line_items
CREATE POLICY "Authenticated users can update room_type_line_items"
ON public.room_type_line_items
FOR UPDATE
TO authenticated
USING (true);

-- Allow authenticated users to DELETE from room_type_line_items
CREATE POLICY "Authenticated users can delete room_type_line_items"
ON public.room_type_line_items
FOR DELETE
TO authenticated
USING (true);

-- Allow authenticated users to INSERT into bathroom_type_line_items
CREATE POLICY "Authenticated users can insert bathroom_type_line_items"
ON public.bathroom_type_line_items
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to UPDATE bathroom_type_line_items
CREATE POLICY "Authenticated users can update bathroom_type_line_items"
ON public.bathroom_type_line_items
FOR UPDATE
TO authenticated
USING (true);

-- Allow authenticated users to DELETE from bathroom_type_line_items
CREATE POLICY "Authenticated users can delete bathroom_type_line_items"
ON public.bathroom_type_line_items
FOR DELETE
TO authenticated
USING (true);
