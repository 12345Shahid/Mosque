const { server, app } = require('../server/index');

// Vercel Serverless Function entrypoint
// Exports the Node HTTP Server to enable both HTTP routes and WebSocket connections on Vercel Fluid Compute
module.exports = server;
