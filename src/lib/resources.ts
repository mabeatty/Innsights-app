import { supabase } from "@/integrations/supabase/client";

// Categories mirror the folders shown in the Resources tab (ProjectDocuments).
export const RESOURCE_FOLDERS = ["Drawings", "Permits", "Contracts", "Other"] as const;
export type ResourceFolder = (typeof RESOURCE_FOLDERS)[number];

export interface PushToResourcesArgs {
  projectId: string;
  folder: ResourceFolder;
  documentName: string;
  url: string;
  addedBy: string;
}

/**
 * Insert a document reference into the Resources tab (project_documents).
 * Reusable across features (contracts today; permit tracker, etc. later) so
 * every surface that "pushes to Resources" stays consistent.
 */
export async function pushToResources({
  projectId,
  folder,
  documentName,
  url,
  addedBy,
}: PushToResourcesArgs): Promise<void> {
  const { error } = await supabase.from("project_documents").insert({
    project_id: projectId,
    folder_name: folder,
    document_name: documentName,
    drive_url: url,
    added_by: addedBy,
  });
  if (error) throw error;
}
