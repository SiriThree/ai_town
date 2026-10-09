-- Run with psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres only after approval.
-- Fails on existing roles/database; never take ownership of an unknown existing DB.
CREATE ROLE town_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE town_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE DATABASE ai_town_mvp OWNER town_owner;
REVOKE ALL ON DATABASE ai_town_mvp FROM PUBLIC;
GRANT CONNECT ON DATABASE ai_town_mvp TO town_app;
\connect ai_town_mvp
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO town_owner;
GRANT USAGE ON SCHEMA public TO town_app;
-- Enter the runtime password interactively with: \password town_app
-- Never put a password in this file, command arguments or psql history.
