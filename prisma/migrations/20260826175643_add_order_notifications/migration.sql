-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "OrderNotification" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderNotification_status_idx" ON "OrderNotification"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OrderNotification_orderId_type_key" ON "OrderNotification"("orderId", "type");

-- AddForeignKey
ALTER TABLE "OrderNotification" ADD CONSTRAINT "OrderNotification_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
