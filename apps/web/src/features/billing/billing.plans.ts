import type { BillingPlan } from "./billing.api";

export type BillingPlanDefinition = {
  id: BillingPlan;
  name: string;
  period: string;
  description: string;
  highlight: string;
  recommended: boolean;
  features: string[];
  limits: {
    branches: string;
    members: string;
    galleryImages: string;
  };
};

export const billingPlans: BillingPlanDefinition[] = [
  {
    id: "initial",
    name: "Inicial",
    period: "/mes",
    description: "Para negocios chicos que quieren recibir reservas online sin complicarse.",
    highlight: "Para empezar",
    recommended: false,
    features: [
      "1 sede activa",
      "Hasta 3 integrantes",
      "Agenda diaria, semanal y mensual",
      "Reservas online con WhatsApp",
      "Clientes, servicios y fotos del local"
    ],
    limits: {
      branches: "1 sede",
      members: "3 integrantes",
      galleryImages: "2 fotos del local"
    }
  },
  {
    id: "professional",
    name: "Profesional",
    period: "/mes",
    description: "Para equipos que trabajan todos los días y necesitan más control.",
    highlight: "Más elegido",
    recommended: true,
    features: [
      "Hasta 3 sedes",
      "Hasta 12 integrantes",
      "Roles: propietario, administrador y miembro",
      "Excepciones, feriados y horarios por sede",
      "Soporte prioritario"
    ],
    limits: {
      branches: "Hasta 3 sedes",
      members: "Hasta 12 integrantes",
      galleryImages: "2 fotos del local"
    }
  },
  {
    id: "operation",
    name: "Operación",
    period: "/mes",
    description: "Para negocios con varias sedes, más volumen y operación exigente.",
    highlight: "Alto volumen",
    recommended: false,
    features: [
      "Hasta 10 sedes",
      "Hasta 40 integrantes",
      "Multi-sede avanzado",
      "Reportes avanzados preparados",
      "Prioridad máxima de soporte"
    ],
    limits: {
      branches: "Hasta 10 sedes",
      members: "Hasta 40 integrantes",
      galleryImages: "2 fotos del local"
    }
  }
];

export function getBillingPlan(planId?: BillingPlan | "trial" | null) {
  return billingPlans.find((plan) => plan.id === planId) ?? null;
}
