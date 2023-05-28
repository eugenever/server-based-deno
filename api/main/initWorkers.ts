import { ConfigWorker, createWorker } from "./configWorkers.ts";

// workerPool<string, expireWorker[]>: servicePath:[..workers]
const workerPool = new Map();
let configuration;

async function addWorkerToPool(
  servicePath: string,
  configuration: ConfigWorker,
  numWorkers: number
) {
  let workers = workerPool.get(servicePath);
  if (workers === undefined || workers.length == 0) {
    workers = [];
  }
  for (let index = 0; index < numWorkers; index++) {
    const expireWorker = await createWorker(configuration);
    workers.push(expireWorker);
  }
  workerPool.set(servicePath, workers);
}

async function getConfiguration(filePath: string) {
  return JSON.parse(await Deno.readTextFile(filePath));
}

async function initializeWorkers() {
  configuration = await getConfiguration("./api/configuration.json");
  for (const worker of Object.keys(configuration.workers)) {
    if (configuration.workers[worker].active) {
      const servicePath = apiPath(worker);

      const configWorker: ConfigWorker = {
        servicePath: apiPath(worker),
        lifeTimeMs: configuration.workers[worker].lifeTimeMs,
        noModuleCache: configuration.workers[worker].noModuleCache,
        importMapPath: configuration.workers[worker].importMapPath, // use imports from ./api/import_map, not from files
        restart: configuration.workers[worker].restart, // http server will be restarted
      };

      await addWorkerToPool(
        servicePath,
        configWorker,
        configuration.workers[worker].number
      );
    }
  }
}

function apiPath(sp: string): string {
  return `./api/${sp}`;
}

export {
  initializeWorkers,
  workerPool,
  addWorkerToPool,
  apiPath,
  getConfiguration,
  configuration,
};
