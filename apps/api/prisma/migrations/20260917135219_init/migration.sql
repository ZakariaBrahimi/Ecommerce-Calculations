-- CreateEnum
CREATE TYPE "InternalDeliveryStatus" AS ENUM ('NEW', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'FAILED', 'RETURNED');

-- CreateEnum
CREATE TYPE "DeliveryConnectionStatus" AS ENUM ('active', 'invalid', 'revoked');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('ACTIVE', 'PAUSED', 'STOPPED');

-- CreateEnum
CREATE TYPE "MetaConnectionStatus" AS ENUM ('pending_ad_account', 'active', 'invalid', 'revoked');

-- CreateTable
CREATE TABLE "delivery_provider_connections" (
    "tenant_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encrypted_api_key" TEXT NOT NULL,
    "status" "DeliveryConnectionStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_provider_connections_pkey" PRIMARY KEY ("tenant_id","provider")
);

-- CreateTable
CREATE TABLE "delivery_orders" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "external_order_id" TEXT,
    "tracking_number" TEXT NOT NULL,
    "customer_name" TEXT,
    "customer_phone" TEXT,
    "address" TEXT,
    "commune" TEXT,
    "wilaya" TEXT,
    "delivery_fee" DECIMAL(14,4),
    "internal_status" "InternalDeliveryStatus" NOT NULL,
    "raw_status" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_status_events" (
    "id" TEXT NOT NULL,
    "delivery_order_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "internal_status" "InternalDeliveryStatus" NOT NULL,
    "raw_status" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_ad_account_connections" (
    "tenant_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'meta',
    "encrypted_access_token" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3) NOT NULL,
    "ad_account_id" TEXT,
    "currency" TEXT,
    "status" "MetaConnectionStatus" NOT NULL DEFAULT 'pending_ad_account',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_ad_account_connections_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'meta',
    "ad_account_id" TEXT NOT NULL,
    "external_campaign_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT,
    "status" "CampaignStatus" NOT NULL,
    "raw_status" TEXT NOT NULL,
    "daily_budget" DECIMAL(14,4),
    "currency" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_sets" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "external_ad_set_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL,
    "raw_status" TEXT NOT NULL,
    "daily_budget" DECIMAL(14,4),
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ads" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "ad_set_id" TEXT NOT NULL,
    "external_ad_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL,
    "raw_status" TEXT NOT NULL,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_spend" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "spend" DECIMAL(14,4) NOT NULL,
    "impressions" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "results" INTEGER NOT NULL,
    "result_type" TEXT,
    "cost_per_result" DECIMAL(14,4),
    "currency" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_spend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "delivery_provider_connections_provider_status_idx" ON "delivery_provider_connections"("provider", "status");

-- CreateIndex
CREATE INDEX "delivery_orders_tenant_id_internal_status_idx" ON "delivery_orders"("tenant_id", "internal_status");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_orders_tenant_id_tracking_number_key" ON "delivery_orders"("tenant_id", "tracking_number");

-- CreateIndex
CREATE INDEX "delivery_status_events_delivery_order_id_occurred_at_idx" ON "delivery_status_events"("delivery_order_id", "occurred_at");

-- CreateIndex
CREATE INDEX "meta_ad_account_connections_provider_status_idx" ON "meta_ad_account_connections"("provider", "status");

-- CreateIndex
CREATE INDEX "campaigns_tenant_id_status_idx" ON "campaigns"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_tenant_id_external_campaign_id_key" ON "campaigns"("tenant_id", "external_campaign_id");

-- CreateIndex
CREATE INDEX "ad_sets_tenant_id_campaign_id_idx" ON "ad_sets"("tenant_id", "campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "ad_sets_tenant_id_external_ad_set_id_key" ON "ad_sets"("tenant_id", "external_ad_set_id");

-- CreateIndex
CREATE INDEX "ads_tenant_id_ad_set_id_idx" ON "ads"("tenant_id", "ad_set_id");

-- CreateIndex
CREATE UNIQUE INDEX "ads_tenant_id_external_ad_id_key" ON "ads"("tenant_id", "external_ad_id");

-- CreateIndex
CREATE INDEX "daily_spend_tenant_id_idx" ON "daily_spend"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_spend_tenant_id_campaign_id_date_key" ON "daily_spend"("tenant_id", "campaign_id", "date");

-- AddForeignKey
ALTER TABLE "delivery_status_events" ADD CONSTRAINT "delivery_status_events_delivery_order_id_fkey" FOREIGN KEY ("delivery_order_id") REFERENCES "delivery_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_sets" ADD CONSTRAINT "ad_sets_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ads" ADD CONSTRAINT "ads_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ads" ADD CONSTRAINT "ads_ad_set_id_fkey" FOREIGN KEY ("ad_set_id") REFERENCES "ad_sets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_spend" ADD CONSTRAINT "daily_spend_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
