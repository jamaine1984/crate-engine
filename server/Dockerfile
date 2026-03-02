FROM node:20-slim
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY multiplayer.mjs .
EXPOSE 8860
CMD ["node", "multiplayer.mjs"]
