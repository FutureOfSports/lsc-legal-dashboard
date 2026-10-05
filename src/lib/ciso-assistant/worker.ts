/** A human delivery request launches the isolated worker. No recurring schedule is installed. */
import 'server-only'
import { GoogleAuth } from 'google-auth-library'

export async function requestCisoDelivery(): Promise<void> {
  const job = process.env.CISO_ASSISTANT_SYNC_JOB
  if (process.env.CISO_ASSISTANT_ENABLED !== '1' || !job
    || !/^projects\/[a-z][a-z0-9-]+\/locations\/[a-z]+-[a-z]+[0-9]\/jobs\/[a-z][a-z0-9-]+$/.test(job)) {
    throw new Error('CISO delivery worker is not configured.')
  }
  try {
    const client = await new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).getClient()
    const response = await client.request<{ name?: string }>({ url: `https://run.googleapis.com/v2/${job}:run`,
      method: 'POST', data: {}, timeout: 15_000, retry: false })
    if (typeof response.data.name !== 'string' || !response.data.name.includes('/operations/')) throw new Error('Invalid worker receipt')
  } catch { throw new Error('CISO delivery could not be started. The queued request is retained.') }
}
