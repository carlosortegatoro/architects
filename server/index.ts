import { fileURLToPath } from 'node:url'
import path from 'node:path'
import express, { type ErrorRequestHandler } from 'express'
import cookieParser from 'cookie-parser'
import authRouter from './routes/auth.js'
import diagramsRouter from './routes/diagrams.js'
import { authedShareRouter, publicShareRouter } from './routes/share.js'
import { createMcpApp } from './mcp/app.js'

const app = express()
const port = process.env.PORT ?? 3001
const dirname = path.dirname(fileURLToPath(import.meta.url))

app.set('trust proxy', 1)
app.use(express.json())
app.use(cookieParser())

app.use('/api/auth', authRouter)
app.use('/api/diagrams', diagramsRouter)
app.use('/api/diagrams', authedShareRouter)
app.use('/api/share', publicShareRouter)
app.use('/mcp', createMcpApp())

if (process.env.NODE_ENV === 'production') {
  const distDir = path.join(dirname, '..', '..', 'dist')
  app.use(express.static(distDir))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  console.error(error)
  if (res.headersSent) {
    next(error)
    return
  }
  res.status(500).json({ error: 'Internal server error' })
}
app.use(errorHandler)

app.listen(port, () => {
  console.log(`Server listening on port ${port}`)
})
