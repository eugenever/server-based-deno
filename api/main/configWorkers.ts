interface ConfigWorker {
  servicePath?: string;
  lifeTimeMs: number;
  noModuleCache: boolean;
  importMapPath?: string;
  restart: boolean;
  expireDate?: Date;
}

async function createWorker(configuration: ConfigWorker) {
  const servicePath = configuration.servicePath;
  const lifeTimeMs = configuration.lifeTimeMs;
  const noModuleCache = configuration.noModuleCache;
  const importMapPath = configuration.importMapPath;

  const envVarsObj = Deno.env.toObject();
  const envVars = Object.keys(envVarsObj).map((k) => [k, envVarsObj[k]]);

  const worker = await EdgeRuntime.userWorkers.create({
    servicePath,
    lifeTimeMs,
    noModuleCache,
    importMapPath,
    envVars,
  });

  const nowDate = new Date();
  const expireDate = new Date(
    nowDate.getTime() + configuration.lifeTimeMs - 500
  ); // minus 0.5 sec
  configuration.expireDate = expireDate;

  const expireWorker = {
    worker,
    configuration,
  };

  return expireWorker;
}

export { createWorker };
export type { ConfigWorker };
