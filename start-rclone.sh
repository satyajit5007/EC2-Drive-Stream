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