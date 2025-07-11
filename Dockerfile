FROM node:18-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Create data directory
RUN mkdir -p /app/data

# Set NODE_ENV to production
ENV NODE_ENV=production

# Read version from package.json and set as environment variable
RUN VERSION=$(node -e "console.log(require('./package.json').version)") \
    && echo "VERSION=$VERSION" > /app/.version

# Expose the Discord bot webhook port
EXPOSE 5000

# Start the application
CMD ["node", "src/bot/index.js"]
