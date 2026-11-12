-- The entity graph: people, teams, companies, projects and systems that Kivi's memories are
-- about, resolved across spellings ("Rahul", "Rahul Iyer"), and the relations between them.
-- Every link is derived from exactly one memory and carries its id, so an edge can always be
-- traced to a memory and from there to the words that produced it. Derived and rebuildable:
-- `npm run graph` replaces it wholesale.

CREATE TABLE IF NOT EXISTS graph_entities (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  summary      TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_graph_entities_user ON graph_entities(user_id);

CREATE TABLE IF NOT EXISTS graph_links (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  memory_id    TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  subject_id   TEXT NOT NULL REFERENCES graph_entities(id) ON DELETE CASCADE,
  predicate    TEXT NOT NULL,
  object_id    TEXT REFERENCES graph_entities(id) ON DELETE CASCADE,
  object_value TEXT
);
CREATE INDEX IF NOT EXISTS idx_graph_links_subject ON graph_links(subject_id);
CREATE INDEX IF NOT EXISTS idx_graph_links_object ON graph_links(object_id);
CREATE INDEX IF NOT EXISTS idx_graph_links_memory ON graph_links(memory_id);

CREATE TABLE IF NOT EXISTS graph_builds (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL,
  model        TEXT,
  memories     INTEGER,
  entities     INTEGER,
  links        INTEGER,
  cost_usd     REAL,
  built_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
