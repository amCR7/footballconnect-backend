import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AuthService } from './auth.service'

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['PLAYER', 'COACH', 'CLUB']),
  // Campos del perfil inicial
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  name: z.string().optional(), // Para clubs
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

const refreshSchema = z.object({
  refreshToken: z.string(),
})

export async function authRoutes(app: FastifyInstance) {
  const authService = new AuthService(app)

  app.post('/register', async (request, reply) => {
    const body = registerSchema.parse(request.body)
    const result = await authService.register(body)
    return reply.status(201).send(result)
  })

  app.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body)
    const result = await authService.login(body.email, body.password)
    return reply.send(result)
  })

  app.post('/refresh', async (request, reply) => {
    const { refreshToken } = refreshSchema.parse(request.body)
    const result = await authService.refreshTokens(refreshToken)
    return reply.send(result)
  })

  app.post('/logout', {
    onRequest: [(request, reply, done) => {
      (app as any).authenticate(request, reply).then(done).catch(done)
    }]
  }, async (request, reply) => {
    const user = (request as any).user
    await authService.logout(user.sub)
    return reply.send({ message: 'Sesión cerrada' })
  })
}
