-- Privacy-friendly visit counting for the Owner Portal overview.
-- No cookies and no IP addresses are stored. A visitor is a one-way hash of (IP, browser) that changes every day,
-- so the same person cannot be followed from one day to the next. The nightly maintenance job rolls each finished
-- day into platform_daily_stats and deletes the hashes.
CREATE TABLE IF NOT EXISTS platform_visit_days (
  day TEXT NOT NULL,
  visitor TEXT NOT NULL,
  PRIMARY KEY (day, visitor)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS platform_page_views (
  day TEXT NOT NULL,
  page TEXT NOT NULL CHECK (page IN ('home','editor','games','account','other')),
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, page)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS platform_daily_stats (
  day TEXT PRIMARY KEY,
  visitors INTEGER NOT NULL DEFAULT 0,
  page_views INTEGER NOT NULL DEFAULT 0,
  editor_opens INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;
