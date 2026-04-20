interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env) {
    // Fall back to serving static assets
    return env.ASSETS.fetch(request);
  },
};
