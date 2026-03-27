import { auth } from '../firebase';

export async function getBearerAuthHeaders(
  baseHeaders: Record<string, string> = {}
): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('Missing authenticated session token.');
  }

  return {
    ...baseHeaders,
    Authorization: `Bearer ${token}`,
  };
}
