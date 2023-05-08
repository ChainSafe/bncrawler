import { Op, Options, Sequelize } from "@sequelize/core"
import { createDb, Peer } from "./db.js";
import { Discv5, ENR, ENRInput, IDiscv5CreateOptions } from "@chainsafe/discv5";
import {Registry} from "prom-client";
import { Counter, Histogram } from "prom-client";

export type CrawlerInitOptions = {
  db: Options;
  discv5: IDiscv5CreateOptions;
  bootEnrs: ENRInput[];
  registry: Registry;
};

export type CrawlerConstructorOptions = {
  opts: CrawlerInitOptions;
  db: Sequelize;
  Peer: typeof Peer;
  discv5: Discv5;
  metrics: Metrics;
}

export function createMetrics(registry: Registry) {
  return {
    registry,
    discv5: {
      pingAttemptCount: new Counter({
        name: "bncrawler_ping_attempt_count",
        help: "bncrawler_ping_attempt_count",
      }),
      findNodeAttemptCount: new Counter({
        name: "bncrawler_find_node_attempt_count",
        help: "bncrawler_find_node_attempt_count",
      }),
      pingAttemptFailCount: new Counter({
        name: "bncrawler_ping_attempt_fail_count",
        help: "bncrawler_ping_attempt_fail_count",
      }),
    },
    db: {
      addPeerCount: new Counter({
        name: "bncrawler_db_add_peer_count",
        help: "bncrawler_db_add_peer_count",
      }),
      addPeerFailCount: new Counter({
        name: "bncrawler_db_add_peer_fail_count",
        help: "bncrawler_db_add_peer_fail_count",
      }),
      addPeerTime: new Histogram({
        name: "bncrawler_db_add_peer_time",
        help: "bncrawler_db_add_peer_time",
        buckets: [10, 50, 100, 200, 1000],
      }),
      updatePeerCount: new Counter({
        name: "bncrawler_db_update_peer_count",
        help: "bncrawler_db_update_peer_count",
      }),
      deletePeerCount: new Counter({
        name: "bncrawler_db_delete_peer_count",
        help: "bncrawler_db_delete_peer_count",
      }),
    },
  }
}

export type Metrics = ReturnType<typeof createMetrics>;

/**
 * Maximum amount of time between updating the db with newly discovered ENRs
 */
export const MAX_DISCOVERED_DB_UPDATE_TIME = 60_000;

/**
 * Maximum number of ENRs discovered between updating the db
 */
export const MAX_DISCOVERED_DB_ENRS = 1000;

/**
 * Amount of time since last update to trigger a refresh
 *
 * 6 hrs
 */
export const PEER_REFRESH_TIMEOUT = 6 * 1000 * 60 * 6;

export class Crawler {
  private opts: CrawlerInitOptions;
  private db: Sequelize;
  private Peer: typeof Peer;
  private discv5: Discv5;
  private metrics: Metrics;
  private stopped = false;
  private discovered: {lastUpdate: number; enrs: ENR[]};

  constructor(modules: CrawlerConstructorOptions) {
    this.opts = modules.opts;
    this.db = modules.db;
    this.Peer = modules.Peer;
    this.discv5 = modules.discv5;
    this.metrics = modules.metrics;
    this.discovered = {
      lastUpdate: Date.now(),
      enrs: [],
    };
    this.discv5.on("discovered", this.onDiscovered);
  }

  static async init(opts: CrawlerInitOptions): Promise<Crawler> {
    const {db, Peer} = await createDb(opts.db);

    const metrics = createMetrics(opts.registry);

    const discv5 = Discv5.create(opts.discv5);
    for (const bootEnr of opts.bootEnrs) {
      discv5.addEnr(bootEnr);
    }

    await discv5.start();

    return new Crawler({
      opts, db, Peer, discv5, metrics,
    })
  }

  async crawl(): Promise<void> {
    while (!this.stopped) {
      await this.discv5.findRandomNode();
    }
  }

