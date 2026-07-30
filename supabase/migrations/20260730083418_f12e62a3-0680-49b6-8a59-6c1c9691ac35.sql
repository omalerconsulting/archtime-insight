ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS manually_edited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS original_clock_in time,
  ADD COLUMN IF NOT EXISTS original_clock_out time,
  ADD COLUMN IF NOT EXISTS original_break_minutes integer;