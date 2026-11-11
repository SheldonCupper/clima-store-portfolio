-- Optional specifications; existing products keep all their current values.
ALTER TABLE "Product"
ADD COLUMN "technicalAttributes" JSONB NOT NULL DEFAULT '{}';
