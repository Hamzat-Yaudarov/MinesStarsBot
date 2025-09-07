FROM node:18-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN apk add --no-cache python3 py3-pip && ln -sf /usr/bin/python3 /usr/bin/python
RUN npm install --production
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/bot.js"]
