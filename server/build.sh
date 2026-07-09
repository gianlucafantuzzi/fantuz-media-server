#!/bin/bash
set -e

echo "Building Server..."
GOOS=darwin GOARCH=amd64 go build -o ../deploy/server/intel_macos/server
