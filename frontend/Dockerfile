FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
# Backend upstream is env-driven so the same image runs in docker-compose
# (backend:3000) and Azure Container Apps (app-name:80). The stock nginx
# entrypoint renders /etc/nginx/templates/*.template with envsubst at start.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
ENV BACKEND_HOST=backend
ENV BACKEND_PORT=3000
EXPOSE 80
