
-- Add logo_url column to brands
ALTER TABLE public.brands ADD COLUMN logo_url text;

-- Create storage bucket for brand logos
INSERT INTO storage.buckets (id, name, public) VALUES ('brand-logos', 'brand-logos', true);

-- Allow anyone authenticated to read brand logos
CREATE POLICY "Brand logos are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'brand-logos');

-- Allow authenticated users to upload brand logos
CREATE POLICY "Authenticated users can upload brand logos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'brand-logos' AND auth.role() = 'authenticated');

-- Allow authenticated users to update brand logos
CREATE POLICY "Authenticated users can update brand logos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'brand-logos' AND auth.role() = 'authenticated');

-- Allow authenticated users to delete brand logos
CREATE POLICY "Authenticated users can delete brand logos"
ON storage.objects FOR DELETE
USING (bucket_id = 'brand-logos' AND auth.role() = 'authenticated');

-- Allow authenticated users to update brands (for logo_url)
CREATE POLICY "Authenticated users can update brands"
ON public.brands FOR UPDATE
USING (auth.role() = 'authenticated');
