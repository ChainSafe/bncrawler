import yargs from 'yargs';
import figlet from 'figlet';
import { render } from './charts/screen.js';
import { Crawler } from './crawler/crawler.js';
import { createSecp256k1PeerId } from '@libp2p/peer-id-factory';
import { SignableENR } from '@chainsafe/discv5';
import { bootEnrs } from './bootEnrs.js';
import { multiaddr } from '@multiformats/multiaddr';
import { Registry } from 'prom-client';
import http from 'node:http';
import { CrawlerInitOptions } from './crawler/crawler.js';
import { Options } from '@sequelize/core';

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
const registry = new Registry();

//TODO: Show this and node crawler spinner then render charts
const crawler =  await Crawler.init({
  db: opts.db,
  discv5: {
    peerId,
    enr,
    multiaddr: bindAddr,
  },
  bootEnrs,
  registry,
});

// set up metrics server
const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url && req.url.includes("/metrics")) {
    res.writeHead(200, {"content-type": "text/plain"}).end(await crawler.scrapeMetrics());
  } else {
    res.writeHead(404).end();
  }
})
server.listen(opts.metricsPort)

// figlet('Beacon Node Crawler', (err, data) => {
//   if (err) {
//     console.error(`Failed to generate header: ${err}`);
//     process.exit(1);
//   }

//   console.log(data);
// });


render()