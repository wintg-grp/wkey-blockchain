# WINTG sovereign IPFS — operations

## Public endpoints

- Gateway:     https://ipfs.wintg.network/ipfs/<CID>
- Pinning API: https://pin.wintg.network/pinning/pinFileToIPFS

## Server-side files (deployed)

- /opt/wintg-ipfs/docker-compose.yml          (3 containers: kubo, nginx, pinning)
- /opt/wintg-ipfs/nginx-gateway.conf
- /opt/wintg-ipfs/pinning-api/server.js + package.json
- /etc/openlitespeed/conf.d-wintg-extproc.conf  (extProcessor backends)
- /usr/local/directadmin/data/templates/custom/openlitespeed_vhost.conf
  (added two SDOMAIN-gated proxy contexts: ipfs.wintg.network, pin.wintg.network)

## Storage volumes

- /srv/ipfs/data       (kubo blockstore)
- /srv/ipfs/staging    (export staging)

## Restart / debug

  cd /opt/wintg-ipfs && docker compose restart
  /usr/local/lsws/bin/lswsctrl restart  # if OLS misbehaves
  pkill -9 -f litespeed && /usr/local/lsws/bin/lswsctrl start  # if OLS stuck

## Auth (pinning API)

Requests to POST /pinning/pinFileToIPFS must carry:
  X-Wintg-Signature  hex signature of "wintg-pin:<unix-ts>"
  X-Wintg-Address    address that signed
  X-Wintg-Timestamp  unix seconds (±5 min window)
