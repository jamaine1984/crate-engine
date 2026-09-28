PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS platform_games (
 id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, developer_id TEXT NOT NULL REFERENCES platform_users(id),
 title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', short_description TEXT NOT NULL DEFAULT '',
 kind TEXT NOT NULL CHECK(kind IN ('web','download','both')),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','uploading','processing','validation_failed','ready_for_submission','submitted','under_review','changes_requested','approved','published','suspended','rejected','removed')),
 genres_json TEXT NOT NULL DEFAULT '[]', tags_json TEXT NOT NULL DEFAULT '[]', metadata_json TEXT NOT NULL DEFAULT '{}',
 cover_url TEXT, hero_url TEXT, featured INTEGER NOT NULL DEFAULT 0 CHECK(featured IN (0,1)),
 price_minor INTEGER CHECK(price_minor IS NULL OR price_minor>=0), currency TEXT NOT NULL DEFAULT 'USD',
 active_version_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, published_at INTEGER
);
CREATE INDEX IF NOT EXISTS platform_games_catalog ON platform_games(status,featured,published_at DESC);
CREATE INDEX IF NOT EXISTS platform_games_developer ON platform_games(developer_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS platform_game_members (game_id TEXT NOT NULL REFERENCES platform_games(id),user_id TEXT NOT NULL REFERENCES platform_users(id),permission TEXT NOT NULL CHECK(permission IN ('edit','analytics')),created_at INTEGER NOT NULL,PRIMARY KEY(game_id,user_id));
CREATE TABLE IF NOT EXISTS platform_game_versions (
 id TEXT PRIMARY KEY,game_id TEXT NOT NULL REFERENCES platform_games(id),version TEXT NOT NULL,platform TEXT NOT NULL CHECK(platform IN ('web','windows','macos','linux')),
 upload_id TEXT, release_notes TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'quarantined' CHECK(status IN ('quarantined','processing','validation_failed','scan_pending','ready','published','suspended')),
 checksum TEXT, file_size INTEGER, manifest_json TEXT, scan_status TEXT NOT NULL DEFAULT 'pending' CHECK(scan_status IN ('pending','clean','infected','failed')),
 scan_reference TEXT, uploaded_by TEXT NOT NULL REFERENCES platform_users(id),created_at INTEGER NOT NULL,UNIQUE(game_id,version,platform)
);
CREATE TABLE IF NOT EXISTS platform_uploads (
 id TEXT PRIMARY KEY,game_id TEXT NOT NULL REFERENCES platform_games(id),user_id TEXT NOT NULL REFERENCES platform_users(id),version_id TEXT NOT NULL REFERENCES platform_game_versions(id),
 object_key TEXT NOT NULL UNIQUE,upload_id TEXT NOT NULL,file_name TEXT NOT NULL,size_bytes INTEGER NOT NULL CHECK(size_bytes>0),
 status TEXT NOT NULL CHECK(status IN ('uploading','quarantined','processing','validation_failed','scan_pending','ready','aborted')),
 created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,checksum TEXT,validation_json TEXT
);
CREATE TABLE IF NOT EXISTS platform_upload_parts (upload_id TEXT NOT NULL REFERENCES platform_uploads(id),part_number INTEGER NOT NULL,etag TEXT NOT NULL,size_bytes INTEGER NOT NULL,PRIMARY KEY(upload_id,part_number));
CREATE TABLE IF NOT EXISTS platform_reviews (id TEXT PRIMARY KEY,game_id TEXT NOT NULL REFERENCES platform_games(id),version_id TEXT,actor_id TEXT NOT NULL REFERENCES platform_users(id),decision TEXT NOT NULL,reason TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS platform_rights_declarations (id TEXT PRIMARY KEY,game_id TEXT NOT NULL REFERENCES platform_games(id),version_id TEXT NOT NULL REFERENCES platform_game_versions(id),user_id TEXT NOT NULL REFERENCES platform_users(id),policy_version TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(game_id,version_id));
CREATE TABLE IF NOT EXISTS platform_favorites (user_id TEXT NOT NULL REFERENCES platform_users(id),game_id TEXT NOT NULL REFERENCES platform_games(id),created_at INTEGER NOT NULL,PRIMARY KEY(user_id,game_id));
CREATE TABLE IF NOT EXISTS platform_library (user_id TEXT NOT NULL REFERENCES platform_users(id),game_id TEXT NOT NULL REFERENCES platform_games(id),source TEXT NOT NULL CHECK(source IN ('free_claim','verified_purchase')),created_at INTEGER NOT NULL,PRIMARY KEY(user_id,game_id));
CREATE TABLE IF NOT EXISTS platform_play_history (user_id TEXT NOT NULL REFERENCES platform_users(id),game_id TEXT NOT NULL REFERENCES platform_games(id),last_played_at INTEGER NOT NULL,play_count INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,game_id));
CREATE TABLE IF NOT EXISTS platform_game_sessions (id TEXT PRIMARY KEY,user_id TEXT REFERENCES platform_users(id),game_id TEXT NOT NULL REFERENCES platform_games(id),version_id TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,ended_at INTEGER);
CREATE TABLE IF NOT EXISTS platform_progress (user_id TEXT NOT NULL REFERENCES platform_users(id),game_id TEXT NOT NULL REFERENCES platform_games(id),data_json TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,updated_at INTEGER NOT NULL,PRIMARY KEY(user_id,game_id));
CREATE TABLE IF NOT EXISTS platform_notifications (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES platform_users(id),type TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,href TEXT,created_at INTEGER NOT NULL,read_at INTEGER);
CREATE INDEX IF NOT EXISTS platform_notifications_user ON platform_notifications(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS platform_preferences (user_id TEXT PRIMARY KEY REFERENCES platform_users(id),data_json TEXT NOT NULL DEFAULT '{}',updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS platform_projects (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES platform_users(id),name TEXT NOT NULL,project_json TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,deleted_at INTEGER);
CREATE INDEX IF NOT EXISTS platform_projects_user ON platform_projects(user_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS platform_waitlist (id TEXT PRIMARY KEY,user_id TEXT NOT NULL UNIQUE REFERENCES platform_users(id),email TEXT NOT NULL,source TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'waiting',created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS platform_reports (id TEXT PRIMARY KEY,game_id TEXT NOT NULL REFERENCES platform_games(id),user_id TEXT NOT NULL REFERENCES platform_users(id),category TEXT NOT NULL,detail TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS platform_wallet_transactions (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES platform_users(id),game_id TEXT REFERENCES platform_games(id),currency TEXT NOT NULL CHECK(currency IN ('points','credits','tokens')),amount INTEGER NOT NULL CHECK(amount!=0),type TEXT NOT NULL,reference_id TEXT NOT NULL,actor_id TEXT,reason TEXT,created_at INTEGER NOT NULL,UNIQUE(user_id,currency,type,reference_id));
CREATE INDEX IF NOT EXISTS platform_wallet_user ON platform_wallet_transactions(user_id,currency,created_at);
CREATE TRIGGER IF NOT EXISTS wallet_immutable_update BEFORE UPDATE ON platform_wallet_transactions BEGIN SELECT RAISE(ABORT,'wallet history is immutable'); END;
CREATE TRIGGER IF NOT EXISTS wallet_immutable_delete BEFORE DELETE ON platform_wallet_transactions BEGIN SELECT RAISE(ABORT,'wallet history is immutable'); END;
CREATE TABLE IF NOT EXISTS platform_agreements (id TEXT PRIMARY KEY,name TEXT NOT NULL,type TEXT NOT NULL CHECK(type IN ('platform_owned','creator_revenue_share','custom')),creator_id TEXT REFERENCES platform_users(id),created_by TEXT NOT NULL REFERENCES platform_users(id),created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS platform_agreement_versions (id TEXT PRIMARY KEY,agreement_id TEXT NOT NULL REFERENCES platform_agreements(id),version INTEGER NOT NULL CHECK(version>0),terms_json TEXT NOT NULL,minimum_payout_minor INTEGER NOT NULL DEFAULT 0 CHECK(minimum_payout_minor>=0),currency TEXT NOT NULL DEFAULT 'USD',payment_schedule TEXT NOT NULL DEFAULT 'not_active',public_notes TEXT NOT NULL DEFAULT '',internal_notes TEXT NOT NULL DEFAULT '',document_key TEXT,effective_at INTEGER NOT NULL,end_at INTEGER,created_by TEXT NOT NULL REFERENCES platform_users(id),created_at INTEGER NOT NULL,UNIQUE(agreement_id,version),CHECK(end_at IS NULL OR end_at>effective_at));
CREATE TRIGGER IF NOT EXISTS agreement_version_immutable_update BEFORE UPDATE ON platform_agreement_versions BEGIN SELECT RAISE(ABORT,'create a new agreement version'); END;
CREATE TRIGGER IF NOT EXISTS agreement_version_immutable_delete BEFORE DELETE ON platform_agreement_versions BEGIN SELECT RAISE(ABORT,'agreement history is immutable'); END;
CREATE TABLE IF NOT EXISTS platform_game_agreements (id TEXT PRIMARY KEY,game_id TEXT NOT NULL REFERENCES platform_games(id),version_id TEXT NOT NULL REFERENCES platform_agreement_versions(id),effective_at INTEGER NOT NULL,end_at INTEGER,created_by TEXT NOT NULL REFERENCES platform_users(id),created_at INTEGER NOT NULL,CHECK(end_at IS NULL OR end_at>effective_at));
CREATE TRIGGER IF NOT EXISTS game_agreement_no_overlap BEFORE INSERT ON platform_game_agreements WHEN EXISTS(SELECT 1 FROM platform_game_agreements a WHERE a.game_id=NEW.game_id AND a.effective_at<COALESCE(NEW.end_at,9223372036854775807) AND NEW.effective_at<COALESCE(a.end_at,9223372036854775807)) BEGIN SELECT RAISE(ABORT,'agreement effective periods overlap'); END;
CREATE TABLE IF NOT EXISTS platform_revenue_events (id TEXT PRIMARY KEY,game_id TEXT NOT NULL REFERENCES platform_games(id),creator_id TEXT REFERENCES platform_users(id),agreement_version_id TEXT NOT NULL REFERENCES platform_agreement_versions(id),provider TEXT NOT NULL,provider_reference TEXT NOT NULL,type TEXT NOT NULL,currency TEXT NOT NULL,gross_minor INTEGER NOT NULL,fees_minor INTEGER NOT NULL,eligible_minor INTEGER NOT NULL,creator_minor INTEGER NOT NULL,platform_minor INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN ('estimated','pending_provider_finalization','finalized','adjusted','reversed','refunded')),occurred_at INTEGER NOT NULL,created_at INTEGER NOT NULL,UNIQUE(provider,provider_reference),CHECK(gross_minor>=0 AND fees_minor>=0 AND eligible_minor>=0 AND creator_minor>=0 AND platform_minor>=0),CHECK(creator_minor+platform_minor=eligible_minor));
CREATE TRIGGER IF NOT EXISTS revenue_immutable_update BEFORE UPDATE ON platform_revenue_events BEGIN SELECT RAISE(ABORT,'revenue history is immutable; record an adjustment'); END;
CREATE TRIGGER IF NOT EXISTS revenue_immutable_delete BEFORE DELETE ON platform_revenue_events BEGIN SELECT RAISE(ABORT,'revenue history is immutable'); END;
CREATE TABLE IF NOT EXISTS platform_revenue_adjustments (id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES platform_revenue_events(id),provider_reference TEXT NOT NULL UNIQUE,creator_delta_minor INTEGER NOT NULL,platform_delta_minor INTEGER NOT NULL,reason TEXT NOT NULL,actor_id TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS platform_creator_obligations (id TEXT PRIMARY KEY,event_id TEXT NOT NULL UNIQUE REFERENCES platform_revenue_events(id),creator_id TEXT NOT NULL REFERENCES platform_users(id),amount_minor INTEGER NOT NULL CHECK(amount_minor>=0),currency TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('estimated','pending','finalized','held','eligible','included_in_payout','paid','reversed')),created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS platform_purchases (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES platform_users(id),provider_reference TEXT NOT NULL UNIQUE,status TEXT NOT NULL,currency TEXT NOT NULL,total_minor INTEGER NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS platform_licenses (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES platform_users(id),game_id TEXT NOT NULL REFERENCES platform_games(id),purchase_id TEXT NOT NULL REFERENCES platform_purchases(id),status TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(user_id,game_id,purchase_id));
CREATE TABLE IF NOT EXISTS platform_download_authorizations (id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,user_id TEXT NOT NULL REFERENCES platform_users(id),license_id TEXT NOT NULL REFERENCES platform_licenses(id),version_id TEXT NOT NULL REFERENCES platform_game_versions(id),expires_at INTEGER NOT NULL,used_at INTEGER,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS platform_usage_thresholds (key TEXT PRIMARY KEY,limit_value INTEGER NOT NULL CHECK(limit_value>0),unit TEXT NOT NULL,updated_by TEXT NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS platform_settings (key TEXT PRIMARY KEY,value_json TEXT NOT NULL,updated_by TEXT,updated_at INTEGER NOT NULL);
INSERT OR IGNORE INTO platform_feature_flags(key,enabled,updated_at) VALUES
 ('PUBLIC_REGISTRATION_ENABLED',0,0),('PUBLIC_CREATOR_UPLOADS_ENABLED',0,0),('CREATOR_WAITLIST_ENABLED',1,0),
 ('PUBLIC_CREATOR_PUBLISHING_ENABLED',0,0),('PREMIUM_SALES_ENABLED',0,0),('PAYMENTS_ENABLED',0,0),('STRIPE_ENABLED',0,0),
 ('GOOGLE_ADS_ENABLED',0,0),('H5_GAME_ADS_ENABLED',0,0),('REWARDED_ADS_ENABLED',0,0),('INTERSTITIAL_ADS_ENABLED',0,0),('CREATOR_PAYOUTS_ENABLED',0,0),
 ('ENGINE_AI_ENABLED',0,0),('ENGINE_PUBLISHING_ENABLED',0,0),('PREMIUM_DOWNLOADS_ENABLED',0,0),('MAINTENANCE_MODE',0,0);
