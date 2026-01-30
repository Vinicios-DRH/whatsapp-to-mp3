# ---------- Build stage ----------
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN node ./node_modules/vite/bin/vite.js build

# ---------- Run stage ----------
FROM node:20-alpine
WORKDIR /app

RUN npm i -g serve
COPY --from=build /app/dist ./dist

ENV PORT=3000
EXPOSE 3000

CMD ["sh", "-c", "serve -s dist -l $PORT"]
