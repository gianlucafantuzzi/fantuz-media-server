echo "Creating docker environment..."
docker build -t rpi-builder -f Dockerfile.build .

echo "Building Server..."
docker run --rm -v "$PWD":/app -w /app/server rpi-builder go build -o ../deploy/server/raspberry_pi/server

echo "Building Player..."
docker run --rm -v "$PWD":/app -w /app/player rpi-builder go build -o ../deploy/player/raspberry_pi/player

(cd frontend && ./build.sh)

echo "Build complete."
