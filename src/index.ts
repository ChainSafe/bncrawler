import fs from "node:fs"
import yargs from 'yargs';
import figlet from 'figlet';
import { render } from './charts/screen.js';
import { Crawler } from './crawler/crawler.js';
import { createSecp256k1PeerId } from '@libp2p/peer-id-factory';
import { SignableENR } from '@chainsafe/discv5';
import { bootEnrs } from './bootEnrs.js';
import { multiaddr } from '@multiformats/multiaddr';
import { Options } from '@sequelize/core';
import { fstat } from 'fs';

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

process.addListener("SIGHUP", () => {
  const filename = `enr-dump-${new Date().toISOString()}`
  const stream = fs.createWriteStream(filename)
  console.log(`writing to ${filename}`);
  for (const {enr} of crawler.discovered.values()) {
    stream.write(enr.encodeTxt() + "\n")
  }
  stream.end()
  console.log(`writing to ${filename} finished`);
})

process.addListener("SIGINT", () => crawler.close())