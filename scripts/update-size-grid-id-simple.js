/**
 * Script simple para actualizar SIZE_GRID_ID en ajustes_default
 * Usa el ID correcto: 4511198 (de la URL de la tabla de talles)
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateSizeGridId() {
  try {
    console.log('🔍 Buscando integraciones de MercadoLibre...');
    
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
    
    const SIZE_GRID_ID = '4511198'; // ID de la tabla de talles desde la URL
    
    for (const integration of integrations) {
      console.log(`\n📝 Actualizando integración: ${integration.id}`);
      console.log(`   Hermes Integration ID: ${integration.hermes_integration_id}`);
      console.log(`   Cliente: ${integration.cliente_name || integration.cliente_domain}`);
      
      let ajustes = {};
      if (integration.ajustes_default) {
        try {
          ajustes = JSON.parse(integration.ajustes_default);
        } catch (e) {
          console.log(`   ⚠️  ajustes_default no es JSON válido, creando nuevo objeto`);
          ajustes = {};
        }
      }
      
      ajustes.size_grid_id = SIZE_GRID_ID;
      
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          ajustes_default: JSON.stringify(ajustes),
        },
      });
      
      console.log(`   ✅ SIZE_GRID_ID actualizado a: ${SIZE_GRID_ID}`);
      console.log(`   📋 Ajustes completos: ${JSON.stringify(ajustes, null, 2)}`);
    }
    
    console.log('\n✅ Todas las integraciones actualizadas correctamente');
    
  } catch (error) {
    console.error('❌ Error actualizando SIZE_GRID_ID:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

updateSizeGridId()
  .then(() => {
    console.log('\n🎉 Script completado exitosamente');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Error ejecutando script:', error);
    process.exit(1);
  });
