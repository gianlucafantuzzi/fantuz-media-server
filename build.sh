#!/bin/bash
set -e

(cd server && ./build.sh)
(cd player && ./build.sh)
(cd frontend && ./build.sh)

echo "Build complete."
