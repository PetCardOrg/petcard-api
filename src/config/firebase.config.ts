import { registerAs } from '@nestjs/config';

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true';
}

export const firebaseConfig = registerAs('firebase', () => {
  const enabled = parseBool(process.env.FCM_ENABLED, false);
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (enabled && (!projectId || !clientEmail || !privateKey)) {
    throw new Error(
      'FCM_ENABLED=true requires FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY to be set.',
    );
  }

  return {
    enabled,
    projectId,
    clientEmail,
    privateKey,
  };
});
