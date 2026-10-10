CREATE TABLE IF NOT EXISTS town_worlds (
    id text PRIMARY KEY, revision integer NOT NULL CHECK (revision >= 0),
    payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
  );

-- Applied below after the private table exists; no world or chat reset.

CREATE TABLE IF NOT EXISTS town_chats (
    world_id text NOT NULL REFERENCES town_worlds(id), npc_id text NOT NULL,
    turns jsonb NOT NULL DEFAULT '[]', PRIMARY KEY(world_id, npc_id),
    CHECK (jsonb_typeof(turns) = 'array' AND jsonb_array_length(turns) <= 20)
  );

CREATE TABLE IF NOT EXISTS town_chat_limits (
    world_id text NOT NULL REFERENCES town_worlds(id), kind text NOT NULL CHECK (kind IN ('request','model')),
    bucket bigint NOT NULL, used integer NOT NULL CHECK (used > 0), PRIMARY KEY(world_id,kind)
  );

CREATE TABLE IF NOT EXISTS town_private_chats (
    world_id text NOT NULL REFERENCES town_worlds(id), npc_id text NOT NULL,
    visitor_id text NOT NULL CHECK (visitor_id ~ '^[a-f0-9]{64}$'), turns jsonb NOT NULL DEFAULT '[]',
    updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(world_id,npc_id,visitor_id),
    CHECK (jsonb_typeof(turns) = 'array' AND jsonb_array_length(turns) <= 20)
  );

ALTER TABLE town_private_chats ADD COLUMN IF NOT EXISTS player_memory jsonb;

CREATE TABLE IF NOT EXISTS town_invitations (
  world_id text NOT NULL REFERENCES town_worlds(id), npc_id text NOT NULL,
  visitor_id text NOT NULL CHECK(visitor_id ~ '^[a-f0-9]{64}$'),
  request_id uuid NOT NULL, id uuid NOT NULL UNIQUE, payload jsonb NOT NULL,
  response jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(world_id,npc_id,visitor_id,request_id)
);

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
