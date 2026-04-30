FROM node:22.22.2-alpine

# Pin pnpm via npm — same version as package.json's ``packageManager`` field
# and the CI workflow. Bumping in one place means bumping in all three.
RUN npm install -g pnpm@10.33.2

WORKDIR /app

# Install dependencies. ``--frozen-lockfile`` matches CI behaviour: refuses
# to update ``pnpm-lock.yaml`` if package.json has drifted, so a missing
# rebuild surfaces as a build failure instead of silently shipping a
# different dependency graph.
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

EXPOSE 3000

CMD ["pnpm", "run", "dev", "--", "--host", "0.0.0.0"]
