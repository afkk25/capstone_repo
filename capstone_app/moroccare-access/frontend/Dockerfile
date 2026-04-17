FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=${VITE_API_URL}

EXPOSE 3000

CMD ["sh", "-c", "npm run build && npm run preview -- --port 3000 --host 0.0.0.0"]
