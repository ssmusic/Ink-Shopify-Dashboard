FROM node:20-alpine

EXPOSE 3000

WORKDIR /app

# Ensure we install all dependencies including devDependencies
ENV NODE_ENV=development

COPY package.json package-lock.json* ./

RUN npm ci && npm cache clean --force

COPY . .

# Pass build args into Remix build process
ARG SHOPIFY_APP_URL
ARG SHOPIFY_API_KEY
ARG SHOPIFY_API_SECRET
ARG NODE_ENV=production

ENV SHOPIFY_APP_URL=$SHOPIFY_APP_URL
ENV SHOPIFY_API_KEY=$SHOPIFY_API_KEY
ENV SHOPIFY_API_SECRET=$SHOPIFY_API_SECRET
ENV NODE_ENV=$NODE_ENV

RUN npm run build

# Switch to production for runtime and prune dev deps
ENV NODE_ENV=production
RUN npm prune --production

CMD ["npm", "run", "start"]
