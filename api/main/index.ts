import { serve } from "server";
import { exists } from "exists";
import { ConfigWorker, createWorker } from "./configWorkers.ts";

import {
  addWorkerToPool,
  initializeWorkers,
  workerPool,
  apiPath,
  configuration,
} from "./initWorkers.ts";

// initialize Workers
await initializeWorkers();
// console.log("Init workerPool:", workerPool);

interface ServicePathStatistic {
  current_count_workers: number;
  max_count_workers: number;
  count_serve_requests: number;
}

// workerPoolStatistics<string, ServicePathStatistic[]>: servicePath:[..statistics]
const workerPoolStatistics = new Map();

interface reqPayload {
  api_service_path: string;
  life_time_ms: number;
  no_module_cache: boolean;
  import_map_path?: string;
  restart: boolean;
  num_workers: number;
}

async function addWorker(req: Request): Promise<Response> {
  try {
    const {
      api_service_path,
      life_time_ms,
      no_module_cache,
      import_map_path,
      restart,
      num_workers,
    }: reqPayload = await req.json();

    const reqConfigWorker: ConfigWorker = {
      servicePath: apiPath(api_service_path),
      lifeTimeMs: life_time_ms,
      noModuleCache: no_module_cache,
      importMapPath: import_map_path,
      restart: restart, // default don't restart
    };

    await addWorkerToPool(
      apiPath(api_service_path),
      reqConfigWorker,
      num_workers
    );

    const countWorkersSP = workerPool.get(apiPath(api_service_path)).length;

    const statSP: ServicePathStatistic = workerPoolStatistics.get(
      apiPath(api_service_path)
    );

    if (statSP === undefined) {
      const stat: ServicePathStatistic = {
        current_count_workers: countWorkersSP,
        max_count_workers: countWorkersSP,
        count_serve_requests: 0,
      };
      workerPoolStatistics.set(apiPath(api_service_path), stat);
    } else {
      if (workerPool.get(apiPath(api_service_path)) !== undefined) {
        const currStatSP = {
          current_count_workers: countWorkersSP,
          max_count_workers:
            workerPool.get(apiPath(api_service_path)).length >
            statSP.max_count_workers
              ? workerPool.get(apiPath(api_service_path)).length
              : statSP.max_count_workers,
          count_serve_requests: statSP.count_serve_requests,
        };
        workerPoolStatistics.set(apiPath(api_service_path), currStatSP);
      }
    }

    return new Response(
      JSON.stringify({
        service_path: apiPath(api_service_path),
        total_workers: countWorkersSP,
      }),
      { status: 200 }
    );
  } catch (e) {
    console.error(e);
    const error = { msg: e.toString() };

    return new Response(JSON.stringify(error), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function shutdown(req: Request): Promise<Response> {
  try {
    const { key, service_path } = await req.json();
    if (key !== undefined) {
      Deno.shutdownWorker(key);

      for (const k of workerPool) {
        const workersServicePath = workerPool.get(k);
        if (workersServicePath) {
          const workers = workersServicePath.filter(
            (expireWorker: any) => expireWorker.worker.key !== key
          );
          if (workers.length < workersServicePath.length) {
            workerPool.set(k, workers);
            break;
          }
        }
      }

      return new Response(
        JSON.stringify({
          key: key,
        }),
        { status: 200 }
      );
    }

    if (service_path !== undefined) {
      const workersServicePath = workerPool.get(apiPath(service_path));
      if (workersServicePath !== undefined) {
        workerPool.set(apiPath(service_path), []);
        for (const expireWorker of workersServicePath) {
          Deno.shutdownWorker(expireWorker.worker.key);
        }
      }

      return new Response(
        JSON.stringify({
          workers_service_path: workersServicePath.map(
            // deno-lint-ignore no-explicit-any
            (expireWorker: any) => expireWorker.worker.key
          ),
        }),
        { status: 200 }
      );
    }
  } catch (e) {
    console.error(e);
    const error = { msg: e.toString() };

    return new Response(JSON.stringify(error), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const error = { msg: "Missing key and service path in shutdown request" };
  return new Response(JSON.stringify(error), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}

function serveStatistics(servicePath: string) {
  try {
    const statSP: ServicePathStatistic = workerPoolStatistics.get(servicePath);
    if (statSP === undefined) {
      const stat: ServicePathStatistic = {
        current_count_workers: workerPool.get(servicePath)
          ? workerPool.get(servicePath).length
          : 1,
        max_count_workers: workerPool.get(servicePath)
          ? workerPool.get(servicePath).length
          : 1,
        count_serve_requests: 1,
      };
      workerPoolStatistics.set(servicePath, stat);
    } else {
      if (workerPool.get(servicePath) !== undefined) {
        const currStatSP = {
          current_count_workers: workerPool.get(servicePath).length,
          max_count_workers:
            workerPool.get(servicePath).length > statSP.max_count_workers
              ? workerPool.get(servicePath).length
              : statSP.max_count_workers,
          count_serve_requests: statSP.count_serve_requests + 1,
        };
        workerPoolStatistics.set(servicePath, currStatSP);
      }
    }
  } catch (e) {
    console.error(e);
    const error = { msg: e.toString() };

    return new Response(JSON.stringify(error), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function callWorker(
  req: Request,
  servicePath: string,
  configurationWorker: ConfigWorker
) {
  try {
    const deleteKeys: {
      key: string;
      servicePath: string;
      configuration: ConfigWorker;
    }[] = [];

    // check time expiration worker
    const nowDate = new Date().getTime();
    // check the expiration time of the workers and add them to the array for deletion
    for (const [servicePath, workers] of workerPool) {
      for (const expireWorker of workers) {
        if (expireWorker.configuration.expireDate <= nowDate) {
          deleteKeys.push({
            key: expireWorker.worker.key,
            servicePath,
            configuration: expireWorker.configuration,
          });
        }
      }
    }

    // delete expired workers from pool and restart them if set this option
    for (const { key, servicePath, configuration } of deleteKeys) {
      const workersServicePath = workerPool.get(servicePath);
      const workers = workersServicePath.filter(
        (expireWorker: any) => expireWorker.worker.key !== key
      );
      console.log(
        `EXPIRED Worker with key: ${key} for service path: ${servicePath} at ${configuration.expireDate?.toISOString()}`
      );
      if (configuration.restart) {
        const expireWorker = await createWorker(configuration);
        workers.push(expireWorker);
        console.log(
          `RESTARTED Worker for service path: ${configuration.servicePath} with key (${expireWorker.worker.key})`
        );
      }
      workerPool.set(servicePath, workers);
    }

    // check if an existing worker is available in pool
    const workersServicePath = workerPool.get(servicePath);
    if (workersServicePath === undefined || workersServicePath.length == 0) {
      const expireWorker = await createWorker(configurationWorker);
      const workers = [];
      workers.push(expireWorker);
      workerPool.set(servicePath, workers);
    }

    let expireWorker;
    if (
      workerPool.get(servicePath) !== undefined &&
      workerPool.get(servicePath).length > 1
    ) {
      // load balancing
      expireWorker = workerPool.get(servicePath).shift();
      workerPool.get(servicePath).push(expireWorker);
    } else if (workerPool.get(servicePath).length == 1) {
      expireWorker = workerPool.get(servicePath)[0];
    } else {
      return new Response(
        JSON.stringify({
          error: `Worker pool for service path (${servicePath}) is empty`,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const res = await expireWorker.worker.fetch(req);
    /*
      console.log(
        `Worker (${expireWorker.worker.key}) service request path: ${servicePath}`
      );
        */
    return res;
  } catch (e) {
    console.error(e);
    const error = { msg: e.toString() };

    return new Response(JSON.stringify(error), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// deno-lint-ignore no-explicit-any
async function handler(req: Request): Promise<any> {
  const url = new URL(req.url);
  const { pathname } = url;
  const path_parts = pathname.split("/");
  const service_name = path_parts[1] + "/" + path_parts[2];

  // serve request favicon
  if (service_name.includes("favicon.ico")) {
    const favicon = await exists("./api/main/favicon.ico");
    if (!favicon) {
      return new Response(null, {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    const res = await Deno.readFile("./api/main/favicon.ico");

    return new Response(res, {
      status: 200,
      headers: { "Content-Type": "image/x-icon" },
    });
  }

  if (!service_name || service_name === "") {
    const error = { msg: "Missing function name in request" };

    return new Response(JSON.stringify(error), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const servicePath = `./${service_name}`;

  const nowDate = new Date();
  const expireDate = new Date(
    nowDate.getTime() + configuration.defaultWorkerConfig.lifeTimeMs - 500
  );

  const configurationWorker: ConfigWorker = {
    servicePath,
    lifeTimeMs: configuration.defaultWorkerConfig.lifeTimeMs,
    noModuleCache: configuration.defaultWorkerConfig.noModuleCache,
    importMapPath: configuration.defaultWorkerConfig.importMapPath,
    restart: configuration.defaultWorkerConfig.restart,
    expireDate,
  };

  // state of worker pool
  // curl --request GET 'http://localhost:9000/api/workerpool'
  if (pathname === "/api/workerpool" && req.method === "GET") {
    return new Response(
      JSON.stringify(
        {
          worker_pool_statistics: Array.from(workerPoolStatistics.entries()),
        },
        null,
        2
      ),
      { status: 200 }
    );
  }

  // add workers to pool for specific service path
  /*
  curl --request POST 'http://localhost:9000/api/workerpool/add_worker' \
  --header 'Content-Type: application/json' \
  --data-raw '{"api_service_path": "docx", "life_time_ms": 15000, "no_module_cache": false, "restart": false, "num_workers": 2}'
  */
  if (pathname === "/api/workerpool/add_worker" && req.method === "POST") {
    return await addWorker(req);
  }

  // Shutdown workers
  if (pathname === "/api/workerpool/shutdown_worker" && req.method === "POST") {
    return await shutdown(req);
  }

  // serve statistics
  serveStatistics(servicePath);

  return await callWorker(req, servicePath, configurationWorker);
}

console.log("Main worker started...");
// console.log(Deno);

serve(handler);
