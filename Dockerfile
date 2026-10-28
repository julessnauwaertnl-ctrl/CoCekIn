# CoCekIn has zero runtime npm dependencies (it uses Node's built-in http, crypto and node:sqlite), so the image is tiny.
FROM node:24-slim
ENV NODE_ENV=production PORT=3000 DATABASE_PATH=/data/cocekin.db TRUST_PROXY=true
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY shared ./shared
COPY public ./public
COPY scripts ./scripts
RUN node scripts/build.js && mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
