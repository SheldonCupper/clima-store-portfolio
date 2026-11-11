-- Somente adições; datas históricas não são inventadas.
ALTER TABLE "Order" ADD COLUMN "paymentApprovedAt" TIMESTAMP(3);
CREATE INDEX "Order_paymentApprovedAt_idx" ON "Order"("paymentApprovedAt");
CREATE TABLE "ProductReview" (
 "id" TEXT NOT NULL,
 "productId" INTEGER NOT NULL,
 "accountId" INTEGER NOT NULL,
 "rating" INTEGER NOT NULL,
 "comment" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ProductReview_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ProductReview_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
 CONSTRAINT "ProductReview_status_check" CHECK ("status" IN ('PENDING','APPROVED','REJECTED'))
);
CREATE UNIQUE INDEX "ProductReview_productId_accountId_key" ON "ProductReview"("productId", "accountId");
CREATE INDEX "ProductReview_productId_status_createdAt_idx" ON "ProductReview"("productId", "status", "createdAt");
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
