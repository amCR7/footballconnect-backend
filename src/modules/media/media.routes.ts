import { FastifyInstance } from 'fastify'
import { prisma } from '../../config/prisma'
import { v4 as uuidv4 } from 'uuid'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!
const BUCKET = 'media'

async function uploadToSupabase(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<string> {
  const path = `${uuidv4()}-${filename}`
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: buffer,
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Error subiendo a Supabase: ${err}`)
  }

  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`
}

function httpError(msg: string, code: number) {
  const e: any = new Error(msg); e.statusCode = code; return e
}

export async function mediaRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] }

  // ── POST /media/upload ────────────────────────────────────────────────────
  app.post('/upload', auth, async (request: any) => {
    const data = await request.file()
    if (!data) throw httpError('No se recibió ningún archivo', 400)

    const isVideo = data.mimetype.startsWith('video/')
    const isImage = data.mimetype.startsWith('image/')
    if (!isVideo && !isImage) throw httpError('Solo imágenes y vídeos', 400)

    const buffer = await data.toBuffer()
    const url = await uploadToSupabase(buffer, data.filename, data.mimetype)

    const media = await prisma.media.create({
      data: {
        ownerId: request.user.sub,
        mediaType: isVideo ? 'VIDEO' : 'IMAGE',
        url,
        sizeBytes: buffer.length,
      },
    })

    return { url, mediaId: media.id }
  })

  // ── POST /media/avatar ────────────────────────────────────────────────────
  app.post('/avatar', auth, async (request: any) => {
    const data = await request.file()
    if (!data) throw httpError('No se recibió ningún archivo', 400)
    if (!data.mimetype.startsWith('image/')) throw httpError('Solo imágenes', 400)

    const buffer = await data.toBuffer()
    const url = await uploadToSupabase(buffer, `avatar-${request.user.sub}.jpg`, data.mimetype)

    // Actualizar avatar según rol
    const user = await prisma.user.findUnique({
      where: { id: request.user.sub },
      select: { role: true },
    })

    if (user?.role === 'PLAYER') {
      await prisma.player.update({ where: { userId: request.user.sub }, data: { avatarUrl: url } })
    } else if (user?.role === 'COACH') {
      await prisma.coach.update({ where: { userId: request.user.sub }, data: { avatarUrl: url } })
    } else if (user?.role === 'CLUB') {
      await prisma.club.update({ where: { userId: request.user.sub }, data: { shieldUrl: url } })
    }

    return { url }
  })

  // ── GET /media/user/:userId ───────────────────────────────────────────────
  app.get('/user/:userId', auth, async (request: any) => {
    const { userId } = request.params as any
    const { type } = request.query as any
    const media = await prisma.media.findMany({
      where: { ownerId: userId, ...(type && { mediaType: type }) },
      orderBy: { createdAt: 'desc' },
    })
    return media
  })

  // ── DELETE /media/:id ─────────────────────────────────────────────────────
  app.delete('/:id', auth, async (request: any) => {
    const { id } = request.params as any
    const media = await prisma.media.findFirst({
      where: { id, ownerId: request.user.sub },
    })
    if (!media) throw httpError('No encontrado', 404)
    await prisma.media.delete({ where: { id } })
    return { success: true }
  })
}