  onDiscovered = (enr: ENR): void => {
    this.discovered.enrs.push(enr);
    if (this.discovered.enrs.length > MAX_DISCOVERED_DB_ENRS || Date.now() > MAX_DISCOVERED_DB_UPDATE_TIME + this.discovered.lastUpdate) {
      const discovered = this.discovered;
      this.discovered = {
        lastUpdate: Date.now(),
        enrs: [],
      };

      void this.handleDiscoveredENRs(discovered.enrs);
    }
  }

  async handleDiscoveredENRs(enrs: ENR[]): Promise<void> {
    const updatedENRs = await this.pingENRs(enrs);
    await this.addDiscoveredToDb(updatedENRs);
  }

  /**
   * Ping all discovered ENRs and return all updated ENRs that respond
   */
  async pingENRs(enrs: ENR[]): Promise<ENR[]> {
    const newENRs = await Promise.all(enrs.map((enr) => this.pingENR(enr)));
    return newENRs.filter((enr) => enr) as ENR[];
  }

  /**
   * Ping an enr and update it, returning the newest available ENR or undefined if either response fails
   */
  async pingENR(enr: ENR): Promise<ENR | undefined> {
    this.metrics.discv5.pingAttemptCount.inc();
    try {
      const pong = await this.discv5.sendPing(enr);
      if (pong.enrSeq > enr.seq) {
        this.metrics.discv5.findNodeAttemptCount.inc();
        const [newENR] = await this.discv5.sendFindNode(enr, [0]);
        return newENR;
      }
      return enr;
    } catch (e) {
      this.metrics.discv5.pingAttemptFailCount.inc();
      return undefined;
    }
  }

  async addDiscoveredToDb(enrs: ENR[]): Promise<void> {
    let success = 0;
    let failure = 0;
    await Promise.allSettled(enrs.map(async (enr) => {
      this.metrics.db.addPeerCount.inc();
      const timer = this.metrics.db.addPeerTime.startTimer();
      try {
        const [peer, _initialized] = await this.Peer.findCreateFind({nodeId: enr.nodeId} as any)
        peer.setByENR(enr);
        await peer.save();
        success++;
      } catch (e) {
        this.metrics.db.addPeerFailCount.inc();
        failure++;
      } finally {
        timer();
      }
    }));
    console.log("Added discovered ENRs to db", {count: enrs.length, success, failure});
  }

  async refreshPeers(): Promise<void> {
    const peers: Peer[] = await this.Peer.findAll({
      where: {
        updatedAt: {
          [Op.lt]: Date.now() - PEER_REFRESH_TIMEOUT,
        }
      }
    });
    
    const peersAndUpdatedEnrs: [Peer, ENR | undefined][] = await Promise.all(peers.map(async (peer) => {
      const enr = ENR.decode((peer as any).enr);
      const updatedEnr = await this.pingENR(enr);
      return [peer, updatedEnr];
    }));

    const peersToDelete: Peer[] = [];
    const peersToUpdate: [Peer, ENR][] = [];
    for (const [peer, updatedEnr] of peersAndUpdatedEnrs) {
      if (updatedEnr) {
        peersToUpdate.push([peer, updatedEnr]);
      } else {
        peersToDelete.push(peer);
      }
    }

    
    await Promise.allSettled([
      ...peersToDelete.map((peer) => peer.destroy()),
      ...peersToUpdate.map(([peer, updatedEnr]) => {
        peer.setByENR(updatedEnr);
        return peer.save();
      }),
    ]);
  }

  async close(): Promise<void> {
    this.stopped = true;

    await this.discv5.stop();
    this.discv5.off("discovered", this.onDiscovered);
    await this.addDiscoveredToDb(this.discovered.enrs);

    await this.db.close();
  }

  async scrapeMetrics(): Promise<string> {
    return this.metrics.registry.metrics();
  }
}
