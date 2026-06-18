import { Server } from 'socket.io'
import { PrismaClient } from '@prisma/client'
import jwt from 'jsonwebtoken'

export function setupSocketHandlers(io: Server, prisma: PrismaClient) {
  // Middleware de autenticación para Socket.io
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

    // Unirse a sala personal para recibir notificaciones
    socket.join(`user:${userId}`)

    // ── Unirse a conversación ───────────────────────────────────────────────
    socket.on('join_conversation', async (conversationId: string) => {
      // Verificar que el usuario pertenece a la conversación
      const conv = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          OR: [{ participantAId: userId }, { participantBId: userId }],
        },
      })
      if (!conv) return

      socket.join(`conv:${conversationId}`)
    })

    // ── Enviar mensaje ─────────────────────────────────────────────────────
    socket.on('send_message', async (data: {
      conversationId: string
      content?: string
      mediaType?: string
      mediaUrl?: string
    }) => {
      try {
        // Verificar pertenencia a la conversación
        const conv = await prisma.conversation.findFirst({
          where: {
            id: data.conversationId,
            OR: [{ participantAId: userId }, { participantBId: userId }],
          },
        })
        if (!conv) return

        // Guardar mensaje
        const message = await prisma.message.create({
          data: {
            conversationId: data.conversationId,
            senderId: userId,
            content: data.content,
            mediaType: (data.mediaType as any) || 'TEXT',
            mediaUrl: data.mediaUrl,
          },
        })

        // Actualizar timestamp de la conversación
        await prisma.conversation.update({
          where: { id: data.conversationId },
          data: { lastMessageAt: new Date() },
        })

        // Emitir a todos en la sala de la conversación
        io.to(`conv:${data.conversationId}`).emit('new_message', message)

        // Notificar al otro participante si no está en la sala
        const otherUserId =
          conv.participantAId === userId ? conv.participantBId : conv.participantAId

        io.to(`user:${otherUserId}`).emit('conversation_updated', {
          conversationId: data.conversationId,
          lastMessage: message,
        })
      } catch (err) {
        socket.emit('error', { message: 'Error al enviar mensaje' })
      }
    })

    // ── Marcar como leído ──────────────────────────────────────────────────
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

    // ── Escribiendo... ─────────────────────────────────────────────────────
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
