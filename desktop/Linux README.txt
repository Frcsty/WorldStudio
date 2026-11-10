World Studio for Linux x64

Extract and run:
  tar -xzf World-Studio-linux-x64.tar.gz
  cd 'World Studio-linux-x64'
  ./'Launch World Studio.sh'

Electron and a Java runtime are bundled; you do not need Node or Java.
On first launch World Studio downloads Minecraft's block models and textures
from Mojang (about 40 MiB) into workspace/. Nothing else is downloaded.

Requirements: an x64 desktop session with glibc 2.28 or newer and the usual
Electron libraries (GTK3, NSS, GBM, ALSA, X11 or Wayland). On Ubuntu 24.04 those
packages are libgtk-3-0t64, libnss3, libgbm1, libasound2t64 and libx11-xcb1.

Run as a normal user, not root. Chromium's sandbox stays enabled, so the system
must allow unprivileged user namespaces, or chrome-sandbox must be owned by root
with mode 4755. Do not use --no-sandbox.

Set WORLD_STUDIO_WORKSPACE to use a different workspace folder.
