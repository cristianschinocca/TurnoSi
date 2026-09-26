export const paidBillingPlans = {
  initial: {
    id: "initial",
    mercadoPagoName: "Turnosi Inicial",
    limits: {
      branches: 1,
      members: 3,
      galleryImages: 2
    },
    capabilities: {
      publicBooking: true,
      teamRoles: true,
      multiBranch: false,
      prioritySupport: false,
      advancedReports: false
    }
  },
  professional: {
    id: "professional",
    mercadoPagoName: "Turnosi Profesional",
    limits: {
      branches: 3,
      members: 12,
      galleryImages: 2
    },
    capabilities: {
      publicBooking: true,
      teamRoles: true,
      multiBranch: true,
      prioritySupport: true,
      advancedReports: false
    }
  },
  operation: {
    id: "operation",
    mercadoPagoName: "Turnosi Operación",
    limits: {
      branches: 10,
      members: 40,
      galleryImages: 2
    },
    capabilities: {
      publicBooking: true,
      teamRoles: true,
      multiBranch: true,
      prioritySupport: true,
      advancedReports: true
    }
  }
} as const;

export type PaidBillingPlan = keyof typeof paidBillingPlans;
