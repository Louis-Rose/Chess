import axios from 'axios';

// The fit app uses the shared lumna.co session (see contexts/AuthContext).
// This helper runs a fit API call and, on a 401, attempts one refresh of the
// main session then retries once.
export async function fitRequest<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 401) {
      await axios.post('/api/auth/refresh'); // throws if the refresh is invalid
      return await fn();
    }
    throw e;
  }
}
