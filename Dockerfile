FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
# Install Chromium and its OS dependencies for the Whole Foods Playwright scrape
RUN npx playwright install --with-deps chromium
COPY . .
RUN npm run build
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
VOLUME ["/app/data"]
CMD ["node", "dist/src/index.js"]
