/**
 * Script para actualizar SIZE_GRID_ID en ajustes_default de las integraciones
 * Uso: npx ts-node scripts/update-size-grid-id.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateSizeGridId() {
  try {
    console.log('🔍 Buscando integraciones de MercadoLibre...');
    
    // Buscar todas las integraciones de MercadoLibre
    const integrations = await prisma.integration.findMany({
      where: {
        marketplace: {
          name: 'mercadolibre',
        },
      },
      include: {
        marketplace: true,
      },
    });

    if (integrations.length === 0) {
      console.log('❌ No se encontraron integraciones de MercadoLibre');
      return;
    }

    console.log(`✅ Encontradas ${integrations.length} integración(es) de MercadoLibre`);
    
    for (const integration of integrations) {
      console.log(`\n📝 Actualizando integración: ${integration.id}`);
      console.log(`   Hermes Integration ID: ${integration.hermes_integration_id}`);
      console.log(`   Cliente: ${integration.cliente_name || integration.cliente_domain}`);
      
      // Obtener ajustes actuales o crear objeto vacío
      let ajustes: any = {};
      if (integration.ajustes_default) {
        try {
          ajustes = JSON.parse(integration.ajustes_default);
        } catch (e) {
          console.log(`   ⚠️  ajustes_default no es JSON válido, creando nuevo objeto`);
          ajustes = {};
        }
      }
      
      // Agregar o actualizar size_grid_id
      ajustes.size_grid_id = 'sizegrid1';
      
      // Actualizar en la base de datos
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          ajustes_default: JSON.stringify(ajustes),
        },
      });
      
      console.log(`   ✅ SIZE_GRID_ID actualizado a: sizegrid1`);
      console.log(`   📋 Ajustes completos: ${JSON.stringify(ajustes, null, 2)}`);
    }
    
    console.log('\n✅ Todas las integraciones actualizadas correctamente');
    
  } catch (error: any) {
    console.error('❌ Error actualizando SIZE_GRID_ID:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar script
updateSizeGridId()
  .then(() => {
    console.log('\n🎉 Script completado exitosamente');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Error ejecutando script:', error);
    process.exit(1);
  });
