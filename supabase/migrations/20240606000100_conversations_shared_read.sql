-- FK conversations.user_id → profiles.id (pour le join PostgREST)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_conversations_profiles'
      AND table_name = 'conversations'
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT fk_conversations_profiles
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Conversations : lisibles par tous les users authentifiés
-- (sauf masquées, sauf pour super_admin qui voit tout)
DROP POLICY IF EXISTS "conversations_read_all"     ON conversations;
DROP POLICY IF EXISTS "Users can view own conversations" ON conversations;
DROP POLICY IF EXISTS "Enable read access for users based on user_id" ON conversations;

CREATE POLICY "conversations_read_all" ON conversations
  FOR SELECT TO authenticated USING (
    is_hidden = false
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- Messages : lisibles si la conversation est accessible
DROP POLICY IF EXISTS "messages_read_all" ON messages;
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Enable read access for messages" ON messages;

CREATE POLICY "messages_read_all" ON messages
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
      AND (
        c.is_hidden = false
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
      )
    )
  );
