import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import authRoutes from './routes/auth.routes.js';
import debugRoutes from './routes/debug.routes.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);

if (process.env.NODE_ENV !== 'production') {
  app.use('/api/_debug', debugRoutes);
}

app.use(notFound);
app.use(errorHandler);

export default app;