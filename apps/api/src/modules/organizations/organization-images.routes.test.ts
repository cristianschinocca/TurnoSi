import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ role: "owner", remove: vi.fn() }));
vi.mock("./organization-images.service.js", () => ({ deleteOrganizationImage: state.remove, saveOrganizationImage: vi.fn() }));
import { organizationsRouter } from "./organizations.routes.js";
import { errorHandler } from "../../middlewares/error-handler.js";
import { resetRateLimitsForTests } from "../../middlewares/rate-limit.js";

const app = express();
app.use((req, _res, next) => {
  req.tenant = { organizationId: "own-org", userId: "user-1", role: state.role as "owner" | "member",
    timezone: "America/Argentina/Buenos_Aires" };
  next();
});
app.use(organizationsRouter);
app.use(errorHandler);

beforeEach(() => { vi.clearAllMocks(); resetRateLimitsForTests(); state.role = "owner"; });

describe("image deletion authorization", () => {
  it.each(["logo", "gallery/0"])("rejects members deleting %s", async (path) => {
    state.role = "member";
    await request(app).delete(`/current/${path}`).expect(403);
    expect(state.remove).not.toHaveBeenCalled();
  });

  it("uses the authenticated tenant rather than a supplied organization ID", async () => {
    await request(app).delete("/current/logo?organizationId=other-org").expect(200);
    expect(state.remove).toHaveBeenCalledExactlyOnceWith("own-org", "logo");
  });

  it("rejects unsupported gallery slots", async () => {
    await request(app).delete("/current/gallery/2").expect(400);
    expect(state.remove).not.toHaveBeenCalled();
  });
});
