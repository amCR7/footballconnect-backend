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
const httpServer = createServer(app.server)

const io = new SocketServer(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
})

async function bootstrap() {
  // Plugins
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || true,
    credentials: true,
  })

  await app.register(jwt, {
    secret: process.env.JWT_SECRET!,
  })

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    redis,
  })

  await app.register(multipart, {
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  })

  // Decorador de autenticación reutilizable
  app.decorate('authenticate', async (request: any, reply: any) => {
    try {
      await request.jwtVerify()
    } catch (err) {
      reply.send(err)
    }
  })

  // Error handler global
  // Permitir body vacío en PUT/PATCH
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (!body || (body as string).trim() === '') {
      done(null, {})
      return
    }
    try {
      done(null, JSON.parse(body as string))
    } catch (e: any) {
      done(e, undefined)
    }
  })

  app.setErrorHandler((error: any, request, reply) => {
    const statusCode = error.statusCode || 500
    const message = error.message || 'Error interno del servidor'
    reply.status(statusCode).send({ error: message, statusCode })
  })

  // Rutas
  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(usersRoutes, { prefix: '/api/users' })
  await app.register(feedRoutes, { prefix: '/api/feed' })
  await app.register(searchRoutes, { prefix: '/api/search' })
  await app.register(mediaRoutes, { prefix: '/api/media' })
  await app.register(chatRoutes, { prefix: '/api/chat' })
  await app.register(notificationsRoutes, { prefix: '/api/notifications' })

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  // Socket.io handlers
  setupSocketHandlers(io, prisma)

  const port = parseInt(process.env.PORT || '3000')
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`FootballConnect API corriendo en puerto ${port}`)
}

bootstrap().catch((err) => {
  console.error(err)
  process.exit(1)
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  await prisma.$disconnect()
  redis.disconnect()
  process.exit(0)
})
