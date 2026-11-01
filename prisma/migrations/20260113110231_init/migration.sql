-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'DEALER', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "VehicleCondition" AS ENUM ('NEW', 'USED');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'SOLD');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO', 'VR360');

-- CreateEnum
CREATE TYPE "InteractionType" AS ENUM ('SAVED', 'VIEWED', 'CONTACTED', 'COMPARISON_ADD');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "preferences" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dealer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactInfo" JSONB NOT NULL,
    "verificationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dealer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "version" TEXT,
    "yearModel" INTEGER NOT NULL,
    "yearFab" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "mileage" INTEGER NOT NULL,
    "condition" "VehicleCondition" NOT NULL DEFAULT 'USED',
    "bodyType" TEXT NOT NULL,
    "technicalSpecs" JSONB NOT NULL,
    "features" TEXT[],
    "inspectionReport" JSONB,
    "aiTags" TEXT[],
    "status" "VehicleStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleMedia" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" "MediaType" NOT NULL DEFAULT 'IMAGE',
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VehicleMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserInteraction" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "vehicleId" TEXT NOT NULL,
    "type" "InteractionType" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Dealer_userId_key" ON "Dealer"("userId");

-- AddForeignKey
ALTER TABLE "Dealer" ADD CONSTRAINT "Dealer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleMedia" ADD CONSTRAINT "VehicleMedia_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInteraction" ADD CONSTRAINT "UserInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInteraction" ADD CONSTRAINT "UserInteraction_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
