import fs from "node:fs"
import yargs from 'yargs';
import figlet from 'figlet';
import { render } from './charts/screen.js';
import { Crawler } from './crawler/crawler.js';
import { createSecp256k1PeerId } from '@libp2p/peer-id-factory';
import { SignableENR } from '@chainsafe/discv5';
import { multiaddr } from '@multiformats/multiaddr';
import { Options } from '@sequelize/core';
import { fstat } from 'fs';
import { ssz } from "@lodestar/types";
import { bootEnrs } from "./bootEnrs.js";

type CLIOptions = {
  db: Options;
  /** The multiaddr string used to bind a UDP socket */
  bindAddr: string;
  /** The port number of the metrics server */
  metricsPort: number;
}

const opts: CLIOptions = {
  bindAddr: '/ip4/0.0.0.0/udp/9999',
  db: {
    dialect: "sqlite",
  },
  metricsPort: 9900,
}

const bindAddr = multiaddr(opts.bindAddr)
const peerId = await createSecp256k1PeerId()
const enr = SignableENR.createFromPeerId(peerId)

// let bootRecords: string[] = []
const filename = `enr-dump-${new Date().toISOString().slice(0, 13)}`

// try {
//   bootRecords = fs.readFileSync(filename, 'utf8').split('\n')
// } catch (err) {
//   console.error("error reading file", err)
// }

//TODO: Show this and node crawler spinner then render charts
const crawler =  await Crawler.init({
  discv5: {
    peerId,
    enr,
    multiaddr: bindAddr,
  },
  bootEnrs,
});

// attach crawler to globalThis for debugging purposes
(globalThis as any).crawler = crawler;

// figlet('Beacon Node Crawler', (err, data) => {
//   if (err) {
//     console.error(`Failed to generate header: ${err}`);
//     process.exit(1);
//   }

//   console.log(data);
// });


//render()


setInterval(() => {
  let beaconCount = 0

  console.log('discovered peers:', crawler.discovered.size)
  crawler.discovered.forEach((enr) => {
      const eth2Entry = enr.enr.kvs.get("eth2")
      const enrForkID = eth2Entry ? ssz.phase0.ENRForkID.deserialize(eth2Entry) : undefined
      const forkDigest = enrForkID?.forkDigest
      const firstFourBytes = forkDigest?.subarray(0, 4);

      if (firstFourBytes !== undefined) {
          const hexString = Array.from(firstFourBytes)
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("");
          if (hexString === 'bba4da96') {
            beaconCount++
          }
      }

  })
  console.log('mainnet beacon nodes:', beaconCount)
}, 2000)

process.addListener("SIGINT", () => {
  const stream = fs.createWriteStream(filename)
  console.log(`writing to ${filename}`);
  for (const {enr} of crawler.discovered.values()) {
    stream.write(enr.encodeTxt() + "\n")
  }
  stream.end()
  console.log(`writing to ${filename} finished`);
  crawler.close()
})
