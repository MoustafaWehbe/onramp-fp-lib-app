-- CreateEnum
CREATE TYPE "ShareAccessLevel" AS ENUM ('VIEW', 'WRITE');

-- CreateEnum
CREATE TYPE "ShareStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateTable
CREATE TABLE "shelf_shares" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shelf_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "access_level" "ShareAccessLevel" NOT NULL DEFAULT 'VIEW',
    "status" "ShareStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shelf_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shelf_shares_user_id_idx" ON "shelf_shares"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "shelf_shares_shelf_id_user_id_key" ON "shelf_shares"("shelf_id", "user_id");

-- AddForeignKey
ALTER TABLE "shelf_shares" ADD CONSTRAINT "shelf_shares_shelf_id_fkey" FOREIGN KEY ("shelf_id") REFERENCES "shelves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shelf_shares" ADD CONSTRAINT "shelf_shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
