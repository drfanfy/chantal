-- FK : tickets.user_id → profiles.id
ALTER TABLE tickets
  ADD CONSTRAINT fk_tickets_profiles
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- FK : ticket_messages.user_id → profiles.id
ALTER TABLE ticket_messages
  ADD CONSTRAINT fk_ticket_messages_profiles
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
