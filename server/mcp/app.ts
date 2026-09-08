import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js'
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { mcpTokenVerifier } from '../lib/mcpAuth.js'
import { buildMcpServer } from './server.js'

const HEROKU_HOST = 'cot-architectures-f99ad2300e12.herokuapp.com'

export function createMcpApp() {
  const app = createMcpExpressApp(
    process.env.NODE_ENV === 'production' ? { allowedHosts: [HEROKU_HOST] } : undefined,
  )

  app.post('/', requireBearerAuth({ verifier: mcpTokenVerifier }), async (req, res) => {
    const server = buildMcpServer(req.auth!.extra as { userId: string; email: string; authVersion: number })
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
    res.on('close', () => {
      transport.close()
      server.close()
    })
  })

  app.get('/', (_req, res) => {
    res.writeHead(405).end(
      JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null }),
    )
  })

  app.delete('/', (_req, res) => {
    res.writeHead(405).end(
      JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null }),
    )
  })

  return app
}
