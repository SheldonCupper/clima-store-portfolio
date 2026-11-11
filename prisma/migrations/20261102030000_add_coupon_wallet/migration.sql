-- Divulgação opt-in: preserva a privacidade dos códigos já cadastrados.
ALTER TABLE "Coupon" ADD COLUMN "published" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "CouponClaim" (
  "id" TEXT NOT NULL,
  "couponId" TEXT NOT NULL,
  "accountId" INTEGER NOT NULL,
  "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CouponClaim_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CouponClaim_couponId_accountId_key" ON "CouponClaim"("couponId", "accountId");
CREATE INDEX "CouponClaim_accountId_claimedAt_idx" ON "CouponClaim"("accountId", "claimedAt");
ALTER TABLE "CouponClaim" ADD CONSTRAINT "CouponClaim_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CouponClaim" ADD CONSTRAINT "CouponClaim_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
