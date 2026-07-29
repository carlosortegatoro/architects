import { fileURLToPath } from 'node:url'
import path from 'node:path'
import express from 'express'
import cookieParser from 'cookie-parser'
import authRouter from './routes/auth.js'
import diagramsRouter from './routes/diagrams.js'
import { authedShareRouter, publicShareRouter } from './routes/share.js'

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

if (process.env.NODE_ENV === 'production') {
  const distDir = path.join(dirname, '..', '..', 'dist')
  app.use(express.static(distDir))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`)
})
