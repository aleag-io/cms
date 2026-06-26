FROM node:20-bookworm

ENV DEBIAN_FRONTEND=noninteractive
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    git \
    jq \
    openssh-client \
    postgresql-client \
    unzip \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && mkdir -p /pnpm /workspaces

WORKDIR /workspaces/cms

CMD ["sleep", "infinity"]