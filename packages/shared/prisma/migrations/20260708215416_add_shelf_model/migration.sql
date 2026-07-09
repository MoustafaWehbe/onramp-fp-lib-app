-- CreateTable
CREATE TABLE "shelves" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shelves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_BookToShelf" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_BookToShelf_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "shelves_user_id_name_key" ON "shelves"("user_id", "name");

-- CreateIndex
CREATE INDEX "_BookToShelf_B_index" ON "_BookToShelf"("B");

-- AddForeignKey
ALTER TABLE "shelves" ADD CONSTRAINT "shelves_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BookToShelf" ADD CONSTRAINT "_BookToShelf_A_fkey" FOREIGN KEY ("A") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BookToShelf" ADD CONSTRAINT "_BookToShelf_B_fkey" FOREIGN KEY ("B") REFERENCES "shelves"("id") ON DELETE CASCADE ON UPDATE CASCADE;
