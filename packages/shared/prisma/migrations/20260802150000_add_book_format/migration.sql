-- CreateEnum
CREATE TYPE "BookFormat" AS ENUM ('PHYSICAL', 'EBOOK', 'AUDIOBOOK');

-- AlterTable
ALTER TABLE "books" ADD COLUMN "format" "BookFormat" NOT NULL DEFAULT 'PHYSICAL';
