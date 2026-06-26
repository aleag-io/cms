FROM node:24-bookworm

ENV DEBIAN_FRONTEND=noninteractive

RUN npm install -g npm@latest

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    docker.io \
    git \
    jq \
    openssh-client \
    postgresql-client \
    unzip \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /workspaces

WORKDIR /workspaces/cms

CMD ["sleep", "infinity"]
