# Use the Node.js LTS version
FROM node:18-alpine

# Create and set the working directory
WORKDIR /app

# Copy the package.json and package-lock.json files to install dependencies
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the project files
COPY . .

# Run the build command
RUN npm run build

# Expose the application port (change 8080 to your desired port if needed)
EXPOSE 8080

# Run the application
CMD ["npm", "start"]
