import 'dotenv/config';
import { PrismaClient, VehicleCondition, MediaType, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Create a Dealer
    const dealer = await prisma.dealer.create({
        data: {

            name: 'RobustCar Veículos',
            contactInfo: { whatsapp: '11999999999' },
            verificationStatus: 'VERIFIED',
            user: {
                create: {
                    email: 'dealer@robustcar.com',
                    name: 'RobustCar Admin',
                    passwordHash: 'hashed_password_mock', // In real app, use bcrypt
                    role: UserRole.DEALER
                }
            }
        },
    });

    console.log('Dealer created:', dealer.name);

    // Create Vehicles from the frontend examples
    const corolla = await prisma.vehicle.create({
        data: {
            dealerId: dealer.id,
            title: '2022 Toyota Corolla Cross XR',
            make: 'Toyota',
            model: 'Corolla Cross',
            version: 'XR',
            yearModel: 2022,
            yearFab: 2021,
            price: 145000.00,
            mileage: 18000,
            condition: VehicleCondition.USED,
            bodyType: 'SUV',
            technicalSpecs: {
                engine: '2.0 Dynamic Force',
                power: '177 cv',
                transmission: 'CVT',
                consumption: '12 km/l'
            },
            features: ['Ar Condicionado', 'Direção Elétrica', 'Airbags', 'ABS'],
            aiTags: ['Econômico', 'Bestseller'],
            media: {
                create: {
                    url: 'https://placehold.co/600x400?text=Corolla+Cross',
                    type: MediaType.IMAGE
                }
            }
        }
    });

    const civic = await prisma.vehicle.create({
        data: {
            dealerId: dealer.id,
            title: '2021 Honda Civic Sedan EXL',
            make: 'Honda',
            model: 'Civic',
            version: 'EXL',
            yearModel: 2021,
            yearFab: 2021,
            price: 139000.00,
            mileage: 32000,
            condition: VehicleCondition.USED,
            bodyType: 'Sedan',
            technicalSpecs: {
                engine: '2.0 i-VTEC',
                power: '155 cv',
                transmission: 'CVT',
                consumption: '11 km/l'
            },
            features: ['Couro', 'Multimídia', 'Câmera de Ré'],
            aiTags: ['Conforto', 'Clássico'],
            media: {
                create: {
                    url: 'https://placehold.co/600x400?text=Honda+Civic',
                    type: MediaType.IMAGE
                }
            }
        }
    });

    console.log({ corolla, civic });
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
