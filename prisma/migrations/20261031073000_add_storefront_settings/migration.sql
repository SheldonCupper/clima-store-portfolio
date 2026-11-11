CREATE TABLE "StorefrontSetting" (
    "id" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StorefrontSetting_pkey" PRIMARY KEY ("id")
);
