-- Create a private storage bucket for templates
INSERT INTO storage.buckets (id, name, public)
VALUES ('templates', 'templates', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to read from templates bucket (needed by edge function using service role, but also useful)
CREATE POLICY "Authenticated users can read templates"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'templates');

-- Allow service role full access (edge functions use service role key)
CREATE POLICY "Service role can manage templates"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'templates')
WITH CHECK (bucket_id = 'templates');