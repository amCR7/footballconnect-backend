import admin from 'firebase-admin'

let app: admin.app.App

export function getFirebaseApp(): admin.app.App {
  if (!app) {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

    app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
    })
  }
  return app
}

export async function sendPushNotification({
  fcmToken,
  title,
  body,
  data = {},
}: {
  fcmToken: string
  title: string
  body: string
  data?: Record<string, string>
}) {
  try {
    const messaging = getFirebaseApp().messaging()
    await messaging.send({
      token: fcmToken,
      notification: { title, body },
      data,
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'footballconnect_messages',
        },
      },
    })
  } catch (err) {
    // No lanzar error si falla la notificación — no es crítico
    console.error('FCM error:', err)
  }
}
