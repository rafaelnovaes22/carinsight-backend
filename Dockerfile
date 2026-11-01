FROM node:20-alpine
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts || npm install --ignore-scripts
COPY . .
RUN npx prisma generate || true
RUN npm run build || echo "no build"
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["node", "dist/src/main.js"]
