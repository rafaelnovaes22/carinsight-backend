import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
    console.log('🧹 Cleaning up database...');

    // 1. Remove RobustCar vehicles (Dealer created in initial seed)
    // Or vehicles with no media.

    // Let's find vehicles with no media first
    const vehiclesNoMedia = await prisma.vehicle.findMany({
        where: {
            media: {
                none: {}
            }
        }
    });

    console.log(`Found ${vehiclesNoMedia.length} vehicles without media.`);

    if (vehiclesNoMedia.length > 0) {
        const deleted = await prisma.vehicle.deleteMany({
            where: {
                id: {
                    in: vehiclesNoMedia.map(v => v.id)
                }
            }
        });
        console.log(`❌ Deleted ${deleted.count} vehicles without media.`);
    }

    // Also remove vehicles from "RobustCar" if they are the dummy ones (Civic 2021 and Corolla Cross 2022 from initial seed)
    // They might not have images if I didn't seed images for them (I didn't).

    const robustDealer = await prisma.dealer.findFirst({
        where: { name: 'RobustCar' }
    });

    if (robustDealer) {
        const deletedRobust = await prisma.vehicle.deleteMany({
            where: { dealerId: robustDealer.id }
        });
        console.log(`❌ Deleted ${deletedRobust.count} vehicles from RobustCar (Seed Data).`);
    }

}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
