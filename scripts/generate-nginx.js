#!/usr/bin/env node

/**
 * Plex Transfer Manager - Nginx Configuration Generator
 *
 * This script reads the nginx configuration from config.json
 * and generates a complete nginx.conf file.
 *
 * Usage:
 *   node scripts/generate-nginx.js > nginx.conf
 *   # or
 *   npm run generate-nginx > nginx.conf
 */

const fs = require('fs');
const path = require('path');

// Read configuration
const configPath = path.join(__dirname, '../backend/src/config/config.json');

if (!fs.existsSync(configPath)) {
  console.error('Error: config.json not found at', configPath);
  console.error('Please ensure you have copied sample-config.json to src/config/config.json');
  process.exit(1);
}

let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
  console.error('Error reading config.json:', error.message);
  process.exit(1);
}

if (!config.nginx) {
  console.error('Error: nginx configuration not found in config.json');
  console.error('Please add an nginx section to your config.json');
  process.exit(1);
}

const nginx = config.nginx;

// Generate nginx configuration
const nginxConfig = `# Nginx configuration for Plex Transfer Manager
# Generated from config.json on ${new Date().toISOString()}
# Place this in /etc/nginx/sites-available/plextransfer and symlink to sites-enabled

server {
    listen ${nginx.ssl?.enabled ? '443 ssl' : nginx.port || 80};
    ${nginx.serverName ? `server_name ${nginx.serverName};` : 'server_name _;'}

    ${nginx.ssl?.enabled ? `
    ssl_certificate ${nginx.ssl.cert};
    ssl_certificate_key ${nginx.ssl.key};
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;` : ''}

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

    # Root directory for static files
    root ${nginx.root || '/var/www/html/plex'};
    index index.html;

    # Handle static assets with caching
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # Proxy API requests to backend
    location /api/ {
        proxy_pass ${nginx.backendUrl || 'http://localhost:3001'};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Proxy WebSocket connections
    location /socket.io/ {
        proxy_pass ${nginx.backendUrl || 'http://localhost:3001'};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Handle React Router (SPA routing)
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        add_header Expires "0";
    }

    # Security: Don't serve dotfiles
    location ~ /\\. {
        deny all;
    }

    # Logs
    access_log ${nginx.accessLog || '/var/log/nginx/plextransfer_access.log'};
    error_log ${nginx.errorLog || '/var/log/nginx/plextransfer_error.log'};
}
`;

// Output the configuration
console.log(nginxConfig);
