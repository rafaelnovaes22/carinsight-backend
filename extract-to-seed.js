const fs = require('fs');

const html = fs.readFileSync('../stock_utf8.html', 'utf8');

// Copiar regex do meu pensamento
// Listing loop
const carRegex = /<div class='listing-list-loop'>([\s\S]*?)<div class='meta-bottom'>/g;
let match;
const vehicles = [];

while ((match = carRegex.exec(html)) !== null) {
  const block = match[1];

  // Title
  const titleMatch = block.match(/<div class='title heading-font'><a href='[^']+'>([^<]+)<\/a>/);
  const title = titleMatch ? titleMatch[1].trim() : 'Unknown Car';

  // Price
  const priceMatch = block.match(/<span class='heading-font'>(R\$ [^<]+)<\/span>/);
  const priceStr = priceMatch ? priceMatch[1] : 'R$ Consulte';
  // Parse price value
  let price = 0;
  if (priceStr.includes('Consulte')) {
    price = 0;
  } else {
    // R$ 50.000,00 -> 50000.00
    price = parseFloat(priceStr.replace('R$', '').replace(/\./g, '').replace(',', '.').trim());
  }

  // Image
  const imgMatch = block.match(/<img src='([^']+)'/);
  // Default image if missing or "NoFoto"
  let imageUrl = imgMatch ? imgMatch[1] : '';
  if (imageUrl.includes('NoFoto')) imageUrl = 'https://via.placeholder.com/640x480.png?text=Sem+Foto';

  // Specs
  const kmMatch = block.match(/<div class='meta-middle-unit quilometragem'>[\s\S]*?<div class='value h5'>([^<]+)<\/div>/);
  const kmStr = kmMatch ? kmMatch[1].trim() : '0 Km';
  let mileage = parseInt(kmStr.replace(/\./g, '').replace(' Km', '').trim()) || 0;

  const fuelMatch = block.match(/<div class='meta-middle-unit fuel'>[\s\S]*?<div class='value h5'>([^<]+)<\/div>/);
  const fuel = fuelMatch ? fuelMatch[1].trim() : 'Flex';

  const transMatch = block.match(/<div class='meta-middle-unit transmission'>[\s\S]*?<div class='value h5'>([^<]+)<\/div>/);
  const transmission = transMatch ? transMatch[1].trim() : 'Manual';

  // Make/Model heuristic
  const parts = title.split(' ');
  const make = parts[0];
  const model = parts.slice(1, 3).join(' '); // Pegar 2 palavras pro modelo (ex: COROLLA XEI)

  // Year heuristic (last word usually)
  const yearMatch = title.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? parseInt(yearMatch[0]) : 2020;

  vehicles.push({
    title,
    price,
    mileage,
    fuel,
    transmission,
    imageUrl,
    make,
    model,
    year,
    condition: mileage < 5000 ? 'New' : 'Used' // Heuresitica simples
  });
}

console.log(`Extracted ${vehicles.length} vehicles.`);

// Generate Seed Content
const seedContent = `
import { PrismaClient, UserRole, VehicleCondition } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

const vehiclesData = ${JSON.stringify(vehicles, null, 2)};

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
            role: UserRole.DEALER
        }
    });
    dealer = await prisma.dealer.create({
        data: {
            userId: user.id,
            name: "Renatinhu's Cars",
            contactInfo: {
              address: 'Guarulhos - SP',
              phone: '(11) 96785-3644'
            }
        }
    });
  }

  // Clear existing vehicles if needed? No, let's append or upsert.
  // Actually, for this task, let's delete old ones to show only Renatinhus? 
  // Maybe better to just add.

  for (const v of vehiclesData) {
    // Map string condition to Enum
    const condition = v.condition === 'New' ? VehicleCondition.NEW : VehicleCondition.USED;
    
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
            create: [
                { url: v.imageUrl, order: 1 }
            ]
        }
      }
    });
  }

  console.log(\`✅ Seeded \${vehiclesData.length} vehicles from Renatinhus!\`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
`;

fs.writeFileSync('prisma/seed-renatinhus.ts', seedContent);
console.log('Genereted prisma/seed-renatinhus.ts');
