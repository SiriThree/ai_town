-- Additive migration only; never resets worlds or private chats.
CREATE TABLE IF NOT EXISTS town_notice_owners (
 id uuid PRIMARY KEY,
 world_id text NOT NULL REFERENCES town_worlds(id),
 visitor_id text NOT NULL,
 request_id uuid NOT NULL,
 request jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(world_id,visitor_id,request_id)
);
CREATE INDEX IF NOT EXISTS town_notice_owner_world ON town_notice_owners(world_id,visitor_id,created_at DESC);
CREATE TABLE IF NOT EXISTS town_gathering_visits (
 id uuid PRIMARY KEY,
 notice_id uuid NOT NULL REFERENCES town_notice_owners(id),
 visitor_id text NOT NULL,
 npc_id text NOT NULL,
 minute integer NOT NULL,
 UNIQUE(notice_id,visitor_id,npc_id)
);
