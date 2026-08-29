-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN     "actorUserId" UUID;

-- CreateIndex
CREATE INDEX "InventoryMovement_actorUserId_idx" ON "InventoryMovement"("actorUserId");

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
