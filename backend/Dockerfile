FROM node:20

# Install Chrome and dependencies
RUN apt-get update \
    && apt-get install -y wget gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/googlechrome-linux-keyring.gpg \
    && sh -c 'echo "deb [arch=amd64 signed-by=/usr/share/keyrings/googlechrome-linux-keyring.gpg] https://dl-ssl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-khmeros fonts-kacst fonts-freefont-ttf libxss1 dbus dbus-x11 --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r pptruser && useradd -rm -g pptruser -G audio,video pptruser

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

USER pptruser
WORKDIR /home/pptruser/app

# Ensure HOME directories exist and are writable for Chrome
ENV HOME=/home/pptruser
RUN mkdir -p /home/pptruser/.local/share/applications \
    /home/pptruser/.config \
    /home/pptruser/.cache \
    /home/pptruser/Downloads

COPY --chown=pptruser:pptruser package.json package-lock.json ./
RUN npm ci && npm cache clean --force
COPY --chown=pptruser:pptruser tsconfig.json .
COPY --chown=pptruser:pptruser .env .
COPY --chown=pptruser:pptruser src ./src

RUN npm run build

CMD ["sh", "-c", "node dist/server.js"]
