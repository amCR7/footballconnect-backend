import { FastifyInstance } from 'fastify'
import { prisma } from '../../config/prisma'

export async function searchRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] }

  app.get('/', auth, async (request: any) => {
    const {
      q, role, position, minAge, maxAge,
      minHeight, maxHeight, province, dominantFoot,
      license, minExperience, category, need,
      page = 1, limit = 20,
    } = request.query as any

    const skip = (Number(page) - 1) * Number(limit)
    const where: any = { isActive: true, id: { not: request.user.sub } }
    if (role) where.role = role

    // Filtros por rol
    if (role === 'PLAYER' || !role) {
      const playerWhere: any = {}
      if (position) playerWhere.mainPosition = { contains: position, mode: 'insensitive' }
      if (province) playerWhere.province = { contains: province, mode: 'insensitive' }
      if (dominantFoot) playerWhere.dominantFoot = dominantFoot
      if (minHeight) playerWhere.heightCm = { gte: Number(minHeight) }
      if (maxHeight) playerWhere.heightCm = { ...playerWhere.heightCm, lte: Number(maxHeight) }
      if (minAge || maxAge) {
        const now = new Date()
        if (maxAge) playerWhere.birthDate = { gte: new Date(now.getFullYear() - Number(maxAge), now.getMonth(), now.getDate()) }
        if (minAge) playerWhere.birthDate = { ...playerWhere.birthDate, lte: new Date(now.getFullYear() - Number(minAge), now.getMonth(), now.getDate()) }
      }
      if (Object.keys(playerWhere).length > 0 && (!role || role === 'PLAYER')) {
        where.player = playerWhere
      }
    }

    if (role === 'COACH') {
      const coachWhere: any = {}
      if (province) coachWhere.province = { contains: province, mode: 'insensitive' }
      if (minExperience) coachWhere.experienceYears = { gte: Number(minExperience) }
      if (license) coachWhere.licenses = { array_contains: license }
      if (Object.keys(coachWhere).length > 0) where.coach = coachWhere
    }

    if (role === 'CLUB') {
      const clubWhere: any = {}
      if (province) clubWhere.province = { contains: province, mode: 'insensitive' }
      if (category) clubWhere.category = { contains: category, mode: 'insensitive' }
      if (need) clubWhere.currentNeeds = { array_contains: need }
      if (Object.keys(clubWhere).length > 0) where.club = clubWhere
    }

    // Búsqueda por texto
    if (q) {
      where.OR = [
        { player: { firstName: { contains: q, mode: 'insensitive' } } },
        { player: { lastName: { contains: q, mode: 'insensitive' } } },
        { coach: { firstName: { contains: q, mode: 'insensitive' } } },
        { coach: { lastName: { contains: q, mode: 'insensitive' } } },
        { club: { name: { contains: q, mode: 'insensitive' } } },
        { email: { contains: q, mode: 'insensitive' } },
      ]
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: { player: true, coach: true, club: true },
        skip,
        take: Number(limit),
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ])

    const data = users.map(({ passwordHash, ...u }) => u)

    return {
      data,
      page: Number(page),
      limit: Number(limit),
      total,
      hasMore: skip + users.length < total,
    }
  })
}
