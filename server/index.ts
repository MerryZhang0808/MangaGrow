import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { initDb } from './db/schema.js';
import { ensureDirectories } from './services/imageStorage.js';
import aiRoutes from './routes/ai.js';
import characterRoutes from './routes/characters.js';
import storyRoutes from './routes/stories.js';
import imageRoutes from './routes/images.js';

// Load env from project root
dotenv.config({ path: '../.env' });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Initialize database and image directories
initDb();
ensureDirectories();

// Routes
app.use('/api/ai', aiRoutes);
app.use('/api/characters', characterRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/images', imageRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

// Start server
app.listen(PORT, () => {
  console.log(`[Server] MangaGrow backend running on http://localhost:${PORT}`);
});

export default app;
