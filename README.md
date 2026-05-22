# ☁️ EC2 Drive Stream

> **Self-hosted Stremio Addon** — Stream Movies & TV Shows directly from your cloud drives (Google Drive, pCloud, and more) running on an EC2 instance behind DuckDNS + Nginx.

<p align="center">
  <img src="https://img.shields.io/badge/Stremio-Addon-blue?style=for-the-badge&logo=stremio" />
  <img src="https://img.shields.io/badge/Node.js-18+-green?style=for-the-badge&logo=nodedotjs" />
  <img src="https://img.shields.io/badge/rclone-Multi--Drive-purple?style=for-the-badge&logo=rclone" />
  <img src="https://img.shields.io/badge/Nginx-Reverse%20Proxy-009639?style=for-the-badge&logo=nginx" />
  <img src="https://img.shields.io/badge/DuckDNS-Dynamic%20DNS-orange?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Let's%20Encrypt-Free%20SSL-003A70?style=for-the-badge&logo=letsencrypt" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" />
</p>

---

## 🗺️ Architecture Overview

```
┌───────────────────────────────────────────────────────────── ┐
│                        EC2 Instance                          |
│                                                              │
│   ┌───────────┐    ┌────────────────────────────────────┐    │
│   │  DuckDNS  │───▶│           Nginx (Port 80/443)     |    |
│   │  (DDNS)   │    │         Reverse Proxy + SSL        │    │
│   └───────────┘    └──────────────┬─────────────────────┘    │
│                                   │                          │
│                    ┌──────────────▼─────────────────────┐    │
│                    │     ec2-drive-stream (Port 7000)    │   │
│                    │         Stremio Addon SDK           │   │
│                    └──────────────┬─────────────────────┘    │
│                                   │                          │
│          ┌────────────────────────┼──────────────────┐       │
│          ▼                        ▼                   ▼      │
│  ┌──────────────┐      ┌──────────────┐     ┌──────────────┐ │
│  │  rclone HTTP │      │  rclone HTTP │     │  rclone HTTP │ │
│  │  pCloud 1    │      │  Google Drive│     │  pCloud 2    │ │
│  │  :8085       │      │  :8086       │     │  :8087       │ │
│  └──────┬───────┘      └──────┬───────┘     └──────┬───────┘ │
│         │                     │                    │         │
└─────────┼─────────────────────┼────────────────────┼──────── ┘
          ▼                     ▼                    ▼
     ☁️ pCloud 1          ☁️ Google Drive       ☁️ pCloud 2
```
---

---

# 🏗️ Architecture

```text
Google Drive / pCloud
          │
          ▼
     rclone serve http
          │
          ▼
     Node.js Addon
      localhost:7000
          │
          ▼
         Nginx
     Reverse Proxy
          │
          ▼
      DuckDNS Domain
          │
          ▼
      HTTPS + SSL
          │
          ▼
        Stremio
```

---

## ✨ Features

- 🎬 **Auto-Scan** — Recursively scans `/movies/` and `/tvs/` folders from all configured rclone servers
- 📁 **Multi-Drive** — Supports unlimited rclone remotes via comma-separated `.env` config (pCloud 1, Google Drive, pCloud 2 out of the box)
- 🏷️ **Rich Metadata** — Parses filenames for resolution, codec, HDR, audio, languages, and file size
- 🎨 **Beautiful UI** — Clean icons (🎬 🎧 💾 🗣️ 📁) in stream titles for instant quality info
- 🔄 **Auto-Refresh** — Library auto-refreshes every 10 minutes
- 🌐 **DuckDNS** — Free dynamic DNS so Stremio can always reach your EC2 instance
- 🔒 **Nginx Proxy** — Reverse proxy with optional HTTPS/SSL via Let's Encrypt
- 🔐 **GitHub-Safe** — All private IPs/ports live in `.env`, never committed

---

## 📸 Preview

| Movies Catalog | Rich Stream Details |
|:--:|:--:|
| Movies scraped with clean titles | Tech specs parsed from filename |

| Series Support | Episode Details |
|:--:|:--:|
| TV Shows with season/episode detection | Same rich metadata per episode |

