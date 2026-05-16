/**
 * Typed client for the Research Digest Agent backend.
 * Logic stub — request shapes match `app/researchfeature/schemas.py`.
 */
import { api } from "./api";
import type { ResearchRequest } from "../types";

const BASE = "/api/v1/research";

export const researchApi = {
  health: () => api.get<{ status: string; feature: string }>(`${BASE}/health`),

  // The actual streaming request will be issued via `lib/stream.ts`,
  // not the JSON `api` client. This is just a typed convenience for
  // building the request body.
  buildDigestRequest: (req: ResearchRequest) => ({
    path: `${BASE}/digest`,
    body: req,
  }),
};
