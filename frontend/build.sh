#!/bin/bash
set -e

echo "Building Frontend..."
npm run build
mkdir -p ../deploy/frontend
rm -rf ../deploy/frontend/*
cp -r dist/* ../deploy/frontend/