---

## 📁 Project Structure

```
ec2-drive-stream/
├── server.js             # Main addon server (Stremio SDK)
├── start-rclone.sh       # Starts all 3 rclone HTTP servers
├── .env.example          # Safe template for GitHub
├── package.json
└── README.md
```

---

## 🚀 Full Setup Guide

### Prerequisites

- Ubuntu EC2 instance (t2.micro or better)
- `rclone` configured with your cloud drives
- `node` v18+, `npm`, `nginx`, `pm2`
- A free [DuckDNS](https://www.duckdns.org) account

---

### Step 1 — Configure rclone Remotes

If you haven't already, authenticate your drives:

```bash
# Interactive config — follow prompts for each remote
rclone config
```

You should end up with three remotes: `pcloud1`, `gdrive`, `pcloud2`.  
Verify with:

```bash
rclone listremotes
# pcloud1:
# gdrive:
# pcloud2:
```

---

### Step 2 — Start rclone HTTP Servers

Create the startup script at `~/start-rclone.sh`:

```bash
#!/bin/bash

echo "Starting all rclone servers..."

# pCloud 1
mkdir -p ~/rcloneS/pcloud1/cache
rclone serve http pcloud1: \
  --addr 127.0.0.1:8085 \
  --vfs-cache-mode writes \
  --vfs-read-ahead 64M \
  --buffer-size 32M \
  --dir-cache-time 12h \
  --cache-dir ~/rcloneS/pcloud1/cache &

# Google Drive
mkdir -p ~/rcloneS/gdrive/cache
rclone serve http gdrive: \
  --addr 127.0.0.1:8086 \
  --vfs-cache-mode writes \
  --vfs-read-ahead 64M \
  --buffer-size 32M \
  --dir-cache-time 12h \
  --cache-dir ~/rcloneS/gdrive/cache &

# pCloud 2
mkdir -p ~/rcloneS/pcloud2/cache
rclone serve http pcloud2: \
  --addr 127.0.0.1:8087 \
  --vfs-cache-mode writes \
  --vfs-read-ahead 64M \
  --buffer-size 32M \
  --dir-cache-time 12h \
  --cache-dir ~/rcloneS/pcloud2/cache &

echo "All rclone servers started on localhost ports 8085, 8086, 8087!"
```

Make it executable and run it:

```bash
chmod +x ~/start-rclone.sh
~/start-rclone.sh
```

> **Note:** All three servers bind to `127.0.0.1` (localhost only) for security. Nginx exposes them publicly.

#### rclone Flags Explained

| Flag | Value | Purpose |
|------|-------|---------|
| `--addr` | `127.0.0.1:PORT` | Bind to localhost only (not exposed directly) |
| `--vfs-cache-mode` | `writes` | Cache writes locally; reads stream from cloud |
| `--vfs-read-ahead` | `64M` | Pre-buffers 64 MB ahead for smooth playback |
| `--buffer-size` | `32M` | In-memory transfer buffer per file |
| `--dir-cache-time` | `12h` | Cache directory listings for 12 hours |
| `--cache-dir` | `~/rcloneS/*/cache` | Dedicated cache folder per drive |

#### Auto-start rclone with PM2

```bash
pm2 start ~/start-rclone.sh --name "rclone-servers" --interpreter bash
pm2 save
```

---

### Step 3 — Create a DuckDNS Domain

1. Open [duckdns.org](https://www.duckdns.org) and log in with **Google** or **GitHub**
2. Create a subdomain — for example: `mystremioaddon`
3. You get a free domain instantly:
   ```
   mystremioaddon.duckdns.org
   ```

---

### Step 4 — Point DuckDNS to Your EC2 Public IP

In your DuckDNS dashboard, set the **IP** field to your EC2 public IP and click **Save**.

Verify it resolves correctly:

```bash
ping mystremioaddon.duckdns.org
# Should resolve to your EC2 public IP
```

#### Auto-Update IP (Cron)

EC2 public IPs can change on reboot. Set up a cron to keep DuckDNS in sync:

```bash
mkdir -p ~/duckdns
cat > ~/duckdns/duck.sh << 'EOF'
echo url="https://www.duckdns.org/update?domains=YOUR_SUBDOMAIN&token=YOUR_TOKEN&ip=" | curl -k -o ~/duckdns/duck.log -K -
EOF

chmod +x ~/duckdns/duck.sh

# Add to crontab — updates every 5 minutes
crontab -e
# Append this line:
# */5 * * * * ~/duckdns/duck.sh >/dev/null 2>&1
```

> Replace `YOUR_SUBDOMAIN` and `YOUR_TOKEN` with your actual DuckDNS values.

---

### Step 5 — Install Nginx

```bash
sudo apt update
sudo apt install nginx -y
```

---

### Step 6 — Create Nginx Reverse Proxy

```bash
sudo nano /etc/nginx/sites-available/stremio
```

Paste the following config (replace the domain with yours):

```nginx
server {
    listen 80;
    server_name mystremioaddon.duckdns.org;

    location / {
        proxy_pass         http://127.0.0.1:7000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the config and restart Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/stremio /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

### Step 7 — Open EC2 Security Group Ports

In your AWS EC2 console → **Security Groups** → **Inbound Rules**, allow:

| Type  | Protocol | Port |
|-------|----------|------|
| HTTP  | TCP      | 80   |
| HTTPS | TCP      | 443  |

---

### Step 8 — Install SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d mystremioaddon.duckdns.org
```

When prompted, choose **option 2 → Redirect HTTP to HTTPS**.

Certbot auto-patches your Nginx config and handles renewal. Test the renewal process:

```bash
sudo certbot renew --dry-run
```

---

### Step 9 — Install & Configure the Addon

```bash
git clone https://github.com/satyajit5007/ec2-drive-stream.git
cd ec2-drive-stream
npm install
```

Create your `.env` file:

```bash
# .env
PORT=7000
DRIVES=http://127.0.0.1:8085,http://127.0.0.1:8086,http://127.0.0.1:8087
```

#### ⚠️ Critical: Node.js Must Listen on `0.0.0.0`

Your addon server must bind to `0.0.0.0` so Nginx can reach it — **not** `127.0.0.1`:

```javascript
// ✅ Correct — Nginx can proxy to this
builder.getInterface().listen(7000, "0.0.0.0");

// ❌ Wrong — Nginx cannot reach a loopback-only bind
builder.getInterface().listen(7000, "127.0.0.1");
```

---

### Step 10 — Run with PM2

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start the addon
pm2 start server.js --name "stremio-addon"

# Persist across reboots
pm2 save
pm2 startup
```

Useful PM2 commands:

```bash
pm2 status                   # Check all processes
pm2 logs stremio-addon       # Live logs
pm2 restart stremio-addon    # Restart after changes
```

---

### Step 11 — Verify Everything Works

Test locally on the EC2 instance:

```bash
curl http://localhost:7000/manifest.json
```

Test publicly from any machine:

```bash
curl https://mystremioaddon.duckdns.org/manifest.json
# Should return your JSON manifest
```

---

### Step 12 — Add to Stremio

1. Open **Stremio** → Settings → Addons
2. Click **"Add Addon"**
3. Paste your manifest URL:
   ```
   https://mystremioaddon.duckdns.org/manifest.json
   ```
4. Click **Install** ✅

> **Result:** Your addon is now live at a permanent HTTPS URL, fully supported by Stremio.

---

## ⚙️ Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | ✅ | Port to run the addon server (default: `7000`) |
| `DRIVES` | ✅ | Comma-separated list of rclone HTTP server URLs |

### Expected Directory Layout on Each Drive

```
http://127.0.0.1:PORT/
├── movies/
│   ├── Movie.Name.2024.1080p.BluRay.x265.mkv
│   └── ...
└── tvs/
    ├── Show Name/
    │   ├── Season 1/
    │   │   ├── Show.Name.S01E01.WEB-DL.mkv
    │   │   └── ...
    │   └── ...
    └── ...
```

---

## 📝 Filename Parsing

The addon automatically detects these tags from your filenames:

| Tag | Examples Detected |
|-----|-------------------|
| **Resolution** | `2160p`, `1080p`, `720p`, `480p` |
| **Source** | `BluRay REMUX`, `WEB-DL`, `HDRip`, `HDTV` |
| **Codec** | `HEVC`, `x265`, `x264`, `AVC` |
| **HDR** | `HDR10`, `HDR`, `DV` (Dolby Vision) |
| **Audio** | `Atmos`, `TrueHD`, `DD+`, `DTS-HD` |
| **Languages** | Extracted from `[Hindi + English]` brackets |
| **Size** | Scraped from directory listing table |

---

## 🛠️ Tech Stack

| Technology | Role |
|-----------|------|
| [Node.js](https://nodejs.org/) | Runtime |
| [Stremio Addon SDK](https://github.com/Stremio/stremio-addon-sdk) | Addon framework |
| [Axios](https://axios-http.com/) | HTTP requests to rclone servers |
| [Cheerio](https://cheerio.js.org/) | HTML scraping of directory listings |
| [dotenv](https://github.com/motdotla/dotenv) | Environment config |
| [rclone](https://rclone.org/) | Cloud storage HTTP servers |
| [Nginx](https://nginx.org/) | Reverse proxy & SSL termination |
| [Let's Encrypt](https://letsencrypt.org/) + Certbot | Free auto-renewing SSL certificate |
| [DuckDNS](https://www.duckdns.org/) | Free dynamic DNS |
| [PM2](https://pm2.keymetrics.io/) | Process management & auto-restart |

---

## 🔐 GitHub Safety

This repo is **public-safe by design**:

- ✅ `.gitignore` blocks `.env` and `node_modules`
- ✅ `.env.example` shows the format without real IPs or tokens
- ✅ All rclone servers bind to `127.0.0.1` — never directly exposed
- ✅ DuckDNS tokens stay in cron scripts on your server only

**⚠️ Never commit your `.env` file or DuckDNS token!**

---

## 🧩 Adding More Drives

No code changes needed. Just:

1. Configure a new rclone remote:
   ```bash
   rclone config  # add e.g. pcloud3:
   ```
2. Add it to `start-rclone.sh`:
   ```bash
   mkdir -p ~/rcloneS/pcloud3/cache
   rclone serve http pcloud3: \
     --addr 127.0.0.1:8088 \
     --vfs-cache-mode writes \
     --vfs-read-ahead 64M \
     --buffer-size 32M \
     --dir-cache-time 12h \
     --cache-dir ~/rcloneS/pcloud3/cache &
   ```
3. Append to `.env`:
   ```bash
   DRIVES=http://127.0.0.1:8085,http://127.0.0.1:8086,http://127.0.0.1:8087,http://127.0.0.1:8088
   ```
4. Restart:
   ```bash
   pm2 restart all
   ```

---

## 🐛 Troubleshooting

| Problem | Fix |
|---------|-----|
| Manifest not loading in Stremio | Check `pm2 logs stremio-addon` — is port 7000 running? |
| Nginx 502 Bad Gateway | Ensure the addon is running: `pm2 status` |
| Nginx can't reach Node.js | Make sure server listens on `0.0.0.0`, not `127.0.0.1` |
| Drive shows empty catalog | Verify rclone server: `curl http://127.0.0.1:8085/movies/` |
| DuckDNS domain not resolving | Run `~/duckdns/duck.sh` manually and check `duck.log` |
| SSL cert expired | Run `sudo certbot renew` and `sudo systemctl reload nginx` |
| HTTP not redirecting to HTTPS | Re-run certbot: `sudo certbot --nginx -d yourdomain.duckdns.org` |
| rclone server keeps stopping | Use PM2: `pm2 start ~/start-rclone.sh --interpreter bash` |
| EC2 ports blocked | Add inbound rules for ports **80** and **443** in your Security Group |

---

## 📜 License

MIT — Free to use, modify, and distribute.

---

<p align="center">
  Made with ☁️ for the self-hosted streaming community.<br/>
  <strong>EC2 + rclone + Nginx + Let's Encrypt + DuckDNS + Stremio = 🎬 Your private Drive Stream</strong>
</p>
