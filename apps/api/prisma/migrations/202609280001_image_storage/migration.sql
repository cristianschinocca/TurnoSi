CREATE TABLE "ImageStorageObject" (
  "id" TEXT PRIMARY KEY,
  "bucket" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "deleteAfter" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ImageStorageObject_bucket_path_key" ON "ImageStorageObject"("bucket", "path");
CREATE INDEX "ImageStorageObject_deleteAfter_idx" ON "ImageStorageObject"("deleteAfter");

ALTER TABLE "OrganizationLogo" ALTER COLUMN "data" DROP NOT NULL;
ALTER TABLE "OrganizationGalleryImage" ALTER COLUMN "data" DROP NOT NULL;
ALTER TABLE "OrganizationLogo" ADD COLUMN "storageObjectId" TEXT;
ALTER TABLE "OrganizationGalleryImage" ADD COLUMN "storageObjectId" TEXT;
CREATE UNIQUE INDEX "OrganizationLogo_storageObjectId_key" ON "OrganizationLogo"("storageObjectId");
CREATE UNIQUE INDEX "OrganizationGalleryImage_storageObjectId_key" ON "OrganizationGalleryImage"("storageObjectId");
ALTER TABLE "OrganizationLogo" ADD CONSTRAINT "OrganizationLogo_storageObjectId_fkey"
  FOREIGN KEY ("storageObjectId") REFERENCES "ImageStorageObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrganizationGalleryImage" ADD CONSTRAINT "OrganizationGalleryImage_storageObjectId_fkey"
  FOREIGN KEY ("storageObjectId") REFERENCES "ImageStorageObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrganizationLogo" ADD CONSTRAINT "OrganizationLogo_image_source_check"
  CHECK (("data" IS NOT NULL) <> ("storageObjectId" IS NOT NULL));
ALTER TABLE "OrganizationGalleryImage" ADD CONSTRAINT "OrganizationGalleryImage_image_source_check"
  CHECK (("data" IS NOT NULL) <> ("storageObjectId" IS NOT NULL));

-- Queue cleanup in the same transaction, including organization cascade deletes.
CREATE FUNCTION queue_replaced_image_object() RETURNS TRIGGER AS $$
BEGIN
  IF OLD."storageObjectId" IS NOT NULL THEN
    IF TG_OP = 'DELETE' THEN
      UPDATE "ImageStorageObject" SET "deleteAfter" = CURRENT_TIMESTAMP
        WHERE "id" = OLD."storageObjectId";
    ELSIF OLD."storageObjectId" IS DISTINCT FROM NEW."storageObjectId" THEN
      UPDATE "ImageStorageObject" SET "deleteAfter" = CURRENT_TIMESTAMP
        WHERE "id" = OLD."storageObjectId";
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "OrganizationLogo_storage_cleanup"
  AFTER DELETE OR UPDATE OF "storageObjectId" ON "OrganizationLogo"
  FOR EACH ROW EXECUTE FUNCTION queue_replaced_image_object();
CREATE TRIGGER "OrganizationGalleryImage_storage_cleanup"
  AFTER DELETE OR UPDATE OF "storageObjectId" ON "OrganizationGalleryImage"
  FOR EACH ROW EXECUTE FUNCTION queue_replaced_image_object();
