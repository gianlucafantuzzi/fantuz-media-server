#!/bin/bash
set -e

echo "Building Server..."
GOOS=darwin GOARCH=amd64 go build -o ../deploy/server/intel_macos/server
GOOS=linux GOARCH=arm64 go build -o ../deploy/server/raspberry_pi/server
