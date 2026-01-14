import { PrismaClient, UserRole, VehicleCondition } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

const vehiclesData = [
  {
    title: 'BMW 125I 2.0 M SPORT 16V 4P 2014',
    price: 0,
    mileage: 85840,
    fuel: 'Gasolina',
    transmission: 'Automático',
    imageUrl:
      'https://ssl9212.websiteseguro.com/armazena1/site_externo/emp_394/fotos/394_661_1-1.jpg',
    make: 'BMW',
    model: '125I 2.0',
    year: 2014,
    condition: 'Used',
  },
  {
    title: 'BMW 528 2.0 16V 4P 2014',
    price: 0,
    mileage: 130934,
    fuel: 'Gasolina',
    transmission: 'Automático',
    imageUrl:
      'https://ssl9212.websiteseguro.com/armazena1/site_externo/emp_394/fotos/394_772_1-1.jpg',
    make: 'BMW',
    model: '528 2.0',
    year: 2014,
    condition: 'Used',
  },
  {
    title: 'CHEVROLET CORSA 1.6 MPFI ST CS PICK-UP 8V 2P 2003',
    price: 0,
    mileage: 190999,
    fuel: 'Gasolina',
    transmission: 'Manual',
    imageUrl:
      'https://ssl9212.websiteseguro.com/armazena1/site_externo/emp_394/fotos/394_607_1-1.jpg',
    make: 'CHEVROLET',
    model: 'CORSA 1.6',
    year: 2003,
    condition: 'Used',
  },
  {
    title: 'CHEVROLET CORSA 1.8 MPFI SEDAN 8V 4P 2003',
    price: 0,
    mileage: 252390,
    fuel: 'Gasolina',
    transmission: 'Manual',
    imageUrl: 'https://via.placeholder.com/640x480.png?text=Sem+Foto',
    make: 'CHEVROLET',
    model: 'CORSA 1.8',
    year: 2003,
    condition: 'Used',
  },
  {
    title: 'CHEVROLET ONIX 1.0 LS MT 4P 2016',
    price: 0,
    mileage: 158662,
    fuel: 'Flex',
    transmission: 'Manual',
    imageUrl:
      'https://ssl9212.websiteseguro.com/armazena1/site_externo/emp_394/fotos/394_727_1-1.jpg',
    make: 'CHEVROLET',
    model: 'ONIX 1.0',
    year: 2016,
    condition: 'Used',
  },
  {
    title: 'CHEVROLET PRISMA 1.0 MPFI VHCE MAXX 8V 4P 2010',
    price: 0,
    mileage: 120544,
    fuel: 'Flex',
    transmission: 'Manual',
    imageUrl:
      'https://ssl9212.websiteseguro.com/armazena1/site_externo/emp_394/fotos/394_670_1-1.jpg',
    make: 'CHEVROLET',
    model: 'PRISMA 1.0',
    year: 2010,
    condition: 'Used',
  },
  {
    title: 'CHEVROLET SPIN 1.8 ACTIV 8V 4P 2017',
    price: 0,
    mileage: 170794,
    fuel: 'Flex',
    transmission: 'Automático',
    imageUrl: 'https://via.placeholder.com/640x480.png?text=Sem+Foto',
    make: 'CHEVROLET',
    model: 'SPIN 1.8',
    year: 2017,
    condition: 'Used',
  },
  {
    title: 'DODGE JOURNEY 3.6 RT V6 24V 4P 2013',
    price: 0,
    mileage: 150,
    fuel: 'Gasolina',
    transmission: 'Automático',
    imageUrl:
      'https://ssl9212.websiteseguro.com/armazena1/site_externo/emp_394/fotos/394_691_1-1.jpg',
    make: 'DODGE',
    model: 'JOURNEY 3.6',
    year: 2013,
    condition: 'New',
  },
  {
    title: 'FIAT DOBLO 1.8 MPI ADVENT 16V 4P 2012',
    price: 0,
    mileage: 167396,
    fuel: 'Flex',
    transmission: 'Manual',
    imageUrl:
      'https://ssl9212.websiteseguro.com/armazena1/site_externo/emp_394/fotos/394_773_1-1.jpg',
    make: 'FIAT',
    model: 'DOBLO 1.8',
    year: 2012,
    condition: 'Used',
  },
  {
    title: 'FIAT DOBLO 1.8 MPI ESSENCE 7L 16V 4P 2017',
    price: 0,
    mileage: 110221,
    fuel: 'Flex',
    transmission: 'Manual',
    imageUrl:
      'https://ssl9212.websiteseguro.com/armazena1/site_externo/emp_394/fotos/394_745_1-1.jpg',
    make: 'FIAT',
    model: 'DOBLO 1.8',
    year: 2017,
    condition: 'Used',
  },
  {
    title: 'FIAT SIENA EL 1.0 4P 2013',
    price: 0,
    mileage: 168338,
    fuel: 'Flex',
    transmission: 'Manual',
    imageUrl:
      'https://ssl9212.websiteseguro.com/armazena1/site_externo/emp_394/fotos/394_732_1-1.jpg',
    make: 'FIAT',
    model: 'SIENA EL',
    year: 2013,
    condition: 'Used',
  },
  {
    title: 'HARLEY-DAVIDSON V-ROD  2013',
    price: 0,
    mileage: 27220,
    fuel: 'Gasolina',
    transmission: 'Manual',
    imageUrl: 'https://via.placeholder.com/640x480.png?text=Sem+Foto',
    make: 'HARLEY-DAVIDSON',
    model: 'V-ROD ',
    year: 2013,
    condition: 'Used',
  },
  {
    title: 'HONDA CITY 1.5 LX 16V 4P 2013',
    price: 0,
    mileage: 189091,
    fuel: 'Flex',
    transmission: 'Automático',
    imageUrl:
      'https://ssl9212.websiteseguro.com/armazena1/site_externo/emp_394/fotos/394_759_1-1.jpg',
    make: 'HONDA',
    model: 'CITY 1.5',
    year: 2013,
    condition: 'Used',
  },
  {
    title: 'HONDA CIVIC 1.8 LXS 16V 4P 2010',
    price: 0,
    mileage: 139562,
    fuel: 'Flex',
    transmission: 'Automático',
    imageUrl:
      'https://ssl9212.websiteseguro.com/armazena1/site_externo/emp_394/fotos/394_682_1-1.jpg',
    make: 'HONDA',
    model: 'CIVIC 1.8',
    year: 2010,
    condition: 'Used',
  },
  {
    title: 'HONDA CIVIC 2.0 LXR 16V 4P 2015',
    price: 0,
    mileage: 159619,
    fuel: 'Flex',
    transmission: 'Automático',
    imageUrl:
      'https://ssl9212.websiteseguro.com/armazena1/site_externo/emp_394/fotos/394_766_1-1.jpg',
    make: 'HONDA',
    model: 'CIVIC 2.0',
    year: 2015,
    condition: 'Used',
  },
  {
    title: 'HONDA FIT 1.4 LX 8V 4P 2008',
    price: 0,
    mileage: 178448,
    fuel: 'Flex',
    transmission: 'Manual',
    imageUrl: 'https://via.placeholder.com/640x480.png?text=Sem+Foto',
    make: 'HONDA',
    model: 'FIT 1.4',
    year: 2008,
    condition: 'Used',
  },
  {
    title: 'HONDA FIT 1.5 EX 16V 4P 2014',
    price: 0,
    mileage: 152408,
    fuel: 'Flex',
    transmission: 'Manual',
    imageUrl:
      'https://ssl9212.websiteseguro.com/armazena1/site_externo/emp_394/fotos/394_770_1-1.jpg',
    make: 'HONDA',
    model: 'FIT 1.5',
    year: 2014,
    condition: 'Used',
  },
  {
    title: 'HONDA FIT 1.5 LX 16V 4P 2015',
    price: 0,
    mileage: 129647,
    fuel: 'Flex',
    transmission: 'Automático',
    imageUrl:
      'https://ssl9212.websiteseguro.com/armazena1/site_externo/emp_394/fotos/394_768_1-1.jpg',
    make: 'HONDA',
    model: 'FIT 1.5',
    year: 2015,
    condition: 'Used',
  },
  {
    title: 'HONDA PCX 150 2021',
    price: 0,
    mileage: 14140,
    fuel: 'Gasolina',
    transmission: 'Automático',
    imageUrl:
      'https://ssl9212.websiteseguro.com/armazena1/site_externo/emp_394/fotos/394_684_1-1.jpg',
    make: 'HONDA',
    model: 'PCX 150',
    year: 2021,
    condition: 'Used',
  },
  {
    title: 'HYUNDAI I30 2.0 MPFI 16V 4P 2012',
    price: 0,
    mileage: 109314,
    fuel: 'Gasolina',
    transmission: 'Automatizado',
    imageUrl: 'https://via.placeholder.com/640x480.png?text=Sem+Foto',
    make: 'HYUNDAI',
    model: 'I30 2.0',
    year: 2012,
    condition: 'Used',
  },
  {
    title: 'LAND ROVER EVOQUE DYNAMIC 5D  2.0 4P 2015',
    price: 0,
    mileage: 118827,
    fuel: 'Gasolina',
    transmission: 'Manual',
    imageUrl:
      'https://ssl9212.websiteseguro.com/armazena1/site_externo/emp_394/fotos/394_765_1-1.jpg',
    make: 'LAND',
    model: 'ROVER EVOQUE',
    year: 2015,
    condition: 'Used',
  },
  {
    title: 'NISSAN KICKS 1.6 16VSTART ADVANCE XTRONIC 4P 2024',
    price: 0,
    mileage: 18399,
    fuel: 'Flex',
    transmission: 'Manual',
    imageUrl:
      'https://ssl9212.websiteseguro.com/armazena1/site_externo/emp_394/fotos/394_767_1-1.jpg',
    make: 'NISSAN',
    model: 'KICKS 1.6',
    year: 2024,
    condition: 'Used',
  },
  {
    title: 'RENAULT CAPTUR 1.6 16V SCE INTENSE X-TRONIC 4P 2019',
    price: 0,
    mileage: 84550,
    fuel: 'Flex',
    transmission: 'Automático',
    imageUrl:
      'https://ssl9212.websiteseguro.com/armazena1/site_externo/emp_394/fotos/394_679_1-1.jpg',
    make: 'RENAULT',
    model: 'CAPTUR 1.6',
    year: 2019,
    condition: 'Used',
  },
  {
    title: 'RENAULT SANDERO 1.0 EXPR 16V 4P 2013',
    price: 0,
    mileage: 145600,
    fuel: 'Flex',
    transmission: 'Manual',
    imageUrl: 'https://via.placeholder.com/640x480.png?text=Sem+Foto',
    make: 'RENAULT',
    model: 'SANDERO 1.0',
    year: 2013,
    condition: 'Used',
  },
  {
    title: 'TOYOTA COROLLA 1.8 GLI 16V 4P 2013',
    price: 0,
    mileage: 200942,
    fuel: 'Flex',
    transmission: 'Automático',
    imageUrl:
      'https://ssl9212.websiteseguro.com/armazena1/site_externo/emp_394/fotos/394_776_1-1.jpg',
    make: 'TOYOTA',
    model: 'COROLLA 1.8',
    year: 2013,
    condition: 'Used',
  },
  {
    title: 'TOYOTA COROLLA 2.0 XEI 16V 4P 2016',
    price: 0,
    mileage: 121152,
    fuel: 'Flex',
    transmission: 'Automático',
    imageUrl:
      'https://ssl9212.websiteseguro.com/armazena1/site_externo/emp_394/fotos/394_757_1-1.jpg',
    make: 'TOYOTA',
    model: 'COROLLA 2.0',
    year: 2016,
    condition: 'Used',
  },
  {
    title: 'VOLKSWAGEN FOX CL 1.6 4P 2016',
    price: 0,
    mileage: 160650,
    fuel: 'Flex',
    transmission: 'Manual',
    imageUrl:
      'https://ssl9212.websiteseguro.com/armazena1/site_externo/emp_394/fotos/394_758_1-1.jpg',
    make: 'VOLKSWAGEN',
    model: 'FOX CL',
    year: 2016,
    condition: 'Used',
  },
  {
    title: 'VOLKSWAGEN FUSCA 1300 2P 1975',
    price: 0,
    mileage: 180010,
    fuel: 'Gasolina',
    transmission: 'Manual',
    imageUrl:
      'https://ssl9212.websiteseguro.com/armazena1/site_externo/emp_394/fotos/394_351_1-1.jpg',
    make: 'VOLKSWAGEN',
    model: 'FUSCA 1300',
    year: 1975,
    condition: 'Used',
  },
  {
    title: 'VOLKSWAGEN NIVUS 1.0 200 TSI TOTAL HIGHLINE 4P 2025',
    price: 0,
    mileage: 4614,
    fuel: 'Flex',
    transmission: 'Manual',
    imageUrl:
      'https://ssl9212.websiteseguro.com/armazena1/site_externo/emp_394/fotos/394_733_1-1.jpg',
    make: 'VOLKSWAGEN',
    model: 'NIVUS 1.0',
    year: 2025,
    condition: 'New',
  },
  {
    title: 'VOLKSWAGEN SANTANA 1.8 CL 8V 4P 1995',
    price: 0,
    mileage: 164333,
    fuel: 'Gasolina',
    transmission: 'Manual',
    imageUrl:
      'https://ssl9212.websiteseguro.com/armazena1/site_externo/emp_394/fotos/394_778_1-1.jpg',
    make: 'VOLKSWAGEN',
    model: 'SANTANA 1.8',
    year: 1995,
    condition: 'Used',
  },
  {
    title: 'VOLKSWAGEN SAVEIRO 1.6 CL CS 8V 2P 1995',
    price: 0,
    mileage: 47030,
    fuel: 'Álcool',
    transmission: 'Manual',
    imageUrl:
      'https://ssl9212.websiteseguro.com/armazena1/site_externo/emp_394/fotos/394_756_1-1.jpg',
    make: 'VOLKSWAGEN',
    model: 'SAVEIRO 1.6',
    year: 1995,
    condition: 'Used',
  },
  {
    title: 'VOLKSWAGEN VARIANT 1.6 8V 2P 1973',
    price: 0,
    mileage: 9597,
    fuel: 'Gasolina',
    transmission: 'Manual',
    imageUrl:
      'https://ssl9212.websiteseguro.com/armazena1/site_externo/emp_394/fotos/394_628_1-1.jpg',
    make: 'VOLKSWAGEN',
    model: 'VARIANT 1.6',
    year: 1973,
    condition: 'Used',
  },
];

