FROM node:20-alpine

EXPOSE 3000

WORKDIR /app

# Ensure we install all dependencies including devDependencies
ENV NODE_ENV=development

COPY package.json package-lock.json* ./

RUN npm ci && npm cache clean --force

COPY . .

RUN npm run build

# Switch to production for runtime and prune dev deps
ENV NODE_ENV=production
RUN npm prune --production

CMD ["npm", "run", "start"]
