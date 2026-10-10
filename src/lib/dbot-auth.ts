/** The D-bot control service is the sole trusted adapter for admitted Slack tasks. */
import { OAuth2Client } from 'google-auth-library'

const verifier = new OAuth2Client()

export async function verifyDbotCaller(header: string | null): Promise<boolean> {
  const audience = process.env.DBOT_ID_TOKEN_AUDIENCE?.trim()
  const account = process.env.DBOT_SERVICE_ACCOUNT?.trim()
  if (process.env.DBOT_ENABLED !== '1' || !audience || !account || !header?.startsWith('Bearer ')) return false
  try {
    const ticket = await verifier.verifyIdToken({ idToken: header.slice(7), audience })
    const claims = ticket.getPayload()
    return claims?.email_verified === true && claims.email === account && /^\d{1,40}$/.test(claims.sub)
  } catch { return false }
}
