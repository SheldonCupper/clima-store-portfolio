import prisma from './prisma'

async function main() {
  const ferramentas = await prisma.category.upsert({
    where: { slug: 'ferramentas' },
    update: {},
    create: {
      name: 'Ferramentas',
      slug: 'ferramentas'
    }
  })

  const gas = await prisma.category.upsert({
    where: { slug: 'gas-refrigerante' },
    update: {},
    create: {
      name: 'Gás refrigerante',
      slug: 'gas-refrigerante'
    }
  })

  const pecas = await prisma.category.upsert({
    where: { slug: 'pecas-componentes' },
    update: {},
    create: {
      name: 'Peças e componentes',
      slug: 'pecas-componentes'
    }
  })

  await prisma.product.upsert({
    where: { sku: 'BOMBA-7CFM' },
    update: {},
    create: {
      name: 'Bomba de Vácuo Profissional 7 CFM',
      slug: 'bomba-de-vacuo-profissional-7-cfm',
      sku: 'BOMBA-7CFM',
      description: 'Bomba de vácuo profissional para refrigeração.',
      price: 789.90,
      pixPrice: 758.30,
      stock: 15,
      imageUrl: 'https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=600',
      categoryId: ferramentas.id
    }
  })

  await prisma.product.upsert({
    where: { sku: 'MANIFOLD-DIGITAL' },
    update: {},
    create: {
      name: 'Manifold Digital para Refrigeração',
      slug: 'manifold-digital-refrigeracao',
      sku: 'MANIFOLD-DIGITAL',
      description: 'Manifold digital profissional.',
      price: 459.90,
      pixPrice: 441.50,
      stock: 10,
      imageUrl: 'https://images.unsplash.com/photo-1581092921461-eab62e97a780?w=600',
      categoryId: ferramentas.id
    }
  })

  await prisma.product.upsert({
    where: { sku: 'GAS-R410A' },
    update: {},
    create: {
      name: 'Gás Refrigerante R410A 750g',
      slug: 'gas-refrigerante-r410a-750g',
      sku: 'GAS-R410A',
      description: 'Gás refrigerante R410A.',
      price: 119.90,
      pixPrice: 115.10,
      stock: 30,
      imageUrl: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=600',
      categoryId: gas.id
    }
  })

  await prisma.product.upsert({
    where: { sku: 'CAPACITOR-35UF' },
    update: {},
    create: {
      name: 'Capacitor 35µF para Ar-condicionado',
      slug: 'capacitor-35uf-ar-condicionado',
      sku: 'CAPACITOR-35UF',
      description: 'Capacitor para sistemas de climatização.',
      price: 49.90,
      pixPrice: 47.90,
      stock: 40,
      categoryId: pecas.id
    }
  })

  console.log('Banco populado com sucesso.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })