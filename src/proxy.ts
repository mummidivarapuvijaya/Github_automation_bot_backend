
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();
const PORT = 5001;

// Proxy middleware configuration
const proxy = createProxyMiddleware({
  target: 'http://localhost:5000',
  changeOrigin: true,
  pathRewrite: {
    '^/api': '/api',  // rewrite path
  },
});

// Use the proxy for all requests
app.use('/', proxy);

app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
  console.log(`Public URL: http://localhost:${PORT}`);
});
