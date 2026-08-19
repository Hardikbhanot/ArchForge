# Build Stage
FROM golang:alpine AS builder

WORKDIR /app

# Install git for downloading dependencies
RUN apk add --no-cache git gcc musl-dev

# Download Go modules
COPY go.mod go.sum ./
RUN go mod download

# Copy the source code
COPY . .

# Build the Go app (disable CGO for smaller static binary if possible, but tree-sitter might need CGO. Let's keep CGO enabled since tree-sitter parsers use C)
ENV CGO_ENABLED=1
RUN go build -o archforge-api ./cmd/server

# Final Stage
FROM alpine:latest

WORKDIR /app

# Install runtime dependencies for CGO (tree-sitter needs libgcc/libstdc++) and git for cloning repos
RUN apk add --no-cache libgcc libstdc++ ca-certificates git

# Copy the pre-built binary file from the previous stage
COPY --from=builder /app/archforge-api .

# Create necessary directories for local SQLite/Vector DB/IR storage
RUN mkdir -p /app/data/embeddings /app/data/ir /app/data/repositories

# Expose port 8080
EXPOSE 8080

# Run the executable
CMD ["./archforge-api"]
