-- Link a delivery/rental to the critical-path task it supports, so the
-- Logistics tab can flag when a delivery/pickup date threatens that task's
-- window.
ALTER TABLE public.vendor_deliveries
  ADD COLUMN critical_path_task_id uuid REFERENCES public.critical_path_tasks(id) ON DELETE SET NULL;
