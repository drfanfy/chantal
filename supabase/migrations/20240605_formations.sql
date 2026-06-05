-- Tables formations + formation_chapters
CREATE TABLE IF NOT EXISTS formations (
  id           TEXT        PRIMARY KEY,
  name         TEXT        NOT NULL,
  description  TEXT        NOT NULL DEFAULT '',
  icon         TEXT        NOT NULL DEFAULT '📚',
  intro        TEXT        NOT NULL DEFAULT '',
  sort_order   INT         NOT NULL DEFAULT 0,
  is_custom    BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS formation_chapters (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  formation_id  TEXT        NOT NULL REFERENCES formations(id) ON DELETE CASCADE,
  title         TEXT        NOT NULL,
  content       TEXT        NOT NULL DEFAULT '',
  sort_order    INT         NOT NULL DEFAULT 0
);

-- RLS
ALTER TABLE formations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE formation_chapters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "formations_read" ON formations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "formations_write" ON formations
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')
  ));

CREATE POLICY "formation_chapters_read" ON formation_chapters
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "formation_chapters_write" ON formation_chapters
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')
  ));
