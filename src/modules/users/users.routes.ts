import { FastifyInstance } from 'fastify'
import { prisma } from '../../config/prisma'

function notFound(msg = 'No encontrado') {
  const e: any = new Error(msg); e.statusCode = 404; return e
}

export async function usersRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] }

  app.get('/me', auth, async (request: any) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.sub },
      include: { player: true, coach: true, club: true },
    })
    if (!user) throw notFound('Usuario no encontrado')
    const { passwordHash, ...rest } = user as any
    return rest
  })

  app.get('/:id', auth, async (request: any) => {
    const { id } = request.params as any
    const user = await prisma.user.findUnique({
      where: { id },
      include: { player: true, coach: true, club: true },
    })
    if (!user || !user.isActive) throw notFound('Usuario no encontrado')
    const { passwordHash, ...rest } = user as any
    return rest
  })

  app.patch('/me', auth, async (request: any) => {
    const userId = request.user.sub
    const body = request.body as any

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    })
    if (!user) throw notFound()

    if (user.role === 'PLAYER') {
      await prisma.player.update({
        where: { userId },
        data: {
          city: body.city,
          province: body.province,
          bio: body.bio,
          heightCm: body.heightCm,
          weightKg: body.weightKg,
          goals: body.goals,
          assists: body.assists,
          minutesPlayed: body.minutesPlayed,
          mainPosition: body.mainPosition,
          secondaryPositions: body.secondaryPositions,
          dominantFoot: body.dominantFoot,
        },
      })
    } else if (user.role === 'COACH') {
      await prisma.coach.update({
        where: { userId },
        data: {
          city: body.city,
          province: body.province,
          bio: body.bio,
          experienceYears: body.experienceYears,
          licenses: body.licenses,
          specialties: body.specialties,
          languages: body.languages,
        },
      })
    } else if (user.role === 'CLUB') {
      await prisma.club.update({
        where: { userId },
        data: {
          city: body.city,
          province: body.province,
          description: body.description,
          stadium: body.stadium,
          website: body.website,
          currentNeeds: body.currentNeeds,
          category: body.category,
        },
      })
    }

    const updated = await prisma.user.findUnique({
      where: { id: userId },
      include: { player: true, coach: true, club: true },
    })
    const { passwordHash, ...rest } = updated as any
    return rest
  })

  app.delete('/me', auth, async (request: any) => {
    await prisma.user.update({
      where: { id: request.user.sub },
      data: { isActive: false },
    })
    return { message: 'Cuenta eliminada' }
  })

  app.patch('/me/fcm-token', auth, async (request: any) => {
    const { token } = request.body as { token: string }
    await prisma.user.update({
      where: { id: request.user.sub },
      data: { fcmToken: token },
    })
    return { success: true }
  })
}
