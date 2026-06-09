-- ============================================================================
-- In-app notifications (per-user). Backs the notification bell for invoice
-- approval events (and is general-purpose for future use).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,                -- recipient (auth user)
  type        text NOT NULL DEFAULT 'invoice',
  title       text NOT NULL,
  body        text,
  link        text,                         -- e.g. '/invoices'
  invoice_id  uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
  is_read     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON public.notifications(user_id, is_read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Recipients read and update (mark read) only their own notifications.
CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Any authenticated user may create a notification for another user (e.g. an
-- approver notifying the submitter and other approvers of a decision).
CREATE POLICY "Authenticated can create notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

-- Live updates for the bell.
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
