-- Migration: 20260916_rest_and_webhooks
-- Implements tables and RLS policies for INK-25 REST APIs and INK-26 Webhooks (INK-146 to INK-165)

-- 1. API Client Bindings
CREATE TABLE IF NOT EXISTS "api_client_bindings" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL REFERENCES "organisations"("id") ON DELETE CASCADE,
    "issuer" VARCHAR(255) NOT NULL,
    "client_id" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" VARCHAR(500),
    "scopes" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "acting_user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "api_client_bindings_org_issuer_client_uniq" UNIQUE ("organisation_id", "issuer", "client_id")
);
CREATE INDEX IF NOT EXISTS "idx_api_client_bindings_org" ON "api_client_bindings"("organisation_id");
CREATE INDEX IF NOT EXISTS "idx_api_client_bindings_client" ON "api_client_bindings"("client_id");

-- 2. Refresh Sessions
CREATE TABLE IF NOT EXISTS "refresh_sessions" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL REFERENCES "organisations"("id") ON DELETE CASCADE,
    "user_id" UUID REFERENCES "users"("id") ON DELETE CASCADE,
    "client_binding_id" UUID,
    "token_hash" VARCHAR(128) NOT NULL UNIQUE,
    "family_id" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "consumed_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "replacement_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "idx_refresh_sessions_org" ON "refresh_sessions"("organisation_id");
CREATE INDEX IF NOT EXISTS "idx_refresh_sessions_family" ON "refresh_sessions"("family_id");
CREATE INDEX IF NOT EXISTS "idx_refresh_sessions_user" ON "refresh_sessions"("user_id");

-- 3. Revoked Access Tokens
CREATE TABLE IF NOT EXISTS "revoked_access_tokens" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "jti" VARCHAR(255) NOT NULL UNIQUE,
    "issuer" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "idx_revoked_access_tokens_expiry" ON "revoked_access_tokens"("expires_at");

-- 4. Idempotency Records
CREATE TABLE IF NOT EXISTS "idempotency_records" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL REFERENCES "organisations"("id") ON DELETE CASCADE,
    "principal_id" VARCHAR(255) NOT NULL,
    "operation" VARCHAR(100) NOT NULL,
    "key_hash" VARCHAR(128) NOT NULL,
    "request_hash" VARCHAR(128) NOT NULL,
    "state" VARCHAR(20) NOT NULL, -- IN_PROGRESS | COMPLETED | FAILED
    "lease_until" TIMESTAMPTZ NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "resource_id" VARCHAR(255),
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "idempotency_records_org_principal_op_key_uniq" UNIQUE ("organisation_id", "principal_id", "operation", "key_hash")
);
CREATE INDEX IF NOT EXISTS "idx_idempotency_records_org" ON "idempotency_records"("organisation_id");
CREATE INDEX IF NOT EXISTS "idx_idempotency_records_expiry" ON "idempotency_records"("expires_at");

-- 5. API Rate Limit Policies & State
CREATE TABLE IF NOT EXISTS "api_rate_limit_policies" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "organisation_id" UUID REFERENCES "organisations"("id") ON DELETE CASCADE,
    "route_template" VARCHAR(255) NOT NULL,
    "role" VARCHAR(50),
    "principal_id" VARCHAR(255),
    "ip_address" VARCHAR(45),
    "limit" INTEGER NOT NULL,
    "window_seconds" INTEGER NOT NULL,
    "is_whitelist" BOOLEAN NOT NULL DEFAULT false,
    "description" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "idx_api_rate_limit_policies_org" ON "api_rate_limit_policies"("organisation_id");
CREATE INDEX IF NOT EXISTS "idx_api_rate_limit_policies_route" ON "api_rate_limit_policies"("route_template");
CREATE INDEX IF NOT EXISTS "idx_api_rate_limit_policies_principal" ON "api_rate_limit_policies"("principal_id");
CREATE INDEX IF NOT EXISTS "idx_api_rate_limit_policies_ip" ON "api_rate_limit_policies"("ip_address");

