# Server based Deno Runtime (SBDR)

This application is a server based [Deno](https://deno.land) Runtime that can be used as a standalone service or, if necessary, embedded in your Rust language application. 

**Supported operating systems: Unix (Linux, MacOS). Windows not supported.**

## Network architecture

![Request processing route](https://github.com/eugenever/server-based-deno/blob/master/sbdeno.png?raw=true)

## Features of SBDR:
- has no restrictions in terms of access rights as it was done in the original Deno;
- ability to call your Deno/Rust extensions and ops in Javascript (V8 engine) to improve performance;
- the ability to use part of the Node.js (Nodejs) libraries (note, that not all libraries can be converted to ESM, what Deno requires);
- import of Node.js libraries is possible only through [CDNs](https://deno.com/manual@v1.34.0/node/cdns), npm specifiers not supported;
- all workers run on separate Rust threads;
- all workers are http servers;
- all workers are implemented on Javascript/Typescript;
- the main worker does not directly process the request, but only redirects it to the final worker;
- workers have a lifetime and can automatically turn off when it expires. If necessary, it will automatically restart (does not affect the main workers, they are executed continuously);
- local caching of packages downloaded from CDN at the first start of the worker

## How to start and use
The configuration of the main worker is located in the folder `/api/main`. The entry point is the file `index.ts` (this applies to all workers). File `/api/configuration.json` contains the default configuration `(defaultWorkerConfig)` for "cold" workers, that start when a request is received and the configuration for "hot" workers (`key workers`), that start when the application starts. 

First of all, you need to run the assembly of the application:
```
cargo build
```
Next, to run the application, use the command:
```
./target/debug/edge-runtime "$@" start --main-service ./api/main --import-map ./api/import_map.json
```
Using debug mode:
```
./target/debug/edge-runtime "$@" start --verbose --main-service ./api/main --import-map ./api/import_map.json
```
Worker Configuration Options `(/api/configuration.json)`:
  - `active` - whether to start the worker when the application starts ("hot" worker);
  - `lifeTimeMs` - worker lifetime in ms;
  - `noModuleCache` - do not cache packages (default `false`);
  - `restart` - automatically restart the worker after its lifetime expires;
  - `number` - the number of workers (for example, it takes time to create xlsx, pdf or docx files and so that requests do not create large queues, it is useful to run several workers for this functionality);

The `api` folder contains template implementations of workers (except for the `api/main` folder). You can test with specified worker implementations. To start the worker, you need to execute a http requests, for example
```
curl --request POST 'http://localhost:9000/api/main-empty'\
  --header 'Content-Type: application/json'\
  --data-raw '{"name": "John Doe"}'
  
curl --request POST 'http://localhost:9000/api/empty-response'\
--header 'Content-Type: application/json'\
--data-raw '{"name": "John Doe"}'

curl --request POST 'http://localhost:9000/api/hello-world'\
--header 'Content-Type: application/json'\
--data-raw '{"name": "John Doe"}'
```
Request routing happens dynamically based on folders in the `api` folder. In order for you to add your worker, you need to create a folder inside the `api` (for example `your_worker`), then create an `index.ts` file inside the new folder and define the http server in it:
```
./api/your_worker/index.ts

import { serve } from "server";

async function reqHandler(req: Request, _conn: connInfo) {  
  if (req.method !== "POST") {
    return new Response(null, { status: 405 });
  }
  return new Response("Hello world!");
}

serve(reqHandler, { port: 5000 });
```
To check the work of `your_worker`, run, for example, http requests:
```
curl --request POST 'http://localhost:9000/api/your_worker'
curl --request GET 'http://localhost:9000/api/your_worker'
```



Inspired by [Edge-runtime](https://github.com/supabase/edge-runtime)