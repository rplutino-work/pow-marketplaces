/**
 * Script para obtener el SIZE_GRID_ID desde un producto de referencia
 * Uso: npx ts-node scripts/get-size-grid-id.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const MELI_API_URL = process.env.ML_API_URL || 'https://api.mercadolibre.com';

async function getSizeGridId() {
  try {
    // Obtener una integración con token válido
    const integration = await prisma.integration.findFirst({
      where: {
        marketplace: {
          name: 'mercadolibre',
        },
      },
      include: {
        credentials: {
          orderBy: { updated_at: 'desc' },
          take: 1,
        },
        marketplace: true,
      },
    });

    if (!integration || !integration.credentials[0]) {
      console.log('❌ No se encontró integración con credenciales');
      return;
    }

    const credential = integration.credentials[0];
    const accessToken = credential.access_token || 
      (credential.credentials_encrypted ? JSON.parse(credential.credentials_encrypted).access_token : null);

    if (!accessToken) {
      console.log('❌ No se encontró access token');
      return;
    }

    // Obtener el producto de referencia que el usuario creó manualmente
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
    
    // Buscar SIZE_GRID_ID en los atributos
    const sizeGridAttr = item.attributes?.find((attr: any) => attr.id === 'SIZE_GRID_ID');
    
    if (sizeGridAttr) {
      console.log(`\n✅ SIZE_GRID_ID encontrado: ${sizeGridAttr.value_id || sizeGridAttr.value_name}`);
      console.log(`\n📋 Detalles del atributo:`);
      console.log(JSON.stringify(sizeGridAttr, null, 2));
      
      // Actualizar la integración con el ID correcto
      let ajustes: any = {};
      if (integration.ajustes_default) {
        try {
          ajustes = JSON.parse(integration.ajustes_default);
        } catch (e) {
          ajustes = {};
        }
      }
      
      const sizeGridId = sizeGridAttr.value_id || sizeGridAttr.value_name;
      ajustes.size_grid_id = sizeGridId;
      
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          ajustes_default: JSON.stringify(ajustes),
        },
      });
      
      console.log(`\n✅ Integración actualizada con SIZE_GRID_ID: ${sizeGridId}`);
    } else {
      console.log('\n⚠️  SIZE_GRID_ID no encontrado en el producto de referencia');
      console.log('\n📋 Atributos del producto:');
      console.log(JSON.stringify(item.attributes?.map((a: any) => ({ id: a.id, name: a.name, value: a.value_id || a.value_name })), null, 2));
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar script
getSizeGridId()
  .then(() => {
    console.log('\n🎉 Script completado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Error:', error);
    process.exit(1);
  });
