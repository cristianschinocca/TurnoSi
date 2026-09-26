import { Router } from "express";

import { auditRouter } from "./audit/audit.routes.js";
import { authRouter } from "./auth/auth.routes.js";
import { availabilityRouter } from "./availability/availability.routes.js";
import { calendarRouter } from "./calendar/calendar.routes.js";
import { membershipsRouter } from "./memberships/memberships.routes.js";
import { organizationsRouter } from "./organizations/organizations.routes.js";
import { usersRouter } from "./users/users.routes.js";
import { customerManagementRouter } from "./customers/customers.routes.js";
import { publicBookingRouter } from "./public-booking/public-booking.routes.js";
import { superadminRouter } from "./superadmin/superadmin.routes.js";
import { teamRouter } from "./team/team.routes.js";
import { billingPublicRouter, billingRouter } from "./billing/billing.routes.js";
import { requireAuth } from "../middlewares/require-auth.js";
import { resolveTenant } from "../middlewares/resolve-tenant.js";
import { requireActiveSubscription } from "../middlewares/require-subscription.js";
import { dashboardRouter } from "./dashboard/dashboard.routes.js";
import { getBillingPrices } from "./billing/billing-prices.service.js";
import { ok } from "../lib/http.js";

export const apiRouter = Router();

apiRouter.get("/public/billing/prices", async (_request, response) => {
  response.json(ok(await getBillingPrices()));
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/public/booking", publicBookingRouter);
apiRouter.use("/billing/webhooks", billingPublicRouter);
apiRouter.use("/superadmin", superadminRouter);
apiRouter.use(requireAuth);
apiRouter.use(resolveTenant);
apiRouter.use("/billing", billingRouter);
apiRouter.use(requireActiveSubscription);
apiRouter.use("/users", usersRouter);
apiRouter.use("/customers", customerManagementRouter);
apiRouter.use("/organizations", organizationsRouter);
apiRouter.use("/memberships", membershipsRouter);
apiRouter.use("/team", teamRouter);
apiRouter.use("/availability", availabilityRouter);
apiRouter.use("/calendar", calendarRouter);
apiRouter.use("/audit", auditRouter);
apiRouter.use("/dashboard", dashboardRouter);
