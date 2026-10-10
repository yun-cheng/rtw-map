# The runner as deployed to Cloud Run: the bundle from `npm run build:runner` (the app's assistant code and data
# included), on plain Node. Built from build/runner/, where the bundle and a copy of this file are.
FROM node:22-slim
WORKDIR /app
COPY index.mjs .
ENV NODE_ENV=production
CMD ["node", "index.mjs"]
