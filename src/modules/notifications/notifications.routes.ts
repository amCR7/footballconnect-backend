import { FastifyInstance } from 'fastify'
import { prisma } from '../../config/prisma'

export async function notificationsRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] }

  app.get('/', auth, async (request: any) => {
    const notifications = await prisma.notification.findMany({
      where: { userId: request.user.sub },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return notifications
  })

  app.put('/read-all', auth, async (request: any) => {
    await prisma.notification.updateMany({
      where: { userId: request.user.sub, isRead: false },
      data: { isRead: true },
    })
    return { success: true }
  })

  app.put('/:id/read', auth, async (request: any) => {
    const { id } = request.params
    await prisma.notification.update({
      where: { id, userId: request.user.sub },
      data: { isRead: true },
    })
    return { success: true }
  })
}
