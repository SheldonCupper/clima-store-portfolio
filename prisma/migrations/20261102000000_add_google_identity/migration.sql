ALTER TABLE "CustomerAccount" ADD COLUMN "googleSubject" TEXT;
CREATE UNIQUE INDEX "CustomerAccount_googleSubject_key" ON "CustomerAccount"("googleSubject");
