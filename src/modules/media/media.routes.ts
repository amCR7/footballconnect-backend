import { FastifyInstance } from 'fastify'
import { prisma } from '../../config/prisma'
import { v4 as uuidv4 } from 'uuid'

async function uploadToR2(buffer: Buffer, key: string, contentType: string): Promise<string> {
  const accountId = process.env.R2_ACCOUNT_ID!
  const bucket = process.env.R2_BUCKET_NAME!
  const accessKey = process.env.R2_ACCESS_KEY_ID!
  const secretKey = process.env.R2_SECRET_ACCESS_KEY!
  const publicUrl = process.env.R2_PUBLIC_URL!

  // Firma AWS S3 compatible para R2
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`

  const response = await fetch(endpoint, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'Content-Length': buffer.length.toString(),
      'x-amz-access-key-id': accessKey,
      'x-amz-secret-access-key': secretKey,
    },
    body: buffer,
  })

  if (!response.ok) throw new Error('Error subiendo archivo a R2')
  return `${publicUrl}/${key}`
}

export async function mediaRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] }

  // ── POST /media/upload ────────────────────────────────────────────────────
  app.post('/upload', auth, async (request: any) => {
    const data = await request.file()
    if (!data) {
      const e: any = new Error('No se recibió ningún archivo'); e.statusCode = 400; throw e
    }

    const isVideo = data.mimetype.startsWith('video/')
    const isImage = data.mimetype.startsWith('image/')
    if (!isVideo && !isImage) {
      const e: any = new Error('Solo se permiten imágenes y vídeos'); e.statusCode = 400; throw e
    }

    const ext = data.filename.split('.').pop()
    const key = `${request.user.sub}/${uuidv4()}.${ext}`
    const buffer = await data.toBuffer()

    const url = await uploadToR2(buffer, key, data.mimetype)

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

  // ── GET /media/user/:userId ───────────────────────────────────────────────
  app.get('/user/:userId', auth, async (request: any) => {
    const { userId } = request.params
    const { type } = request.query as any

    const media = await prisma.media.findMany({
      where: {
        ownerId: userId,
        ...(type && { mediaType: type }),
      },
      orderBy: { createdAt: 'desc' },
    })

    return media
  })

  // ── DELETE /media/:id ─────────────────────────────────────────────────────
  app.delete('/:id', auth, async (request: any) => {
    const { id } = request.params
    const media = await prisma.media.findFirst({
      where: { id, ownerId: request.user.sub },
    })
    if (!media) {
      const e: any = new Error('No encontrado'); e.statusCode = 404; throw e
    }

    await prisma.media.delete({ where: { id } })
    return { success: true }
  })
}
