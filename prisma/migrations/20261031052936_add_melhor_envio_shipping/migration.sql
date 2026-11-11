-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "shippingCompany" TEXT,
ADD COLUMN     "shippingDeliveryTime" INTEGER,
ADD COLUMN     "shippingServiceId" TEXT,
ADD COLUMN     "shippingServiceName" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "heightCm" INTEGER,
ADD COLUMN     "lengthCm" INTEGER,
ADD COLUMN     "weightKg" DOUBLE PRECISION,
ADD COLUMN     "widthCm" INTEGER;
