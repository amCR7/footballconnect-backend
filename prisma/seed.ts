import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding base de datos...')

  // Limpiar datos previos
  await prisma.message.deleteMany()
  await prisma.conversation.deleteMany()
  await prisma.favorite.deleteMany()
  await prisma.media.deleteMany()
  await prisma.careerHistory.deleteMany()
  await prisma.player.deleteMany()
  await prisma.coach.deleteMany()
  await prisma.club.deleteMany()
  await prisma.user.deleteMany()

  const hash = await bcrypt.hash('password123', 12)

  // ── Jugadores ──────────────────────────────────────────────────────────────
  const players = [
    { email: 'jugador1@test.com', firstName: 'Carlos', lastName: 'García', city: 'Madrid', province: 'Madrid', mainPosition: 'Delantero centro', age: 22, goals: 15, assists: 8 },
    { email: 'jugador2@test.com', firstName: 'Miguel', lastName: 'López', city: 'Barcelona', province: 'Barcelona', mainPosition: 'Lateral derecho', age: 25, goals: 2, assists: 12 },
    { email: 'jugador3@test.com', firstName: 'Alejandro', lastName: 'Martínez', city: 'Sevilla', province: 'Sevilla', mainPosition: 'Mediocentro', age: 28, goals: 5, assists: 20 },
    { email: 'jugador4@test.com', firstName: 'Pablo', lastName: 'Sánchez', city: 'Valencia', province: 'Valencia', mainPosition: 'Portero', age: 24, goals: 0, assists: 0 },
    { email: 'jugador5@test.com', firstName: 'Diego', lastName: 'Fernández', city: 'Bilbao', province: 'Vizcaya', mainPosition: 'Central', age: 26, goals: 3, assists: 2 },
  ]

  for (const p of players) {
    await prisma.user.create({
      data: {
        email: p.email,
        passwordHash: hash,
        role: 'PLAYER',
        player: {
          create: {
            firstName: p.firstName,
            lastName: p.lastName,
            city: p.city,
            province: p.province,
            mainPosition: p.mainPosition,
            heightCm: 175 + Math.floor(Math.random() * 15),
            weightKg: 70 + Math.floor(Math.random() * 15),
            dominantFoot: 'RIGHT',
            goals: p.goals,
            assists: p.assists,
            minutesPlayed: 1800 + Math.floor(Math.random() * 2000),
            bio: `Jugador profesional con experiencia en categorías nacionales. Busco nuevos retos.`,
            secondaryPositions: [],
            achievements: ['Campeón regional 2023'],
          },
        },
      },
    })
  }

  // ── Entrenadores ───────────────────────────────────────────────────────────
  const coaches = [
    { email: 'entrenador1@test.com', firstName: 'Roberto', lastName: 'Ruiz', city: 'Madrid', province: 'Madrid', experience: 10 },
    { email: 'entrenador2@test.com', firstName: 'Antonio', lastName: 'Moreno', city: 'Barcelona', province: 'Barcelona', experience: 15 },
    { email: 'entrenador3@test.com', firstName: 'José', lastName: 'Jiménez', city: 'Málaga', province: 'Málaga', experience: 8 },
  ]

  for (const c of coaches) {
    await prisma.user.create({
      data: {
        email: c.email,
        passwordHash: hash,
        role: 'COACH',
        coach: {
          create: {
            firstName: c.firstName,
            lastName: c.lastName,
            city: c.city,
            province: c.province,
            experienceYears: c.experience,
            licenses: ['UEFA B', 'UEFA A'],
            specialties: ['Fútbol base', 'Análisis táctico'],
            languages: ['Español', 'Inglés'],
            bio: `Entrenador con ${c.experience} años de experiencia en fútbol profesional y semiprofesional.`,
            achievements: ['Ascenso a Segunda División 2022'],
          },
        },
      },
    })
  }

  // ── Clubes ─────────────────────────────────────────────────────────────────
  const clubs = [
    { email: 'club1@test.com', name: 'CD Alcalá FC', city: 'Alcalá de Henares', province: 'Madrid', category: 'Tercera Federación', needs: ['Delantero centro', 'Lateral izquierdo'] },
    { email: 'club2@test.com', name: 'CF Badalona', city: 'Badalona', province: 'Barcelona', category: 'Segunda Federación', needs: ['Portero', 'Central', 'Entrenador principal'] },
    { email: 'club3@test.com', name: 'UD Almería B', city: 'Almería', province: 'Almería', category: 'Regional Preferente', needs: ['Mediocentro', 'Extremo derecho'] },
  ]

  for (const cl of clubs) {
    await prisma.user.create({
      data: {
        email: cl.email,
        passwordHash: hash,
        role: 'CLUB',
        club: {
          create: {
            name: cl.name,
            city: cl.city,
            province: cl.province,
            category: cl.category,
            foundedYear: 1950 + Math.floor(Math.random() * 50),
            description: `Club histórico de ${cl.city} con gran tradición en el fútbol español.`,
            currentNeeds: cl.needs,
          },
        },
      },
    })
  }

  console.log('✓ Seed completado')
  console.log('Credenciales de prueba: cualquier email de arriba / password123')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
