FROM node:latest as build-stage
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY ./ .

# Copy the rest of project files into this image
COPY . .

# Expose application port
EXPOSE 5000

# Start the application
CMD npm start