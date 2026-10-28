import { createApp } from './app.js';

const { server, config, close } = createApp();
server.listen(config.port, config.host, () => {
  console.log(`CoCekIn listening on http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port} (${config.isProd ? 'production' : 'development'})`);
  if (!config.cocToken) console.log('Note: COC_API_TOKEN not set, so account verification / stat sync are disabled (stats show as self-reported).');
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { console.log(`\n${sig} received, shutting down`); close(); process.exit(0); });
