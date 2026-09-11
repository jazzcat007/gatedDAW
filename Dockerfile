FROM node:23-bookworm AS build

ENV CARGO_HOME=/root/.cargo \
    RUSTUP_HOME=/root/.rustup \
    PATH=/root/.cargo/bin:/root/.rustup/bin:$PATH

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates \
        curl \
        git \
        openssl \
        pkg-config \
    && rm -rf /var/lib/apt/lists/*

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --profile minimal --default-toolchain stable \
    && rustup target add wasm32-unknown-unknown \
    && rustup toolchain install nightly --profile minimal \
    && rustup component add rust-src --toolchain nightly

WORKDIR /app

ENV VITE_VJS_USE_LOCAL_SERVER=true \
    VITE_VJS_LOCAL_SERVER_URL=same-origin \
    VITE_VJS_ONLINE_SERVER_URL=same-origin \
    TURBO_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
COPY packages ./packages
COPY crates ./crates
COPY scripts ./scripts
COPY factory-intake ./factory-intake
COPY turbo.json lerna.json ./

# Windows checkouts can carry CRLF despite the scripts being executed by Linux in this image.
RUN find packages scripts -type f -name '*.sh' -exec sed -i 's/\r$//' {} +

RUN npm ci
RUN npm run build

COPY docker-server.mjs ./

RUN mkdir -p certs \
    && openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
        -keyout certs/localhost-key.pem \
        -out certs/localhost.pem \
        -subj "/CN=localhost" \
        -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

EXPOSE 8080

CMD ["node", "docker-server.mjs"]
