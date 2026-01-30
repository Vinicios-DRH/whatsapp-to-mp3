# ---------- Build stage ----------
FROM node:20-alpine AS build
WORKDIR /app

# Instala dependências
COPY package*.json ./
RUN npm ci

# Copia o resto e builda
COPY . .
RUN npm run build

# ---------- Run stage ----------
FROM node:20-alpine
WORKDIR /app

# Servidor estático
RUN npm i -g serve

# Copia o build final
COPY --from=build /app/dist ./dist

# Railway injeta $PORT
ENV PORT=3000
EXPOSE 3000

CMD ["sh", "-c", "serve -s dist -l $PORT"]