CREATE TABLE IF NOT EXISTS "rate_limit_states" (
    "key" VARCHAR(255) PRIMARY KEY,
    "tokens" DOUBLE PRECISION NOT NULL,
    "last_refill_at" TIMESTAMPTZ NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_rate_limit_states_expiry" ON "rate_limit_states"("expires_at");

-- 6. API Request Logs
CREATE TABLE IF NOT EXISTS "api_request_logs" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "organisation_id" UUID REFERENCES "organisations"("id") ON DELETE CASCADE,
    "principal_id" VARCHAR(255),
    "request_id" VARCHAR(255) NOT NULL,
    "route_template" VARCHAR(255) NOT NULL,
    "method" VARCHAR(10) NOT NULL,
    "status_code" INTEGER NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "request_summary" JSONB,
    "response_summary" JSONB,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(512),
    "error_message" VARCHAR(1000),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_api_request_logs_org_created" ON "api_request_logs"("organisation_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_api_request_logs_request" ON "api_request_logs"("request_id");
CREATE INDEX IF NOT EXISTS "idx_api_request_logs_route" ON "api_request_logs"("route_template");
CREATE INDEX IF NOT EXISTS "idx_api_request_logs_status" ON "api_request_logs"("status_code");
CREATE INDEX IF NOT EXISTS "idx_api_request_logs_expiry" ON "api_request_logs"("expires_at");

-- 7. Webhook Subscriptions
CREATE TABLE IF NOT EXISTS "webhook_subscriptions" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL REFERENCES "organisations"("id") ON DELETE CASCADE,
    "owner_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "scope" VARCHAR(20) NOT NULL DEFAULT 'organisation',
    "name" VARCHAR(255) NOT NULL,
    "description" VARCHAR(500),
    "target_url" VARCHAR(1024) NOT NULL,
    "http_method" VARCHAR(10) NOT NULL DEFAULT 'POST',
    "event_types" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "payload_version" VARCHAR(10) NOT NULL DEFAULT '1.0',
    "encrypted_custom_headers" TEXT,
    "filter_rules" JSONB,
    "payload_projection" JSONB,
    "rate_limit_per_minute" INTEGER NOT NULL DEFAULT 10,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "config_revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS "idx_webhook_subscriptions_org_status" ON "webhook_subscriptions"("organisation_id", "status");
CREATE INDEX IF NOT EXISTS "idx_webhook_subscriptions_owner" ON "webhook_subscriptions"("owner_id");

-- 8. Webhook Signing Keys
CREATE TABLE IF NOT EXISTS "webhook_signing_keys" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL REFERENCES "organisations"("id") ON DELETE CASCADE,
    "subscription_id" UUID NOT NULL REFERENCES "webhook_subscriptions"("id") ON DELETE CASCADE,
    "key_id" VARCHAR(64) NOT NULL UNIQUE,
    "encrypted_secret" TEXT NOT NULL,
    "active_from" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retired_at" TIMESTAMPTZ,
    "grace_until" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "idx_webhook_signing_keys_sub" ON "webhook_signing_keys"("subscription_id");
CREATE INDEX IF NOT EXISTS "idx_webhook_signing_keys_org" ON "webhook_signing_keys"("organisation_id");

-- 9. Domain Events (Transactional Outbox)
CREATE TABLE IF NOT EXISTS "domain_events" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL REFERENCES "organisations"("id") ON DELETE CASCADE,
    "event_id" UUID NOT NULL UNIQUE,
    "event_type" VARCHAR(100) NOT NULL,
    "schema_version" VARCHAR(10) NOT NULL DEFAULT '1.0',
    "resource_type" VARCHAR(50) NOT NULL,
    "resource_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "actor_kind" VARCHAR(20) NOT NULL DEFAULT 'user',
    "actor_id" VARCHAR(255),
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_snapshot" JSONB NOT NULL,
    "dedupe_key" VARCHAR(255) NOT NULL,
    "dispatch_state" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "lease_until" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "domain_events_org_dedupe_uniq" UNIQUE ("organisation_id", "dedupe_key")
);
CREATE INDEX IF NOT EXISTS "idx_domain_events_org_dispatch" ON "domain_events"("organisation_id", "dispatch_state");
CREATE INDEX IF NOT EXISTS "idx_domain_events_occurred" ON "domain_events"("occurred_at");

-- 10. Webhook Deliveries
CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL REFERENCES "organisations"("id") ON DELETE CASCADE,
    "event_id" UUID NOT NULL REFERENCES "domain_events"("event_id") ON DELETE CASCADE,
    "subscription_id" UUID NOT NULL REFERENCES "webhook_subscriptions"("id") ON DELETE CASCADE,
    "replay_generation" INTEGER NOT NULL DEFAULT 1,
    "payload_bytes" TEXT NOT NULL,
    "payload_hash" VARCHAR(128) NOT NULL,
    "config_revision" INTEGER NOT NULL DEFAULT 1,
    "state" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ,
    "lease_until" TIMESTAMPTZ,
    "lease_version" INTEGER NOT NULL DEFAULT 1,
    "last_status_code" INTEGER,
    "last_error_category" VARCHAR(50),
    "last_error_message" VARCHAR(1000),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "webhook_deliveries_event_sub_gen_uniq" UNIQUE ("event_id", "subscription_id", "replay_generation")
);
CREATE INDEX IF NOT EXISTS "idx_webhook_deliveries_org_state_next" ON "webhook_deliveries"("organisation_id", "state", "next_attempt_at");
CREATE INDEX IF NOT EXISTS "idx_webhook_deliveries_sub" ON "webhook_deliveries"("subscription_id");

