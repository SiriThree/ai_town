-- Run in the new production DB as postgres AFTER explicit init-db and seed-world.
-- Only this named project's tables. Leaves legacy shared chats inaccessible to runtime.
ALTER TABLE town_worlds OWNER TO town_owner;
ALTER TABLE town_chats OWNER TO town_owner;
ALTER TABLE town_chat_limits OWNER TO town_owner;
ALTER TABLE town_private_chats OWNER TO town_owner;
ALTER TABLE town_invitations OWNER TO town_owner;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON town_chats FROM town_app;
GRANT SELECT, UPDATE ON town_worlds TO town_app;
GRANT SELECT, INSERT, UPDATE ON town_chat_limits, town_private_chats TO town_app;
GRANT SELECT, INSERT, UPDATE ON town_invitations TO town_app;
