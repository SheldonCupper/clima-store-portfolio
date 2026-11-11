import prisma from './prisma'
import type { OrderStatus, Prisma } from '../../generated/prisma/client'
import { checkoutCanBeCanceled } from './mercadoPago'

export class OrderStatusError extends Error {
  constructor(message: string, public statusCode = 409) { super(message) }
}

export async function changeOrderStatus(id: number, status: OrderStatus) {
  return prisma.$transaction(tx => changeOrderStatusInTransaction(tx, id, status))
}
export async function changeOrderStatusInTransaction(tx: Prisma.TransactionClient, id: number, status: OrderStatus) {
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${id} FOR UPDATE`
    const order = await tx.order.findUnique({ where: { id }, include: { refundRequest: true, items: { select: { productId: true, quantity: true, isService: true } } } })
    if (!order) throw new OrderStatusError('Pedido não encontrado', 404)
    if (order.status === status) return order
    if (order.status === 'CANCELED') throw new OrderStatusError('Um pedido cancelado não pode ser reaberto. Crie um novo pedido.')
    if (order.paymentReviewRequired) throw new OrderStatusError('O pagamento deste pedido precisa de conferência antes de alterar o status.')
    const cancel = status === 'CANCELED'
    if (order.refundRequest && (!cancel || order.refundRequest.status !== 'CONFIRMED')) throw new OrderStatusError('Há uma solicitação de estorno. Confira o reembolso e conclua o cancelamento antes de alterar o pedido.')
    if (cancel && ['SHIPPED', 'DELIVERED'].includes(order.status)) throw new OrderStatusError('Este pedido já saiu para entrega. Registre a devolução antes de repor o estoque.')
    if (cancel && order.paymentStatus === 'APPROVED') throw new OrderStatusError('Este pedido foi pago. Confirme o reembolso no provedor antes de cancelar.')
    const checkouts = await tx.paymentCheckout.findMany({ where: { orderId: id }, include: { payments: { select: { providerStatus: true } } } })
    if (cancel && checkouts.some(checkout => !checkoutCanBeCanceled(checkout))) throw new OrderStatusError('Existe uma cobrança vinculada ao pedido. Atualize o pagamento e aguarde o encerramento no Mercado Pago antes de repor o estoque.')
    if (!cancel && status !== 'PENDING' && checkouts.length && order.paymentStatus !== 'APPROVED') throw new OrderStatusError('Aguarde a confirmação do pagamento antes de preparar ou enviar o pedido.')
    const claimed = await tx.order.updateMany({
      where: { id, status: order.status, updatedAt: order.updatedAt, stockRestoredAt: null, paymentStatus: order.paymentStatus },
      data: { status, ...(cancel ? { stockRestoredAt: new Date(), ...(order.couponId ? { couponReleasedAt: new Date() } : {}), paymentStatus: order.paymentStatus === 'REFUNDED' ? 'REFUNDED' : 'CANCELED' } : {}) },
    })
    if (claimed.count !== 1) throw new OrderStatusError('O pedido foi atualizado em outra solicitação. Recarregue para conferir o status.')
    if (cancel) {
      if (order.couponId && !order.couponReleasedAt) {
        const released = await tx.coupon.updateMany({ where: { id: order.couponId, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } })
        if (released.count !== 1) throw new OrderStatusError('Não foi possível liberar o uso do cupom. Solicite conferência da loja.')
      }
      for (const item of order.items.filter(item => !item.isService)) await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } })
    }
    return tx.order.findUniqueOrThrow({ where: { id } })
}
