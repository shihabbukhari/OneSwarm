import type { Role } from "@oneswarm/shared";
import type { Db } from "./db/client";
import type { RealtimeHub } from "./realtime";
import type { Storage } from "./storage";
import type { BridgeHub } from "./bridge-hub";

export interface AppContext {
  db: Db;
  hub: RealtimeHub;
  bridges: BridgeHub;
  storage: Storage;
}

/** The signed-in person and their workspace, resolved on every request. */
export interface Actor {
  userId: string;
  name: string;
  email: string;
  workspaceId: string;
  role: Role;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "error",
  ) {
    super(message);
  }
}

export const notFound = (what = "Not found") => new HttpError(404, what, "not_found");
export const forbidden = (what = "You don't have access to that.") =>
  new HttpError(403, what, "forbidden");
export const badRequest = (what: string) => new HttpError(400, what, "bad_request");
export const limitHit = (what: string) => new HttpError(429, what, "limit");
