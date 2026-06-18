import { FastifyInstance } from 'fastify'
import { prisma } from '../../config/prisma'
import { redis } from '../../config/redis'

export async function feedRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] }

  // ── GET /feed ──────────────────────────────────────────────────────────────
  app.get('/', auth, async (request: any) => {
    const { page = 1, limit = 20 } = request.query as any
    const skip = (page - 1) * limit
    const userId = request.user.sub

    // Intentar cache de Redis (TTL 5 min)
    const cacheKey = `feed:${userId}:${page}`
    const cached = await redis.get(cacheKey).catch(() => null)
    if (cached) return JSON.parse(cached)

    // Obtener usuario actual para personalizar feed
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { player: true, coach: true, club: true },
    })

    // Construir filtros de recomendación
    const where: any = {
      id: { not: userId },
      isActive: true,
    }

    // Priorizar por provincia si el usuario tiene ubicación
    const userProvince =
      currentUser?.player?.province ||
      currentUser?.coach?.province ||
      currentUser?.club?.province

    // Obtener usuarios con score de relevancia
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: { player: true, coach: true, club: true },
        skip,
        take: Number(limit),
        orderBy: [
          { updatedAt: 'desc' },
        ],
      }),
      prisma.user.count({ where }),
    ])

    // Ordenar por relevancia (misma provincia primero)
    const scored = users.map(u => {
      let score = 0
      const province = u.player?.province || u.coach?.province || u.club?.province
      if (userProvince && province === userProvince) score += 10

      // Clubs con necesidades activas tienen más score
      if (u.role === 'CLUB' && ((u.club?.currentNeeds as any[]) || []).length > 0) score += 5

      // Si el usuario es jugador, los clubs y entrenadores tienen más relevancia
      if (currentUser?.role === 'PLAYER') {
        if (u.role === 'CLUB' || u.role === 'COACH') score += 3
      }
      if (currentUser?.role === 'CLUB') {
        if (u.role === 'PLAYER' || u.role === 'COACH') score += 3
      }

      return { ...u, _score: score }
    }).sort((a, b) => b._score - a._score)
      .map(({ _score, passwordHash, ...u }) => u)

    const result = {
      data: scored,
      page: Number(page),
      limit: Number(limit),
      total,
      hasMore: skip + users.length < total,
    }

    // Guardar en cache 5 minutos
    await redis.setex(cacheKey, 300, JSON.stringify(result)).catch(() => null)

    return result
  })
}