async function main() {
  console.log('🌱 Seeding Renatinhus Data...');

  // Ensure Dealer Exists (Assuming created in previous seed, but let's be safe)
  // We will find or create the dealer 'RobustCar' or 'Renatinhus'

  let dealer = await prisma.dealer.findFirst();
  if (!dealer) {
    const user = await prisma.user.create({
      data: {
        email: 'renato@renatinhus.com.br',
        passwordHash: 'hashed_secret',
        name: 'Renato',
        role: UserRole.DEALER,
      },
    });
    dealer = await prisma.dealer.create({
      data: {
        userId: user.id,
        name: "Renatinhu's Cars",
        contactInfo: {
          address: 'Guarulhos - SP',
          phone: '(11) 96785-3644',
        },
      },
    });
  }

  // Clear existing vehicles if needed? No, let's append or upsert.
  // Actually, for this task, let's delete old ones to show only Renatinhus?
  // Maybe better to just add.

  for (const v of vehiclesData) {
    // Map string condition to Enum
    const condition =
      v.condition === 'New' ? VehicleCondition.NEW : VehicleCondition.USED;

    await prisma.vehicle.create({
      data: {
        dealerId: dealer.id,
        title: v.title,
        make: v.make,
        model: v.model,
        yearModel: v.year,
        yearFab: v.year,
        price: v.price,
        mileage: v.mileage,
        condition: condition,
        bodyType: 'N/A', // Não extraímos bodyType ainda
        status: 'AVAILABLE',
        technicalSpecs: {
          transmission: v.transmission,
          fuel: v.fuel,
        },
        features: [],
        media: {
          create: [{ url: v.imageUrl, order: 1 }],
        },
      },
    });
  }

  console.log(`✅ Seeded ${vehiclesData.length} vehicles from Renatinhus!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
