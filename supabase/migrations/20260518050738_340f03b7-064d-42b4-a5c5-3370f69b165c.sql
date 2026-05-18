-- Beta: default new accounts to pro
ALTER TABLE public.profiles ALTER COLUMN plan SET DEFAULT 'pro';

-- Feedback read status
ALTER TABLE public.feedbacks ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false;

-- Enable realtime for feedbacks
ALTER TABLE public.feedbacks REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'feedbacks'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.feedbacks';
  END IF;
END$$;