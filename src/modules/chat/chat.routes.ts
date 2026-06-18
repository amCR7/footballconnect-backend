import { FastifyInstance } from 'fastify'
import { prisma } from '../../config/prisma'

function httpError(msg: string, code: number) {
  const e: any = new Error(msg); e.statusCode = code; return e
}

export async function chatRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] }

  app.get('/conversations', auth, async (request: any) => {
    const userId = request.user.sub
    const conversations = await prisma.conversation.findMany({
      where: { OR: [{ participantAId: userId }, { participantBId: userId }] },
      include: {
        participantA: { include: { player: true, coach: true, club: true } },
        participantB: { include: { player: true, coach: true, club: true } },
        messages: { orderBy: { sentAt: 'desc' }, take: 1 },
      },
      orderBy: { lastMessageAt: 'desc' },
    })

    return conversations.map(conv => {
      const { passwordHash: _a, ...partA } = conv.participantA as any
      const { passwordHash: _b, ...partB } = conv.participantB as any
      return {
        ...conv,
        participantA: partA,
        participantB: partB,
        lastMessage: conv.messages[0] || null,
        unreadCount: 0,
      }
    })
  })

  app.post('/conversations', auth, async (request: any) => {
    const userId = request.user.sub
    const { targetUserId } = request.body as { targetUserId: string }

    if (userId === targetUserId) throw httpError('No puedes chatear contigo mismo', 400)

    const existing = await prisma.conversation.findFirst({
      where: {
        OR: [
          { participantAId: userId, participantBId: targetUserId },
          { participantAId: targetUserId, participantBId: userId },
        ],
      },
      include: {
        participantA: { include: { player: true, coach: true, club: true } },
        participantB: { include: { player: true, coach: true, club: true } },
      },
    })

    if (existing) {
      const { passwordHash: _a, ...partA } = existing.participantA as any
      const { passwordHash: _b, ...partB } = existing.participantB as any
      return { ...existing, participantA: partA, participantB: partB }
    }

    const conversation = await prisma.conversation.create({
      data: { participantAId: userId, participantBId: targetUserId },
      include: {
        participantA: { include: { player: true, coach: true, club: true } },
        participantB: { include: { player: true, coach: true, club: true } },
      },
    })

    const { passwordHash: _a, ...partA } = conversation.participantA as any
    const { passwordHash: _b, ...partB } = conversation.participantB as any
    return { ...conversation, participantA: partA, participantB: partB }
  })

  app.get('/conversations/:id/messages', auth, async (request: any) => {
    const { id } = request.params as any
    const { page = 1, limit = 50 } = request.query as any
    const userId = request.user.sub

    const conv = await prisma.conversation.findFirst({
      where: { id, OR: [{ participantAId: userId }, { participantBId: userId }] },
    })
    if (!conv) throw httpError('Forbidden', 403)

    const skip = (Number(page) - 1) * Number(limit)
    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { conversationId: id },
        orderBy: { sentAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.message.count({ where: { conversationId: id } }),
    ])

    return {
      data: messages.reverse(),
      page: Number(page),
      limit: Number(limit),
      total,
      hasMore: skip + messages.length < total,
    }
  })

  app.put('/conversations/:id/read', auth, async (request: any) => {
    const { id } = request.params as any
    const userId = request.user.sub
    await prisma.message.updateMany({
      where: { conversationId: id, senderId: { not: userId }, isRead: false },
      data: { isRead: true },
    })
    return { success: true }
  })
}
