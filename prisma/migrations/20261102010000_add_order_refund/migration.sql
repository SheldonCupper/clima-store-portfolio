CREATE TABLE "OrderRefund" (
  "id" TEXT NOT NULL,
  "orderId" INTEGER NOT NULL,
  "checkoutId" TEXT NOT NULL,
  "environment" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "requestedBy" TEXT NOT NULL,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrderRefund_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderRefund_valid" CHECK ("amount" > 0 AND "environment" IN ('sandbox','production') AND "status" IN ('REQUESTED','CONFIRMED') AND (("status" = 'CONFIRMED') = ("confirmedAt" IS NOT NULL)))
);
CREATE UNIQUE INDEX "OrderRefund_orderId_key" ON "OrderRefund"("orderId");
ALTER TABLE "OrderRefund" ADD CONSTRAINT "OrderRefund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderRefund" ADD CONSTRAINT "OrderRefund_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "PaymentCheckout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
