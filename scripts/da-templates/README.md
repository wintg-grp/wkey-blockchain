# DirectAdmin custom OLS templates

The file `openlitespeed_vhost.conf.snippet` contains the conditional
blocks DirectAdmin should inject into the OpenLiteSpeed vhost
configuration to reverse-proxy the WINTG subdomains to the local Besu
nodes.

Apply it once on the server:

```bash
# Backup the existing template
TPL=/usr/local/directadmin/data/templates/custom/openlitespeed_vhost.conf
sudo cp "$TPL" "${TPL}.bak.$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true

# If the custom template doesn't exist yet, copy the stock one first
if [ ! -f "$TPL" ]; then
  sudo cp /usr/local/directadmin/data/templates/openlitespeed_vhost.conf "$TPL"
fi

# Append our snippet (idempotent: it's wrapped in |*if SDOMAIN=...|*endif| blocks)
sudo cat >> "$TPL" < scripts/da-templates/openlitespeed_vhost.conf.snippet

# Trigger DirectAdmin to regenerate the vhost files
echo "action=rewrite&value=httpd" | sudo tee -a /usr/local/directadmin/data/task.queue
sudo /usr/local/directadmin/dataskq d
sudo systemctl reload lsws
```

The snippet handles all six WINTG subdomains:

| Subdomain | Backend |
|---|---|
| `rpc.wintg.network` | 127.0.0.1:8545 |
| `ws.wintg.network` | 127.0.0.1:8546 |
| `scan.wintg.network` | 127.0.0.1:3000 (frontend) + /api → 4000 |
| `testnet-rpc.wintg.network` | 127.0.0.1:8547 |
| `testnet-ws.wintg.network` | 127.0.0.1:8548 |
| `faucet.wintg.network` | 127.0.0.1:4001 (Express faucet) |

Don't forget to:

1. Add each subdomain in DirectAdmin → Subdomain Management.
2. Issue a Let's Encrypt SAN certificate covering all of them.
3. Re-run `dataskq` after every template change.
