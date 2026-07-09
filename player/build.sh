#!/bin/bash
set -e

echo "Building Player..."
CGO_ENABLED=1 GOOS=darwin GOARCH=amd64 go build -o ../deploy/player/intel_macos/player

