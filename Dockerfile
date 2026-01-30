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

RUN npm i -g http-server
COPY --from=build /app/dist ./dist

ENV PORT=3000
EXPOSE 3000

CMD ["sh", "-c", "http-server dist -p ${PORT:-3000} -a 0.0.0.0"]


