import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import multipart from '@fastify/multipart'
import { createServer } from 'http'
import { Server as SocketServer } from 'socket.io'
import { prisma } from './config/prisma'
import { redis } from './config/redis'
import { authRoutes } from './modules/auth/auth.routes'
import { usersRoutes } from './modules/users/users.routes'
import { feedRoutes } from './modules/feed/feed.routes'
import { searchRoutes } from './modules/search/search.routes'
import { mediaRoutes } from './modules/media/media.routes'
import { chatRoutes } from './modules/chat/chat.routes'
import { notificationsRoutes } from './modules/notifications/notifications.routes'
import { setupSocketHandlers } from './modules/chat/socket.handlers'

const app = Fastify({ logger: true })

// Crear servidor HTTP independiente
const httpServer = createServer()

// Socket.io sobre el servidor HTTP puro
const io = new SocketServer(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
})

async function bootstrap() {
  await app.register(cors, { origin: true, credentials: true })

  await app.register(jwt, { secret: process.env.JWT_SECRET! })

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    redis,
  })

  await app.register(multipart, {
    limits: { fileSize: 100 * 1024 * 1024 },
  })

  app.decorate('authenticate', async (request: any, reply: any) => {
    try {
      await request.jwtVerify()
    } catch (err) {
      reply.send(err)
    }
  })

  app.setErrorHandler((error: any, request, reply) => {
    const statusCode = error.statusCode || 500
    console.error('ERROR:', error.message)
    reply.status(statusCode).send({ error: error.message, statusCode })
  })

  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(usersRoutes, { prefix: '/api/users' })
  await app.register(feedRoutes, { prefix: '/api/feed' })
  await app.register(searchRoutes, { prefix: '/api/search' })
  await app.register(mediaRoutes, { prefix: '/api/media' })
  await app.register(chatRoutes, { prefix: '/api/chat' })
  await app.register(notificationsRoutes, { prefix: '/api/notifications' })

  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  // Fastify maneja las peticiones HTTP a través del servidor puro
  httpServer.on('request', app.server.emit.bind(app.server, 'request'))

  setupSocketHandlers(io, prisma)

  const port = parseInt(process.env.PORT || '3000')

  await new Promise<void>((resolve) => {
    httpServer.listen(port, '0.0.0.0', () => resolve())
  })

  await app.ready()

  console.log(`FootballConnect API corriendo en puerto ${port}`)
}

bootstrap().catch((err) => {
  console.error(err)
  process.exit(1)
})

process.on('SIGTERM', async () => {
  await prisma.$disconnect()
  redis.disconnect()
  process.exit(0)
})
