-- CreateTable
CREATE TABLE "marketplaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "health_status" TEXT NOT NULL DEFAULT 'unknown',
    "last_health_check_at" TIMESTAMP(3),
    "response_time_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL,
    "hermes_integration_id" TEXT NOT NULL,
    "cliente_name" TEXT,
    "cliente_domain" TEXT NOT NULL,
    "marketplace_id" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'active',
    "ajustes_default" TEXT,
    "hermes_api_url" TEXT,
    "hermes_token" TEXT,
    "hermes_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_credentials" (
    "id" TEXT NOT NULL,
    "integration_id" TEXT NOT NULL,
    "credentials_encrypted" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "user_id" TEXT,
    "expires_at" TIMESTAMP(3),
    "token_last_refreshed_at" TIMESTAMP(3),
    "oauth_state" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_rules" (
    "id" TEXT NOT NULL,
    "integration_id" TEXT NOT NULL,
    "rule_key" TEXT NOT NULL,
    "rule_json" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "rule_type" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "integration_id" TEXT NOT NULL,
    "marketplace_id" TEXT NOT NULL,
    "source_order_id" TEXT NOT NULL,
    "payload_normalized" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "flag_reason" TEXT,
    "hermes_order_id" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL,
    "integration_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "resultado" TEXT NOT NULL,
    "response_data" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_jobs" (
    "id" TEXT NOT NULL,
    "integration_id" TEXT NOT NULL,
    "job_type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "last_error" TEXT,
    "scheduled_for" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "marketplaces_name_key" ON "marketplaces"("name");

-- CreateIndex
CREATE INDEX "integrations_cliente_name_idx" ON "integrations"("cliente_name");

-- CreateIndex
CREATE INDEX "integrations_cliente_domain_idx" ON "integrations"("cliente_domain");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_cliente_domain_hermes_integration_id_key" ON "integrations"("cliente_domain", "hermes_integration_id");

-- CreateIndex
CREATE INDEX "integration_credentials_user_id_idx" ON "integration_credentials"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_rules_integration_id_rule_key_rule_type_key" ON "integration_rules"("integration_id", "rule_key", "rule_type");

-- CreateIndex
CREATE INDEX "orders_integration_id_status_idx" ON "orders"("integration_id", "status");

-- CreateIndex
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_marketplace_id_source_order_id_key" ON "orders"("marketplace_id", "source_order_id");

-- CreateIndex
CREATE INDEX "sync_logs_integration_id_tipo_idx" ON "sync_logs"("integration_id", "tipo");

-- CreateIndex
CREATE INDEX "sync_logs_created_at_idx" ON "sync_logs"("created_at");

-- CreateIndex
CREATE INDEX "sync_jobs_integration_id_job_type_idx" ON "sync_jobs"("integration_id", "job_type");

-- CreateIndex
CREATE INDEX "sync_jobs_status_scheduled_for_idx" ON "sync_jobs"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "sync_jobs_created_at_idx" ON "sync_jobs"("created_at");

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_marketplace_id_fkey" FOREIGN KEY ("marketplace_id") REFERENCES "marketplaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_rules" ADD CONSTRAINT "integration_rules_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_marketplace_id_fkey" FOREIGN KEY ("marketplace_id") REFERENCES "marketplaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
