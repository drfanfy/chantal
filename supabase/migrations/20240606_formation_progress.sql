CREATE TABLE IF NOT EXISTS formation_progress (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES profiles(id)           ON DELETE CASCADE,
  chapter_id UUID        NOT NULL REFERENCES formation_chapters(id) ON DELETE CASCADE,
  read_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, chapter_id)
);

ALTER TABLE formation_progress ENABLE ROW LEVEL SECURITY;

-- Chaque utilisateur ne voit et ne modifie que sa propre progression
CREATE POLICY "formation_progress_own" ON formation_progress
  FOR ALL TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
