#!/bin/bash
set -e

echo "Building Player..."
CGO_ENABLED=1 GOOS=darwin GOARCH=amd64 go build -o ../deploy/player/intel_macos/player

if command -v aarch64-linux-gnu-gcc >/dev/null; then
  CC=aarch64-linux-gnu-gcc CGO_ENABLED=1 GOOS=linux GOARCH=arm64 \
    go build -o ../deploy/player/raspberry_pi/player
else
  echo "Skipping raspberry_pi player build: aarch64-linux-gnu-gcc not found"
fi
