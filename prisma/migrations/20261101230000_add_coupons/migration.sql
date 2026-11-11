CREATE TABLE "Coupon" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "value" DECIMAL(10,2) NOT NULL,
  "minSubtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "maxDiscount" DECIMAL(10,2),
  "active" BOOLEAN NOT NULL DEFAULT false,
  "startsAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "usageLimit" INTEGER,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Coupon_valid_discount" CHECK ("kind" IN ('PERCENT','FIXED') AND "value" > 0 AND ("kind" <> 'PERCENT' OR "value" <= 100)),
  CONSTRAINT "Coupon_valid_limits" CHECK ("minSubtotal" >= 0 AND ("maxDiscount" IS NULL OR "maxDiscount" > 0) AND "usedCount" >= 0 AND ("usageLimit" IS NULL OR ("usageLimit" > 0 AND "usedCount" <= "usageLimit")))
);
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");
ALTER TABLE "Order" ADD COLUMN "couponId" TEXT,
  ADD COLUMN "couponCode" TEXT,
  ADD COLUMN "couponReleasedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD CONSTRAINT "Order_couponId_fkey"
  FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
