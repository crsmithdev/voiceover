/**
 * Creates the LiveKit outbound trunk that dials through Telnyx (spec 13.5).
 *
 * Idempotent: it lists the trunks first and does nothing if one already points
 * at the same number. Reads ~/voiceover/.env, which is not in the repository.
 *
 * The Telnyx side must already exist: an outbound voice profile, an FQDN
 * connection holding these same digest credentials, an FQDN record pointing at
 * this project's SIP host, and the number attached to that connection.
 *
 * Usage: bun scripts/setup-trunk.ts [--delete]
 */
import { SipClient } from "livekit-server-sdk";
import { SIPTransport } from "@livekit/protocol";

const need = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set; put it in .env`);
  return value;
};

const url = need("LIVEKIT_URL");
const number = need("TELNYX_NUMBER");
const username = need("TELNYX_SIP_USERNAME");
const password = need("TELNYX_SIP_PASSWORD");

const client = new SipClient(url, need("LIVEKIT_API_KEY"), need("LIVEKIT_API_SECRET"));

const existing = await client.listSipOutboundTrunk();
const match = existing.find((trunk) => trunk.numbers.includes(number));

if (process.argv.includes("--delete")) {
  for (const trunk of existing) {
    await client.deleteSipTrunk(trunk.sipTrunkId);
    console.log(`deleted ${trunk.sipTrunkId}`);
  }
  process.exit(0);
}

if (match) {
  console.log(`trunk already exists: ${match.sipTrunkId} -> ${match.address} as ${match.numbers.join(", ")}`);
  process.exit(0);
}

const trunk = await client.createSipOutboundTrunk("telnyx outbound", "sip.telnyx.com", [number], {
  transport: SIPTransport.SIP_TRANSPORT_TCP,
  authUsername: username,
  authPassword: password,
  // Telnyx matches an unheadered INVITE by source IP and can pick the wrong
  // connection. This header names the connection explicitly. It goes in
  // `headers`, which is the outbound direction; `headersToAttributes` maps
  // headers off an inbound call and would do nothing here.
  headers: { "X-Telnyx-Username": username },
});

console.log(`created ${trunk.sipTrunkId}`);
console.log(`  address ${trunk.address}, transport ${SIPTransport[trunk.transport]}, numbers ${trunk.numbers.join(", ")}`);
