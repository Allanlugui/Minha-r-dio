import 'dotenv/config';
import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer } from "ws";
import http from "http";
import cors from "cors";
import path from "path";

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  // Allow the Vercel app to connect
  app.use(cors());
  app.use(express.json());

  const listeners = new Set<express.Response>();

  // WebSocket for receiving broadcast from the studio
  wss.on('connection', (ws, req) => {
    if (req.url === '/broadcast') {
      console.log('Studio broadcaster connected');

      ws.on('message', (data) => {
        // Relay audio chunks to all connected listeners
        listeners.forEach(res => {
          // Write the chunk to the HTTP response
          res.write(data);
        });
      });

      ws.on('close', () => {
        console.log('Studio broadcaster disconnected');
      });
    }
  });

  // HTTP endpoint for listeners (the Vercel app will connect here)
  app.get('/stream', (req, res) => {
    console.log('New listener connected');
    
    res.setHeader('Content-Type', 'audio/webm');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Access-Control-Allow-Origin', '*'); // Allow Vercel app

    listeners.add(res);

    req.on('close', () => {
      console.log('Listener disconnected');
      listeners.delete(res);
    });
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', listeners: listeners.size });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
