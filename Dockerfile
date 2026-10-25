# Production Multi-Stage Dockerfile for Local Connectivity Chit-Fund Platform
# Compliant with Indian Chit Funds Act 1982 & DPDP Act 2023
# Zero external npm dependencies: leverages Node.js 22+ built-in modules

FROM node:22-alpine AS production

# Set working directory
WORKDIR /usr/src/app

# Security: run as non-root node user
RUN mkdir -p /usr/src/app/data && chown -R node:node /usr/src/app

# Copy package descriptors and source code
COPY --chown=node:node package.json ./
COPY --chown=node:node src/ ./src/
COPY --chown=node:node public/ ./public/

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/usr/src/app/data/chitfund.db

# Switch to non-root user
USER node

# Expose HTTP port
EXPOSE 3000

# Healthcheck to ensure API responsiveness
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/localities || exit 1

# Start server
CMD ["node", "src/server.js"]
