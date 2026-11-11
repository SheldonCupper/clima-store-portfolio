-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paymentReviewRequired" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PaymentCheckout" (
    "id" TEXT NOT NULL,
    "orderId" INTEGER NOT NULL,
    "environment" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "preferenceId" TEXT,
    "checkoutUrl" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentCheckout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderPayment" (
    "id" TEXT NOT NULL,
    "checkoutId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "providerPaymentId" TEXT NOT NULL,
    "providerStatus" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "refundedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "paymentType" TEXT NOT NULL,
    "methodId" TEXT NOT NULL,
    "providerUpdatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCheckout_preferenceId_key" ON "PaymentCheckout"("preferenceId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCheckout_orderId_environment_key" ON "PaymentCheckout"("orderId", "environment");

-- CreateIndex
CREATE INDEX "ProviderPayment_checkoutId_idx" ON "ProviderPayment"("checkoutId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderPayment_environment_providerPaymentId_key" ON "ProviderPayment"("environment", "providerPaymentId");

-- AddForeignKey
ALTER TABLE "PaymentCheckout" ADD CONSTRAINT "PaymentCheckout_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderPayment" ADD CONSTRAINT "ProviderPayment_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "PaymentCheckout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
