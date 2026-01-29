/**
 * Script para obtener el SIZE_GRID_ID del producto de referencia
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const MELI_API_URL = process.env.ML_API_URL || 'https://api.mercadolibre.com';

async function checkReferenceProduct() {
  try {
    // Obtener integración con token válido
    const integration = await prisma.integration.findFirst({
      where: {
        marketplace: {
          name: 'mercadolibre',
        },
        hermes_integration_id: '5',
      },
      include: {
        credentials: {
          orderBy: { updated_at: 'desc' },
          take: 1,
        },
      },
    });

    if (!integration || !integration.credentials[0]) {
      console.log('❌ No se encontró integración con credenciales');
      return;
    }

    const credential = integration.credentials[0];
    let accessToken = credential.access_token;
    
    if (!accessToken && credential.credentials_encrypted) {
      try {
        const decrypted = JSON.parse(credential.credentials_encrypted);
        accessToken = decrypted.access_token;
      } catch (e) {
        console.log('❌ No se pudo desencriptar credenciales');
        return;
      }
    }

    if (!accessToken) {
      console.log('❌ No se encontró access token');
      return;
    }

    // Obtener el producto de referencia
    const referenceItemId = 'MLA1663048385';
    console.log(`🔍 Obteniendo detalles del producto de referencia: ${referenceItemId}`);
    
    const response = await fetch(`${MELI_API_URL}/items/${referenceItemId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ Error obteniendo producto:', errorData);
      return;
    }

    const item = await response.json();
    
    console.log('\n📋 Información del producto de referencia:');
    console.log(`   ID: ${item.id}`);
    console.log(`   Título: ${item.title}`);
    console.log(`   Categoría: ${item.category_id}`);
    
    // Buscar SIZE_GRID_ID en los atributos
    const sizeGridAttr = item.attributes?.find((attr: any) => attr.id === 'SIZE_GRID_ID');
    
    if (sizeGridAttr) {
      console.log('\n✅ SIZE_GRID_ID encontrado:');
      console.log(JSON.stringify(sizeGridAttr, null, 2));
      console.log(`\n   value_id: ${sizeGridAttr.value_id}`);
      console.log(`   value_name: ${sizeGridAttr.value_name}`);
      console.log(`   name: ${sizeGridAttr.name}`);
    } else {
      console.log('\n⚠️  SIZE_GRID_ID no encontrado en los atributos');
      console.log('\n📋 Todos los atributos:');
      item.attributes?.forEach((attr: any) => {
        if (attr.id.includes('SIZE') || attr.id.includes('GRID')) {
          console.log(`   ${attr.id}: ${JSON.stringify(attr)}`);
        }
      });
    }
    
    // Verificar variaciones
    if (item.variations && item.variations.length > 0) {
      console.log(`\n📦 Variaciones: ${item.variations.length}`);
      if (item.variations[0].attribute_combinations) {
        console.log('\n   Attribute combinations de la primera variación:');
        console.log(JSON.stringify(item.variations[0].attribute_combinations, null, 2));
      }
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

checkReferenceProduct()
  .then(() => {
    console.log('\n🎉 Script completado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Error:', error);
    process.exit(1);
  });