-- 11. Webhook Attempts
CREATE TABLE IF NOT EXISTS "webhook_attempts" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL REFERENCES "organisations"("id") ON DELETE CASCADE,
    "delivery_id" UUID NOT NULL REFERENCES "webhook_deliveries"("id") ON DELETE CASCADE,
    "attempt_number" INTEGER NOT NULL,
    "signing_key_id" VARCHAR(64),
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ,
    "duration_ms" INTEGER,
    "http_status" INTEGER,
    "error_category" VARCHAR(50),
    "response_snippet" VARCHAR(2000),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "webhook_attempts_delivery_num_uniq" UNIQUE ("delivery_id", "attempt_number")
);
CREATE INDEX IF NOT EXISTS "idx_webhook_attempts_org" ON "webhook_attempts"("organisation_id");

-- 12. Webhook Dead Letters
CREATE TABLE IF NOT EXISTS "webhook_dead_letters" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL REFERENCES "organisations"("id") ON DELETE CASCADE,
    "subscription_id" UUID NOT NULL REFERENCES "webhook_subscriptions"("id") ON DELETE CASCADE,
    "delivery_id" UUID NOT NULL UNIQUE REFERENCES "webhook_deliveries"("id") ON DELETE CASCADE,
    "reason" VARCHAR(500) NOT NULL,
    "final_attempt_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replayed_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "idx_webhook_dead_letters_org_exp" ON "webhook_dead_letters"("organisation_id", "expires_at");
CREATE INDEX IF NOT EXISTS "idx_webhook_dead_letters_sub" ON "webhook_dead_letters"("subscription_id");

-- 13. Webhook Metric Buckets
CREATE TABLE IF NOT EXISTS "webhook_metric_buckets" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL REFERENCES "organisations"("id") ON DELETE CASCADE,
    "subscription_id" UUID REFERENCES "webhook_subscriptions"("id") ON DELETE CASCADE,
    "time_bucket" TIMESTAMPTZ NOT NULL,
    "deliveries_count" INTEGER NOT NULL DEFAULT 0,
    "attempts_count" INTEGER NOT NULL DEFAULT 0,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "p50_duration_ms" INTEGER NOT NULL DEFAULT 0,
    "p95_duration_ms" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "webhook_metric_buckets_org_sub_bucket_uniq" UNIQUE ("organisation_id", "subscription_id", "time_bucket")
);
CREATE INDEX IF NOT EXISTS "idx_webhook_metric_buckets_org_time" ON "webhook_metric_buckets"("organisation_id", "time_bucket");

-- 14. Operational Alerts
CREATE TABLE IF NOT EXISTS "operational_alerts" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL REFERENCES "organisations"("id") ON DELETE CASCADE,
    "subscription_id" UUID REFERENCES "webhook_subscriptions"("id") ON DELETE CASCADE,
    "alert_type" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "message" VARCHAR(500) NOT NULL,
    "triggered_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "idx_operational_alerts_org_status" ON "operational_alerts"("organisation_id", "status");

-- Row Level Security (RLS) Policies
ALTER TABLE "api_client_bindings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refresh_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "idempotency_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_rate_limit_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_request_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_signing_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "domain_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_dead_letters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_metric_buckets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "operational_alerts" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    -- api_client_bindings
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_api_client_bindings') THEN
        CREATE POLICY tenant_isolation_api_client_bindings ON "api_client_bindings"
            FOR ALL
            USING (organisation_id IN (SELECT id FROM organisations WHERE tenant_id = current_setting('app.current_tenant', true)::uuid))
            WITH CHECK (organisation_id IN (SELECT id FROM organisations WHERE tenant_id = current_setting('app.current_tenant', true)::uuid));
    END IF;

    -- refresh_sessions
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_refresh_sessions') THEN
        CREATE POLICY tenant_isolation_refresh_sessions ON "refresh_sessions"
            FOR ALL
            USING (organisation_id IN (SELECT id FROM organisations WHERE tenant_id = current_setting('app.current_tenant', true)::uuid))
            WITH CHECK (organisation_id IN (SELECT id FROM organisations WHERE tenant_id = current_setting('app.current_tenant', true)::uuid));
    END IF;

    -- idempotency_records
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_idempotency_records') THEN
        CREATE POLICY tenant_isolation_idempotency_records ON "idempotency_records"
            FOR ALL
            USING (organisation_id IN (SELECT id FROM organisations WHERE tenant_id = current_setting('app.current_tenant', true)::uuid))
            WITH CHECK (organisation_id IN (SELECT id FROM organisations WHERE tenant_id = current_setting('app.current_tenant', true)::uuid));
    END IF;

    -- api_rate_limit_policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_api_rate_limit_policies') THEN
        CREATE POLICY tenant_isolation_api_rate_limit_policies ON "api_rate_limit_policies"
            FOR ALL
            USING (organisation_id IS NULL OR organisation_id IN (SELECT id FROM organisations WHERE tenant_id = current_setting('app.current_tenant', true)::uuid))
            WITH CHECK (organisation_id IS NULL OR organisation_id IN (SELECT id FROM organisations WHERE tenant_id = current_setting('app.current_tenant', true)::uuid));
    END IF;

    -- api_request_logs
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_api_request_logs') THEN
        CREATE POLICY tenant_isolation_api_request_logs ON "api_request_logs"
            FOR ALL
            USING (organisation_id IS NULL OR organisation_id IN (SELECT id FROM organisations WHERE tenant_id = current_setting('app.current_tenant', true)::uuid))
            WITH CHECK (organisation_id IS NULL OR organisation_id IN (SELECT id FROM organisations WHERE tenant_id = current_setting('app.current_tenant', true)::uuid));
    END IF;

    -- webhook_subscriptions
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_webhook_subscriptions') THEN
        CREATE POLICY tenant_isolation_webhook_subscriptions ON "webhook_subscriptions"
            FOR ALL
            USING (organisation_id IN (SELECT id FROM organisations WHERE tenant_id = current_setting('app.current_tenant', true)::uuid))
            WITH CHECK (organisation_id IN (SELECT id FROM organisations WHERE tenant_id = current_setting('app.current_tenant', true)::uuid));
    END IF;

    -- webhook_signing_keys
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_webhook_signing_keys') THEN
        CREATE POLICY tenant_isolation_webhook_signing_keys ON "webhook_signing_keys"
            FOR ALL
            USING (organisation_id IN (SELECT id FROM organisations WHERE tenant_id = current_setting('app.current_tenant', true)::uuid))
            WITH CHECK (organisation_id IN (SELECT id FROM organisations WHERE tenant_id = current_setting('app.current_tenant', true)::uuid));
    END IF;

    -- domain_events
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_domain_events') THEN
        CREATE POLICY tenant_isolation_domain_events ON "domain_events"
            FOR ALL
            USING (organisation_id IN (SELECT id FROM organisations WHERE tenant_id = current_setting('app.current_tenant', true)::uuid))
            WITH CHECK (organisation_id IN (SELECT id FROM organisations WHERE tenant_id = current_setting('app.current_tenant', true)::uuid));
    END IF;

    -- webhook_deliveries
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_webhook_deliveries') THEN
        CREATE POLICY tenant_isolation_webhook_deliveries ON "webhook_deliveries"
            FOR ALL
            USING (organisation_id IN (SELECT id FROM organisations WHERE tenant_id = current_setting('app.current_tenant', true)::uuid))
            WITH CHECK (organisation_id IN (SELECT id FROM organisations WHERE tenant_id = current_setting('app.current_tenant', true)::uuid));
    END IF;

    -- webhook_attempts
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_webhook_attempts') THEN
        CREATE POLICY tenant_isolation_webhook_attempts ON "webhook_attempts"
            FOR ALL
            USING (organisation_id IN (SELECT id FROM organisations WHERE tenant_id = current_setting('app.current_tenant', true)::uuid))
            WITH CHECK (organisation_id IN (SELECT id FROM organisations WHERE tenant_id = current_setting('app.current_tenant', true)::uuid));
    END IF;

    -- webhook_dead_letters
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_webhook_dead_letters') THEN
        CREATE POLICY tenant_isolation_webhook_dead_letters ON "webhook_dead_letters"
            FOR ALL
            USING (organisation_id IN (SELECT id FROM organisations WHERE tenant_id = current_setting('app.current_tenant', true)::uuid))
            WITH CHECK (organisation_id IN (SELECT id FROM organisations WHERE tenant_id = current_setting('app.current_tenant', true)::uuid));
    END IF;

    -- webhook_metric_buckets
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_webhook_metric_buckets') THEN
        CREATE POLICY tenant_isolation_webhook_metric_buckets ON "webhook_metric_buckets"
            FOR ALL
            USING (organisation_id IN (SELECT id FROM organisations WHERE tenant_id = current_setting('app.current_tenant', true)::uuid))
            WITH CHECK (organisation_id IN (SELECT id FROM organisations WHERE tenant_id = current_setting('app.current_tenant', true)::uuid));
    END IF;

    -- operational_alerts
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_operational_alerts') THEN
        CREATE POLICY tenant_isolation_operational_alerts ON "operational_alerts"
            FOR ALL
            USING (organisation_id IN (SELECT id FROM organisations WHERE tenant_id = current_setting('app.current_tenant', true)::uuid))
            WITH CHECK (organisation_id IN (SELECT id FROM organisations WHERE tenant_id = current_setting('app.current_tenant', true)::uuid));
    END IF;
END $$;
