-- CreateTable
CREATE TABLE "book_shares" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "book_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "book_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "book_shares_recipient_id_idx" ON "book_shares"("recipient_id");

-- CreateIndex
CREATE UNIQUE INDEX "book_shares_book_id_recipient_id_key" ON "book_shares"("book_id", "recipient_id");

-- AddForeignKey
ALTER TABLE "book_shares" ADD CONSTRAINT "book_shares_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_shares" ADD CONSTRAINT "book_shares_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_shares" ADD CONSTRAINT "book_shares_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
