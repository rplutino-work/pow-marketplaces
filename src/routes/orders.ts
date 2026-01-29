/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ORDERS ROUTES - Gestión de Órdenes
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response } from 'express';
import { getPrisma } from '../config/database';
import * as ordersService from '../services/orders';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /orders - Listar órdenes
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { integration_id, status, from_date, to_date, limit, offset } = req.query;

    const filter: any = {};
    if (integration_id) filter.integration_id = String(integration_id);
    if (status) filter.status = String(status);
    if (from_date) filter.from_date = new Date(String(from_date));
    if (to_date) filter.to_date = new Date(String(to_date));
    if (limit) filter.limit = parseInt(String(limit), 10);
    if (offset) filter.offset = parseInt(String(offset), 10);

    const orders = await ordersService.getOrders(filter);
    res.json(orders);

  } catch (error: any) {
    logger.error('Error listando órdenes:', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * GET /orders/stats - Estadísticas de órdenes
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const { integration_id } = req.query;
    const stats = await ordersService.getOrderStats(
      integration_id ? String(integration_id) : undefined
    );
    res.json(stats);

  } catch (error: any) {
    logger.error('Error obteniendo estadísticas:', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * GET /orders/blocked/summary - Resumen de órdenes bloqueadas
 */
router.get('/blocked/summary', async (req: Request, res: Response) => {
  try {
    const { integration_id } = req.query;
    const summary = await ordersService.getBlockedOrdersSummary(
      integration_id ? String(integration_id) : undefined
    );
    res.json(summary);

  } catch (error: any) {
    logger.error('Error obteniendo resumen de bloqueadas:', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * POST /orders/blocked/bulk-retry - Reintentar órdenes bloqueadas
 */
router.post('/blocked/bulk-retry', async (req: Request, res: Response) => {
  try {
    const { integration_id } = req.body;

    if (!integration_id) {
      return res.status(400).json({ error: 'Se requiere integration_id' });
    }

    const result = await ordersService.bulkRetryBlockedOrders(integration_id);
    res.json(result);

  } catch (error: any) {
    logger.error('Error en bulk retry:', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * GET /orders/:id - Detalle de orden
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const order = await ordersService.getOrderById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    res.json(order);

  } catch (error: any) {
    logger.error('Error obteniendo orden:', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * GET /orders/:id/logs - Logs de la orden
 */
router.get('/:id/logs', async (req: Request, res: Response) => {
  try {
    const prisma = getPrisma();

    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
    });

    if (!order) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    const logs = await prisma.syncLog.findMany({
      where: {
        integration_id: order.integration_id,
        detalle: { contains: order.source_order_id },
      },
      orderBy: { created_at: 'desc' },
      take: 50,
    });

    res.json(logs.map(log => ({
      id: log.id,
      tipo: log.tipo,
      detalle: JSON.parse(log.detalle || '{}'),
      resultado: log.resultado,
      response_data: log.response_data ? JSON.parse(log.response_data) : null,
      created_at: log.created_at,
    })));

  } catch (error: any) {
    logger.error('Error obteniendo logs:', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * POST /orders/:id/retry - Reintentar orden
 */
router.post('/:id/retry', async (req: Request, res: Response) => {
  try {
    const result = await ordersService.retryOrder(req.params.id);
    res.json({ success: true, result });

  } catch (error: any) {
    logger.error('Error reintentando orden:', { error: error.message });
    res.status(500).json({
      error: 'Error reintentando orden',
      details: error.message,
    });
  }
});

/**
 * PATCH /orders/:id/status - Actualizar estado de orden
 */
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const prisma = getPrisma();
    const { status, flag_reason } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Se requiere status' });
    }

    const validStatuses = ['pending', 'processed', 'blocked_by_rule', 'failed', 'sent_to_hermes'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Estado inválido',
        valid_statuses: validStatuses,
      });
    }

    const updateData: any = { status, updated_at: new Date() };
    if (flag_reason !== undefined) updateData.flag_reason = flag_reason;

    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: updateData,
    });

    logger.info(`Estado de orden actualizado: ${order.id} -> ${status}`);
    res.json({ success: true, order });

  } catch (error: any) {
    logger.error('Error actualizando estado:', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * POST /orders/:id/send-to-hermes - Enviar orden a Hermes
 */
router.post('/:id/send-to-hermes', async (req: Request, res: Response) => {
  try {
    const result = await ordersService.retryOrder(req.params.id);
    res.json({ success: true, result });

  } catch (error: any) {
    logger.error('Error enviando a Hermes:', { error: error.message });
    res.status(500).json({
      error: 'Error enviando a Hermes',
      details: error.message,
    });
  }
});

export default router;
