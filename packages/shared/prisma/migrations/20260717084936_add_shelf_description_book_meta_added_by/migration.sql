/*
  Warnings:

  - You are about to drop the `_BookToShelf` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "_BookToShelf" DROP CONSTRAINT "_BookToShelf_A_fkey";

-- DropForeignKey
ALTER TABLE "_BookToShelf" DROP CONSTRAINT "_BookToShelf_B_fkey";

-- AlterTable
ALTER TABLE "books" ADD COLUMN     "page_count" INTEGER,
ADD COLUMN     "year" INTEGER;

-- AlterTable
ALTER TABLE "shelves" ADD COLUMN     "description" TEXT;

-- DropTable
DROP TABLE "_BookToShelf";

-- CreateTable
CREATE TABLE "book_on_shelf" (
    "shelf_id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "added_by_id" UUID NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "book_on_shelf_pkey" PRIMARY KEY ("shelf_id","book_id")
);

-- CreateIndex
CREATE INDEX "book_on_shelf_added_by_id_idx" ON "book_on_shelf"("added_by_id");

-- AddForeignKey
ALTER TABLE "book_on_shelf" ADD CONSTRAINT "book_on_shelf_shelf_id_fkey" FOREIGN KEY ("shelf_id") REFERENCES "shelves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_on_shelf" ADD CONSTRAINT "book_on_shelf_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_on_shelf" ADD CONSTRAINT "book_on_shelf_added_by_id_fkey" FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
