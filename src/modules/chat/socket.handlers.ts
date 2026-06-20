import { Server } from 'socket.io'
import { PrismaClient } from '@prisma/client'
import jwt from 'jsonwebtoken'
import { sendPushNotification } from '../../config/firebase'

export function setupSocketHandlers(io: Server, prisma: PrismaClient) {
  io.use((socket, next) => {
    const token =
      socket.handshake.auth.token ||
      socket.handshake.headers.authorization?.replace('Bearer ', '')

    if (!token) return next(new Error('Token requerido'))

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as any
      socket.data.userId = payload.sub
      socket.data.role = payload.role
      next()
    } catch {
      next(new Error('Token inválido'))
    }
  })

  io.on('connection', (socket) => {
    const userId = socket.data.userId
    console.log(`Socket conectado: ${userId}`)

    socket.join(`user:${userId}`)

    socket.on('join_conversation', async (conversationId: string) => {
      const conv = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          OR: [{ participantAId: userId }, { participantBId: userId }],
        },
      })
      if (!conv) return
      socket.join(`conv:${conversationId}`)
    })

    socket.on('send_message', async (data: {
      conversationId: string
      content?: string
      mediaType?: string
      mediaUrl?: string
    }) => {
      try {
        const conv = await prisma.conversation.findFirst({
          where: {
            id: data.conversationId,
            OR: [{ participantAId: userId }, { participantBId: userId }],
          },
        })
        if (!conv) return

        const message = await prisma.message.create({
          data: {
            conversationId: data.conversationId,
            senderId: userId,
            content: data.content,
            mediaType: (data.mediaType as any) || 'TEXT',
            mediaUrl: data.mediaUrl,
          },
        })

        await prisma.conversation.update({
          where: { id: data.conversationId },
          data: { lastMessageAt: new Date() },
        })

        // Emitir a todos en la sala
        io.to(`conv:${data.conversationId}`).emit('new_message', message)

        // Notificar al otro participante
        const otherUserId =
          conv.participantAId === userId ? conv.participantBId : conv.participantAId

        io.to(`user:${otherUserId}`).emit('conversation_updated', {
          conversationId: data.conversationId,
          lastMessage: message,
        })

        // Enviar push notification si el otro usuario no está en la sala
        const otherSocketsInConv = await io
          .in(`conv:${data.conversationId}`)
          .fetchSockets()

        const otherIsInRoom = otherSocketsInConv.some(
          (s) => s.data.userId === otherUserId
        )

        if (!otherIsInRoom) {
          // Obtener FCM token del destinatario
          const otherUser = await prisma.user.findUnique({
            where: { id: otherUserId },
            select: {
              fcmToken: true,
              player: { select: { firstName: true, lastName: true } },
              coach: { select: { firstName: true, lastName: true } },
              club: { select: { name: true } },
            },
          })

          const sender = await prisma.user.findUnique({
            where: { id: userId },
            select: {
              player: { select: { firstName: true, lastName: true } },
              coach: { select: { firstName: true, lastName: true } },
              club: { select: { name: true } },
            },
          })

          const senderName = sender?.player
            ? `${sender.player.firstName} ${sender.player.lastName}`
            : sender?.coach
            ? `${sender.coach.firstName} ${sender.coach.lastName}`
            : sender?.club?.name ?? 'Alguien'

          if (otherUser?.fcmToken) {
            await sendPushNotification({
              fcmToken: otherUser.fcmToken,
              title: senderName,
              body: data.content || '📷 Imagen',
              data: {
                type: 'new_message',
                conversationId: data.conversationId,
                senderId: userId,
              },
            })
          }

          // Crear notificación en BD
          await prisma.notification.create({
            data: {
              userId: otherUserId,
              type: 'NEW_MESSAGE',
              payload: {
                conversationId: data.conversationId,
                senderId: userId,
                senderName,
                preview: data.content?.substring(0, 100) || '📷 Imagen',
              },
            },
          })
        }
      } catch (err) {
        console.error('Error en send_message:', err)
        socket.emit('error', { message: 'Error al enviar mensaje' })
      }
    })

    socket.on('mark_read', async (conversationId: string) => {
      await prisma.message.updateMany({
        where: {
          conversationId,
          senderId: { not: userId },
          isRead: false,
        },
        data: { isRead: true },
      })
      socket.to(`conv:${conversationId}`).emit('messages_read', {
        conversationId,
        readBy: userId,
      })
    })

    socket.on('typing', (conversationId: string) => {
      socket.to(`conv:${conversationId}`).emit('user_typing', { userId })
    })

    socket.on('stop_typing', (conversationId: string) => {
      socket.to(`conv:${conversationId}`).emit('user_stop_typing', { userId })
    })

    socket.on('disconnect', () => {
      console.log(`Socket desconectado: ${userId}`)
    })
  })
}
