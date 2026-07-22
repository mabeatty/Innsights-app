-- Contract document: a single linked/uploaded file per contract.
-- document_url  : external link (e.g. Drive) or storage public URL
-- document_name : display name
-- document_path : storage path when uploaded to the project-documents bucket (nullable for links)
ALTER TABLE public.contracts
  ADD COLUMN document_url text,
  ADD COLUMN document_name text,
  ADD COLUMN document_path text;
