import bcrypt from 'bcryptjs'
import { FastifyInstance } from 'fastify'
import { prisma } from '../../config/prisma'

export class AuthService {
  private app: FastifyInstance

  constructor(app: FastifyInstance) {
    this.app = app
  }

  async register(data: {
    email: string
    password: string
    role: 'PLAYER' | 'COACH' | 'CLUB'
    firstName?: string
    lastName?: string
    name?: string
    province?: string
    city?: string
    [key: string]: any
  }) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } })
    if (existing) throw new Error('Ya existe una cuenta con este correo')

    const passwordHash = await bcrypt.hash(data.password, 12)

    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        role: data.role,
        ...(data.role === 'PLAYER' && {
          player: {
            create: {
              firstName: data.firstName || '',
              lastName: data.lastName || '',
              province: data.province,
              city: data.city,
              heightCm: data.heightCm,
              weightKg: data.weightKg,
              dominantFoot: data.dominantFoot,
              mainPosition: data.mainPosition,
              secondaryPositions: data.secondaryPositions || [],
              bio: data.bio,
              goals: data.goals || 0,
              assists: data.assists || 0,
              minutesPlayed: data.minutesPlayed || 0,
              achievements: data.achievements || [],
            },
          },
        }),
        ...(data.role === 'COACH' && {
          coach: {
            create: {
              firstName: data.firstName || '',
              lastName: data.lastName || '',
              province: data.province,
              city: data.city,
              licenses: data.licenses || [],
              specialties: data.specialties || [],
              languages: data.languages || [],
              experienceYears: data.experienceYears || 0,
              achievements: data.achievements || [],
              bio: data.bio,
            },
          },
        }),
        ...(data.role === 'CLUB' && {
          club: {
            create: {
              name: data.name || '',
              city: data.city,
              province: data.province,
              category: data.category,
              foundedYear: data.foundedYear,
              stadium: data.stadium,
              website: data.website,
              description: data.description,
              currentNeeds: data.currentNeeds || [],
            },
          },
        }),
      },
      include: { player: true, coach: true, club: true },
    })

    return this._generateTokens(user)
  }

  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { player: true, coach: true, club: true },
    })

    if (!user) throw new Error('Credenciales incorrectas')
    if (!user.isActive) throw new Error('Cuenta desactivada')

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) throw new Error('Credenciales incorrectas')

    return this._generateTokens(user)
  }

  async refreshTokens(refreshToken: string) {
    try {
      const payload = this.app.jwt.verify(refreshToken) as { sub: string; type: string }
      if (payload.type !== 'refresh') throw new Error('Token inválido')

      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        include: { player: true, coach: true, club: true },
      })
      if (!user || !user.isActive) throw new Error('Usuario no encontrado')

      return this._generateTokens(user)
    } catch {
      throw new Error('Refresh token inválido o expirado')
    }
  }

  async logout(userId: string) {
    // Con JWT stateless no hay nada que invalidar en servidor.
    // Si en el futuro usamos una blocklist en Redis, aquí iría.
    return { success: true }
  }

  private _generateTokens(user: any) {
    const accessToken = this.app.jwt.sign(
      { sub: user.id, role: user.role, type: 'access' },
      { expiresIn: '15m' }
    )
    const refreshToken = this.app.jwt.sign(
      { sub: user.id, type: 'refresh' },
      { expiresIn: '30d' }
    )

    return {
      accessToken,
      refreshToken,
      user: this._formatUser(user),
    }
  }

  private _formatUser(user: any) {
    const { passwordHash, ...rest } = user
    return rest
  }
}
