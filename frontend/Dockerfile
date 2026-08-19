# Build Stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build the Angular application for production
RUN npm run build --configuration=production

# Final Stage - Nginx
FROM nginx:alpine

# Copy the compiled Angular artifacts to the Nginx html directory
# In Angular 17+, the build output is usually in dist/<project-name>/browser
COPY --from=builder /app/dist/frontend/browser /usr/share/nginx/html

# Custom Nginx configuration to route all traffic to index.html (for Angular routing)
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
