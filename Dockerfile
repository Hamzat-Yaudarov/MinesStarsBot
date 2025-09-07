FROM node:18-bullseye

# Install python and build tools for native modules
RUN apt-get update \
  && apt-get install -y python3 build-essential make g++ \
  && ln -sf /usr/bin/python3 /usr/bin/python \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production

COPY . .

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/bot.js"]
