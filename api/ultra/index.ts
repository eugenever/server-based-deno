import { serve } from "server_last";
import { server } from "./server.tsx";

// Start listening for incoming requests
serve(server.fetch);
