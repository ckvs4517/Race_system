/** Cloudflare Worker entry point: static assets + API coordination only. */
import { handleApiRequest } from './routes/api.js';
import { json } from './routes/responses.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    try {
      return await handleApiRequest(request, env, url);
    } catch (error) {
      if (String(error?.message || '').includes('UNIQUE')) return json({ error: '這位選手已經送出過報名。' }, 409);
      if (String(error?.message || '').startsWith('Invalid registration:')) return json({ error: String(error.message).slice(22) }, 400);
      console.error(error);
      return json({ error: '伺服器發生錯誤，請稍後再試。' }, 500);
    }
  },
};
