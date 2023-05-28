import { Pool } from "https://deno.land/x/postgres@v0.14.2/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

console.log("Postgres worker started...");

// const databaseUrl = "postgres://postgres:123@127.0.0.1:5432/rust_test?application_name=my_custom_app"

const POOL_CONNECTIONS = 20;
const dbPool = new Pool(
  {
    user: "postgres",
    password: "123",
    database: "rust_test",
    hostname: "127.0.0.1",
    port: 5432,
    tls: {
      enabled: false,
    },
  },
  POOL_CONNECTIONS
);

async function runQuery(query: string) {
  const client = await dbPool.connect();
  let result;
  try {
    result = await client.queryObject(query);
  } finally {
    client.release();
  }
  return result;
}

serve(
  async (_req: Request) => {
    let body;
    try {
      const users = await runQuery("SELECT ID, NAME FROM USERS");
      body = JSON.stringify(
        users,
        (_key, value) => (typeof value === "bigint" ? value.toString() : value),
        2
      );
    } catch (e) {
      console.error(e);
    }
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  },
  { port: 9020 }
);
