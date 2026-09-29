-- Which editor version each AI-linked tab runs. Tabs opened before an engine update keep old code
-- until they are refreshed; the AI connector uses this to tell the AI (and the user) to refresh
-- instead of failing with confusing "unsupported" errors.
ALTER TABLE platform_ai_editor_links ADD COLUMN editor_protocol INTEGER NOT NULL DEFAULT 0;
