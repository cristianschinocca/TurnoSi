import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";

import { preloadAuthPage } from "@/app/route-loaders";
import { billingPlans } from "../billing/billing.plans";
import { formatPlanPrice, useBillingPrices } from "../billing/billing-prices";
import turnoarLogo from "@/components/assets/logos/logo-turnoar.svg";
import statusCheckIcon from "@/components/assets/icons/status/status-check.svg";

function LandingBrand() {
  return (
    <img
      src={turnoarLogo}
      alt="turnoar"
      width="241"
      height="65"
      className="h-18 w-auto shrink-0"
    />
  );
}

const navigationLinks = [
  {
    href: "#inicio",
    label: "Inicio"
  },
  {
    href: "#funciones",
    label: "Funciones"
  },
  {
    href: "#pricing",
    label: "Precios"
  },
  {
    href: "#contact",
    label: "Contacto"
  }
];

const bookingPreviewSteps = [
  {
    service: "Corte de pelo",
    duration: "30 min",
    hours: ["09:00", "10:30", "12:00"],
    selectedHour: "09:00"
  },
  {
    service: "Barba completa",
    duration: "30 min",
    hours: ["11:00", "12:30", "14:00"],
    selectedHour: "12:30"
  },
  {
    service: "Consulta odontológica",
    duration: "45 min",
    hours: ["14:30", "16:00", "17:30"],
    selectedHour: "17:30"
  }
] as const;

const heroParticleIndexes = Array.from({ length: 22 }, (_, index) => index);
const defaultCardDotIndexes = Array.from({ length: 7 }, (_, index) => index);
const denseCardDotIndexes = Array.from({ length: 11 }, (_, index) => index);
const revealInitialMotion = { opacity: 0, y: 30 };
const revealInViewMotion = { opacity: 1, y: 0 };
const previewInitialMotion = { opacity: 0, y: 18, scale: 0.985 };
const previewInViewMotion = { opacity: 1, y: 0, scale: 1 };
const featureInitialMotion = { opacity: 0, y: 46, scale: 0.975 };
const featureInViewMotion = { opacity: 1, y: 0, scale: 1 };
const motionViewport = { once: true, amount: 0.22 };
const featureViewport = { once: true, amount: 0.16, margin: "0px 0px -6% 0px" };
const smoothTransition = { duration: 0.72, ease: [0.22, 1, 0.36, 1] as const };
const featureTransition = { duration: 0.82, ease: [0.16, 1, 0.3, 1] as const };
const authPreloadHandlers = {
  onPointerEnter: preloadAuthPage,
  onFocus: preloadAuthPage,
  onTouchStart: preloadAuthPage
};

type LandingBookingAnimationProps = {
  shouldReduceMotion: boolean | null;
  children: (state: {
    bookingPreview: (typeof bookingPreviewSteps)[number];
    visibleBookingPreviewPhase: number;
  }) => ReactNode;
};

function LandingBookingAnimation({
  shouldReduceMotion,
  children
}: LandingBookingAnimationProps) {
  const [bookingPreviewIndex, setBookingPreviewIndex] = useState(0);
  const [bookingPreviewPhase, setBookingPreviewPhase] = useState(0);
  const bookingPreview = bookingPreviewSteps[bookingPreviewIndex];
  const visibleBookingPreviewPhase = shouldReduceMotion ? 2 : bookingPreviewPhase;

  useEffect(() => {
    if (shouldReduceMotion) return;

    const selectService = window.setTimeout(() => setBookingPreviewPhase(1), 650);
    const selectHour = window.setTimeout(() => setBookingPreviewPhase(2), 1600);
    const hideSelection = window.setTimeout(() => setBookingPreviewPhase(3), 3900);
    const nextService = window.setTimeout(() => {
      setBookingPreviewPhase(0);
      setBookingPreviewIndex((current) => (current + 1) % bookingPreviewSteps.length);
    }, 4400);

    return () => {
      window.clearTimeout(selectService);
      window.clearTimeout(selectHour);
      window.clearTimeout(hideSelection);
      window.clearTimeout(nextService);
    };
  }, [bookingPreviewIndex, shouldReduceMotion]);

  return children({ bookingPreview, visibleBookingPreviewPhase });
}

function LandingCardDots({ count = 7 }: { count?: number }) {
  const indexes = count === 11 ? denseCardDotIndexes : defaultCardDotIndexes;

  return (
    <div className="landing-agenda-sparkles" aria-hidden="true">
      {indexes.map((index) => (
        <span key={index} />
      ))}
    </div>
  );
}

function LandingHeroParticles({ className = "" }: { className?: string }) {
  return (
    <div className={`landing-hero-particles ${className}`} aria-hidden="true">
      {heroParticleIndexes.map((index) => (
        <span key={index} className="landing-hero-particle">
          <span />
        </span>
      ))}
    </div>
  );
}

export function LandingPage() {
  const prices = useBillingPrices();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(() => window.scrollY > 12);
  const shouldReduceMotion = useReducedMotion();
  const revealInitial = shouldReduceMotion ? false : revealInitialMotion;
  const revealInView = shouldReduceMotion ? undefined : revealInViewMotion;
  const previewInitial = shouldReduceMotion ? false : previewInitialMotion;
  const previewInView = shouldReduceMotion ? undefined : previewInViewMotion;
  const featureInitial = shouldReduceMotion ? false : featureInitialMotion;
  const featureInView = shouldReduceMotion ? undefined : featureInViewMotion;

  useLayoutEffect(() => {
    const previousHtmlBackground = document.documentElement.style.backgroundColor;
    const previousBodyBackground = document.body.style.backgroundColor;
    const previousScrollRestoration = window.history.scrollRestoration;
    const shouldResetScroll = window.matchMedia("(min-width: 949px)").matches;

    document.documentElement.style.backgroundColor = "#201836";
    document.body.style.backgroundColor = "#201836";

    if (shouldResetScroll && !window.location.hash) {
      window.history.scrollRestoration = "manual";
      window.scrollTo(0, 0);
    }

    return () => {
      document.documentElement.style.backgroundColor = previousHtmlBackground;
      document.body.style.backgroundColor = previousBodyBackground;
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);

  useEffect(() => {
    let wasScrolled = window.scrollY > 12;

    function handleScroll() {
      const nextScrolled = window.scrollY > 12;
      if (nextScrolled === wasScrolled) return;

      wasScrolled = nextScrolled;
      setIsScrolled(nextScrolled);
    }

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>("[data-scroll-reveal]")
    );

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("landing-scroll-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.16 }
    );

    elements.forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const regions = Array.from(
      document.querySelectorAll<HTMLElement>("[data-pause-when-offscreen]")
    );
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          entry.target.classList.toggle("landing-animation-paused", !entry.isIntersecting);
        });
      },
      { rootMargin: "140px 0px", threshold: 0 }
    );

    regions.forEach((region) => observer.observe(region));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return;

    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsMenuOpen(false);
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  function closeMenu() {
    setIsMenuOpen(false);
  }

  return (
    <div className="landing-page min-h-screen w-full bg-[var(--color-page)]">
      <main>
        <section
          id="inicio"
          className="landing-hero-shell relative z-10 scroll-mt-24 border-b border-[var(--color-border)] pt-[76px] text-[var(--color-button-text)] sm:pt-[70px]"
        >
          <header
            className={`landing-hero-nav fixed z-50 ${
              isScrolled ? "landing-hero-nav--floating" : ""
            }`}
          >
            <div
              className={`landing-hero-nav__inner ${
                isScrolled
                  ? "landing-hero-nav__inner--compact px-4 py-2 sm:px-5"
                  : "px-5 py-3 sm:px-7"
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div
                  className={`landing-hero-nav__brand min-w-0 ${
                    isScrolled
                      ? "landing-hero-nav__brand--compact [&_img]:h-11 sm:[&_img]:h-12"
                      : "[&_img]:h-14 sm:[&_img]:h-16"
                  }`}
                >
                  <div className="inline-flex items-center justify-center py-3">
                    <LandingBrand />
                  </div>
                </div>

            <nav
              className={`landing-hero-nav__links hidden items-center whitespace-nowrap font-medium text-white/78 min-[949px]:flex ${
                isScrolled ? "landing-hero-nav__links--compact gap-5 text-[0.92rem]" : "gap-6 text-sm"
              }`}
            >
              {navigationLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="group relative py-2 transition-colors duration-200 hover:text-[var(--color-accent)]"
                >
                  {link.label}
                  <span className="absolute bottom-0 left-0 h-0.5 w-full origin-left scale-x-0 rounded-full bg-[var(--color-accent)] transition-transform duration-200 group-hover:scale-x-100" />
                </a>
              ))}
            </nav>

            <div
              className={`landing-hero-nav__actions hidden items-center justify-end min-[949px]:flex ${
                isScrolled ? "landing-hero-nav__actions--compact gap-1.5" : "gap-2"
              }`}
            >
              <Link
                to="/login"
                {...authPreloadHandlers}
                className={`landing-hero-nav__login group relative font-semibold text-white/82 transition-colors duration-200 hover:text-[var(--color-accent)] ${
                  isScrolled ? "landing-hero-nav__login--compact px-2 py-1.5 text-[0.92rem]" : "px-2 py-2 text-sm"
                }`}
              >
                Ingresar
                <span className="absolute bottom-0 left-2 h-0.5 w-[calc(100%-1rem)] origin-left scale-x-0 rounded-full bg-[var(--color-accent)] transition-transform duration-200 group-hover:scale-x-100" />
              </Link>
              <Link
                to="/register"
                {...authPreloadHandlers}
                className={`landing-cta landing-hero-nav__cta rounded-md bg-[var(--color-accent)] font-semibold text-[var(--color-button-text)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 ${
                  isScrolled ? "landing-hero-nav__cta--compact px-3.5 py-1.5 text-[0.92rem]" : "px-4 py-2 text-sm"
                }`}
              >
                Crear cuenta
              </Link>
            </div>

          </div>
        </div>
          </header>

          <button
            type="button"
            aria-label={isMenuOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((current) => !current)}
            className={`landing-burger min-[949px]:hidden ${
              isScrolled ? "landing-burger--floating" : ""
            } ${
              isMenuOpen ? "landing-burger--open" : ""
            }`}
          >
            <span />
            <span />
            <span />
          </button>

          <div
            className={`landing-mobile-menu min-[949px]:hidden ${
              isMenuOpen ? "landing-mobile-menu--open" : ""
            }`}
            aria-hidden={!isMenuOpen}
          >
            <button
              type="button"
              className="landing-mobile-menu-backdrop"
              aria-label="Cerrar menú"
              onClick={closeMenu}
            />
            <aside className="landing-mobile-menu-panel" aria-label="Navegación principal">
              <p className="landing-mobile-menu-heading text-xs font-semibold uppercase tracking-[0.18em] text-white/52">
                Menú
              </p>

              <nav className="mt-6 grid gap-1.5 text-sm font-medium text-white/78">
                {navigationLinks.map((link, index) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={closeMenu}
                    style={{ transitionDelay: isMenuOpen ? `${80 + index * 35}ms` : "0ms" }}
                    className="landing-mobile-menu-item group relative rounded-md px-3 py-3 transition-colors duration-200 hover:bg-white/8 hover:text-[var(--color-accent)]"
                  >
                    <span className="relative inline-block">
                      {link.label}
                      <span className="absolute -bottom-1 left-0 h-0.5 w-full origin-left scale-x-0 rounded-full bg-[var(--color-accent)] transition-transform duration-200 group-hover:scale-x-100" />
                    </span>
                  </a>
                ))}
              </nav>

              <div className="mt-auto grid gap-2 border-t border-white/10 pt-5">
                <Link
                  to="/login"
                  {...authPreloadHandlers}
                  onClick={closeMenu}
                  style={{ transitionDelay: isMenuOpen ? "230ms" : "0ms" }}
                  className="landing-mobile-menu-item group relative rounded-md border border-white/18 px-3 py-3 text-center text-sm font-medium text-white transition-colors duration-200 hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                >
                  Ingresar
                </Link>
                <Link
                  to="/register"
                  {...authPreloadHandlers}
                  onClick={closeMenu}
                  style={{ transitionDelay: isMenuOpen ? "265ms" : "0ms" }}
                  className="landing-mobile-menu-item rounded-md bg-[var(--color-accent)] px-3 py-3 text-center text-sm font-semibold text-[var(--color-button-text)] transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0"
                >
                  Crear cuenta
                </Link>
              </div>
            </aside>
          </div>

          <div className="landing-hero-content relative z-10 mx-auto grid min-h-[unset] w-full max-w-[1680px] min-w-0 gap-8 px-5 py-6 sm:px-7 sm:py-10 lg:px-8 lg:py-12 xl:px-8 xl:py-12 min-[1484px]:min-h-[560px] min-[1484px]:grid-cols-[minmax(0,0.9fr)_minmax(560px,1.1fr)] min-[1484px]:items-center min-[1484px]:gap-12 2xl:gap-16">
            <div className="landing-hero-copy landing-rise order-1 mx-auto min-w-0 max-w-2xl text-center sm:text-left min-[1484px]:order-none min-[1484px]:mx-0 min-[1484px]:justify-self-center">
              <h1 className="landing-page-title max-w-full text-3xl font-semibold leading-tight [overflow-wrap:anywhere] [text-wrap:balance] sm:text-5xl xl:max-w-[660px] xl:text-6xl">
                Gestioná tus turnos de forma{" "}
                <span className="text-white">simple</span>.
              </h1>
              <div className="landing-hero-copy__description mx-auto mt-4 max-w-full space-y-2 text-sm leading-7 text-white/70 [text-wrap:balance] sm:mx-0 sm:mt-5 sm:max-w-xl sm:text-base sm:leading-8">
                <p>
                  Organizá reservas, horarios, equipo y clientes desde un panel
                  claro.
                </p>
                <p className="hidden sm:block">
                  Tu página pública queda conectada para recibir turnos sin
                  complicaciones.
                </p>
              </div>

              <div className="landing-hero-copy__actions mt-6 grid gap-3 min-[360px]:flex min-[360px]:flex-row sm:mt-8">
                <a
                  href="#funciones"
                  className="landing-cta inline-flex w-full min-w-0 items-center justify-center rounded-md bg-[var(--color-accent)] px-5 py-3 text-center text-sm font-semibold text-[var(--color-button-text)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 min-[360px]:w-auto"
                >
                  Ver cómo funciona
                </a>
                <Link
                  to="/register"
                  {...authPreloadHandlers}
                  className="landing-link inline-flex w-full min-w-0 items-center justify-center rounded-md border border-white/22 px-5 py-3 text-center text-sm font-medium text-white transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] hover:shadow-lg active:translate-y-0 min-[360px]:w-auto"
                >
                  Crear cuenta
                </Link>
              </div>
            </div>

            <div
              id="product"
              className="landing-rise landing-delay-1 order-2 mx-auto w-full min-w-0 max-w-4xl min-[1484px]:order-none min-[1484px]:mt-24 min-[1484px]:max-w-[900px] min-[1484px]:-translate-x-2 min-[1484px]:justify-self-start 2xl:max-w-[960px] 2xl:translate-x-0"
            >
              <div className="landing-product-scene landing-product-card relative min-h-[430px] overflow-hidden text-white min-[1484px]:min-h-[470px]">
                <div className="landing-product-board absolute -right-2 left-6 top-12 hidden min-[1484px]:block">
                  <LandingHeroParticles className="landing-hero-particles--attached landing-hero-particles--desktop" />
                  <div className="landing-dashboard-tablet-frame landing-dashboard-tablet-frame--desktop">
                    <div className="landing-dashboard-tablet-screen grid min-h-[330px] grid-cols-[126px_minmax(0,1fr)_160px] overflow-hidden rounded-[22px] border border-white/14 bg-[#ffffff] text-[var(--color-ink)] shadow-[0_28px_90px_rgba(0,0,0,0.28)]">
                    <div className="bg-[rgba(32,24,54,0.98)] p-4 text-white">
                      <div className="mb-8 flex items-center gap-2">
                        <img
                          src={turnoarLogo}
                          alt="turnoar"
                          width="241"
                          height="65"
                          className="h-6 w-auto opacity-95"
                        />
                      </div>
                      {["Resumen", "Agenda", "Clientes", "Equipo", "Configuración"].map((item, index) => (
                        <div
                          key={item}
                          className={`mb-2 rounded-md px-2 py-2 text-[10px] font-semibold ${
                            index === 1 ? "bg-white/14 text-white" : "text-white/46"
                          }`}
                        >
                          {item}
                        </div>
                      ))}
                      <div className="mt-7 h-8 rounded-md bg-[var(--color-accent)]" />
                    </div>

                    <div className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="h-5 w-44 rounded bg-[rgba(32,24,54,0.16)]" />
                          <div className="mt-2 h-2.5 w-56 rounded bg-[rgba(32,24,54,0.08)]" />
                        </div>
                        <div className="flex gap-1.5">
                          <span className="h-7 w-9 rounded bg-[var(--color-ink)]" />
                          <span className="h-7 w-10 rounded border border-[var(--color-border)]" />
                          <span className="h-7 w-9 rounded border border-[var(--color-border)]" />
                        </div>
                      </div>

                      <div className="mt-5 grid grid-cols-3 gap-2">
                        {[0, 1, 2].map((item) => (
                          <div
                            key={item}
                            className="rounded-xl border border-[var(--color-border)] bg-white/58 p-3"
                          >
                            <div className="h-3 w-14 rounded bg-[rgba(32,24,54,0.1)]" />
                            <div className="mt-3 h-5 w-8 rounded bg-[rgba(32,24,54,0.18)]" />
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-white/62">
                        <div className="landing-hero-table-row grid grid-cols-[56px_minmax(0,1fr)_minmax(0,0.7fr)_76px] gap-3 border-b border-[var(--color-border)] px-3 py-2 text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
                          <span>Hora</span>
                          <span>Turno</span>
                          <span className="landing-hero-responsible">Responsable</span>
                          <span>Estado</span>
                        </div>

                        {[0, 1, 2, 3].map((item) => (
                          <div
                            key={item}
                            className="landing-hero-table-row grid grid-cols-[56px_minmax(0,1fr)_minmax(0,0.7fr)_76px] items-center gap-3 border-b border-[var(--color-border)] px-3 py-2.5 last:border-b-0"
                          >
                            <div className="h-3 w-9 rounded bg-[rgba(253,134,6,0.32)]" />
                            <div>
                              <div className="h-3 w-28 rounded bg-[rgba(32,24,54,0.15)]" />
                              <div className="mt-2 h-2.5 w-20 rounded bg-[rgba(32,24,54,0.08)]" />
                            </div>
                            <div className="landing-hero-responsible h-3 w-24 rounded bg-[rgba(32,24,54,0.1)]" />
                            <div className="h-5 rounded-full bg-[rgba(253,134,6,0.15)]" />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3 border-l border-[var(--color-border)] bg-white/35 p-3">
                      <div className="rounded-xl border border-[var(--color-border)] bg-white/58 p-3">
                        <div className="flex items-center justify-between">
                          <div className="h-3.5 w-20 rounded bg-[rgba(32,24,54,0.14)]" />
                          <div className="h-3 w-3 rounded-full bg-[var(--color-ink)]" />
                        </div>
                        <div className="mt-4 grid grid-cols-7 gap-1">
                          {Array.from({ length: 28 }).map((_, index) => (
                            <span
                              key={index}
                              className={`h-3.5 rounded ${
                                index === 10
                                  ? "bg-[var(--color-ink)]"
                                  : index % 4 === 0
                                    ? "bg-[#569165]/45"
                                    : "bg-[rgba(32,24,54,0.08)]"
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="rounded-xl border border-[var(--color-border)] bg-white/58 p-3">
                        <div className="h-4 w-24 rounded bg-[rgba(32,24,54,0.14)]" />
                        <div className="mt-3 space-y-2">
                          <div className="h-3 w-full rounded bg-[rgba(32,24,54,0.1)]" />
                          <div className="h-3 w-3/4 rounded bg-[rgba(32,24,54,0.08)]" />
                        </div>
                      </div>
                    </div>
                  </div>
                  </div>

                  <div className="landing-reservation-toast">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-[rgba(253,134,6,0.16)] text-sm font-semibold text-[var(--color-accent)]">
                        TS
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-white">Nueva reserva recibida</p>
                        <p className="mt-1 truncate text-[11px] text-white/58">
                          Corte de pelo · Viernes 16:00
                        </p>
                      </div>
                      <span className="h-2 w-2 rounded-full bg-[#72d59b]" />
                    </div>
                  </div>
                </div>

                <div className="landing-product-mobile-board landing-product-dashboard-board min-[1484px]:hidden">
                  <LandingHeroParticles className="landing-hero-particles--attached landing-hero-particles--tablet" />
                  <div className="landing-dashboard-tablet-frame landing-dashboard-tablet-frame--compact">
                    <div className="landing-product-mobile-panel landing-dashboard-tablet-screen grid grid-cols-[76px_minmax(0,1fr)] overflow-hidden rounded-[22px] border border-white/14 bg-[#ffffff] text-[var(--color-ink)] shadow-[0_28px_72px_rgba(4,2,12,0.28)]">
                    <div className="bg-[rgba(32,24,54,0.98)] p-3 text-white">
                      <img
                        src={turnoarLogo}
                        alt="turnoar"
                        width="241"
                        height="65"
                        className="h-5 w-auto min-w-[58px] opacity-95"
                      />
                      <div className="mt-8 space-y-3">
                        {["Resumen", "Agenda", "Clientes", "Equipo"].map((item, index) => (
                          <span
                            key={item}
                            className={`block rounded-md px-2 py-1.5 text-[8px] font-semibold ${
                              index === 1 ? "bg-white/14 text-white" : "text-white/42"
                            }`}
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                      <span className="mt-8 block h-7 rounded-md bg-[var(--color-accent)]" />
                    </div>

                    <div className="min-w-0 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="h-3.5 w-32 rounded bg-[rgba(32,24,54,0.16)]" />
                          <div className="mt-2 h-2.5 w-44 max-w-full rounded bg-[rgba(32,24,54,0.08)]" />
                        </div>
                        <span className="h-6 w-6 rounded bg-[var(--color-ink)]" />
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-2">
                        {[0, 1, 2].map((item) => (
                          <div
                            key={item}
                            className="rounded-lg border border-[var(--color-border)] bg-white/62 p-2"
                          >
                            <div className="h-2 w-12 rounded bg-[rgba(32,24,54,0.1)]" />
                            <div className="mt-2 h-4 w-7 rounded bg-[rgba(32,24,54,0.15)]" />
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-white/66">
                        <div className="grid grid-cols-[42px_minmax(0,1fr)_54px] gap-2 border-b border-[var(--color-border)] px-2.5 py-2 text-[7px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
                          <span>Hora</span>
                          <span>Turno</span>
                          <span>Estado</span>
                        </div>
                        {[0, 1].map((item) => (
                          <div
                            key={item}
                            className="grid grid-cols-[42px_minmax(0,1fr)_54px] items-center gap-2 border-b border-[var(--color-border)] px-2.5 py-2.5 last:border-b-0"
                          >
                            <span className="h-2.5 w-8 rounded bg-[rgba(253,134,6,0.32)]" />
                            <span>
                              <span className="block h-2.5 w-24 max-w-full rounded bg-[rgba(32,24,54,0.14)]" />
                              <span className="mt-1.5 block h-2 w-16 rounded bg-[rgba(32,24,54,0.08)]" />
                            </span>
                            <span className="h-4 rounded-full bg-[rgba(253,134,6,0.16)]" />
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-white/58 p-2">
                        <div className="h-3 w-24 rounded bg-[rgba(32,24,54,0.12)]" />
                        <div className="mt-2 grid grid-cols-7 gap-1">
                          {Array.from({ length: 21 }).map((_, index) => (
                            <span
                              key={index}
                              className={`h-2.5 rounded ${
                                index === 10
                                  ? "bg-[var(--color-ink)]"
                                  : index % 4 === 0
                                    ? "bg-[#569165]/45"
                                    : "bg-[rgba(32,24,54,0.08)]"
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  </div>

                  <div className="landing-mobile-reservation-toast">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-[rgba(253,134,6,0.16)] text-xs font-semibold text-[var(--color-accent)]">
                      TS
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-white">Nueva reserva recibida</p>
                      <div className="mt-1 h-2 w-28 rounded bg-white/18" />
                    </div>
                    <span className="h-2 w-2 rounded-full bg-[#72d59b]" />
                  </div>
                </div>

                <div
                  className="landing-product-mobile-board landing-product-booking-board"
                  aria-hidden="true"
                >
                  <LandingHeroParticles className="landing-hero-particles--attached landing-hero-particles--mobile" />
                  <div className="relative h-[440px] rounded-[34px] border border-white/20 bg-[#171123] p-[5px] shadow-[0_24px_64px_rgba(4,2,12,0.28)]">
                    <span className="absolute -left-[3px] top-[86px] h-9 w-[3px] rounded-l-full bg-[#302842]" />
                    <span className="absolute -left-[3px] top-[132px] h-14 w-[3px] rounded-l-full bg-[#302842]" />
                    <span className="absolute -right-[3px] top-[108px] h-12 w-[3px] rounded-r-full bg-[#302842]" />

                    <div className="flex h-full flex-col overflow-hidden rounded-[29px] bg-white p-4 text-[var(--color-ink)]">
                      <div className="relative mb-2 h-2.5">
                        <span className="absolute left-1/2 top-0.5 h-[3px] w-8 -translate-x-1/2 rounded-full bg-[#292136]" />
                        <span className="absolute right-1 top-0 h-1.5 w-1.5 rounded-full bg-[#292136]" />
                      </div>

                      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-accent)]">
                          Barbería Norte
                        </p>
                        <p className="mt-1 text-xl font-semibold tracking-[-0.03em]">
                          Reservá tu turno
                        </p>
                      </div>
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-ink)] text-[10px] font-semibold text-white">
                        BN
                      </span>
                      </div>

                      <div className="mt-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
                          Servicio:
                        </p>
                        <div className="mt-1.5 flex items-center justify-between rounded-xl border border-[rgba(253,134,6,0.38)] bg-[rgba(253,134,6,0.07)] px-3 py-2">
                          <div>
                            <p className="text-xs font-semibold">Corte de pelo</p>
                            <p className="mt-0.5 text-[10px] text-[var(--color-muted-strong)]">30 min</p>
                          </div>
                          <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-accent)]" />
                        </div>
                      </div>

                      <div className="mt-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
                          Elegí un día:
                        </p>
                        <div className="mt-1.5 grid grid-cols-5 gap-1.5">
                          {["Lun 20", "Mar 21", "Mié 22", "Jue 23", "Vie 24"].map((day, index) => (
                            <span
                              key={day}
                              className={`rounded-lg border px-1 py-2 text-center text-[9px] font-semibold ${
                                index === 2
                                  ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                                  : "border-[var(--color-border)] bg-[rgba(32,24,54,0.025)] text-[var(--color-muted-strong)]"
                              }`}
                            >
                              {day}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="mt-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
                          Elegí un horario:
                        </p>
                        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                          {["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"].map((time) => (
                            <span
                              key={time}
                              className={`rounded-lg border px-2 py-2 text-center text-[10px] font-semibold ${
                                time === "10:30"
                                  ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                                  : "border-[var(--color-border)] bg-white text-[var(--color-muted-strong)]"
                              }`}
                            >
                              {time}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="mt-auto w-full rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-center text-xs font-semibold text-white">
                        Reservar turno
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
          <div className="landing-hero-wave" aria-hidden="true" />
        </section>

        <section
          id="funciones"
          className="landing-functions-section soft-section-divider scroll-mt-24 px-5 py-14 sm:px-7 lg:py-16"
        >
          <div className="mx-auto max-w-7xl">
            <motion.div
              className="mx-auto max-w-4xl text-center"
              initial={revealInitial}
              whileInView={revealInView}
              viewport={motionViewport}
              transition={smoothTransition}
            >
              <p className="landing-section-eyebrow">
                Funciones
              </p>
              <h2 className="landing-page-title mx-auto mt-4 max-w-3xl text-3xl font-semibold leading-[1.08] tracking-[-0.04em] sm:text-4xl lg:text-[3.35rem]">
                Todo para gestionar tus turnos.
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-[0.95rem] leading-7 text-[var(--color-muted-strong)]">
                Agenda, clientes y equipo en un solo lugar.
              </p>
            </motion.div>

            <div className="landing-functions-layout mt-11">
              <motion.article
                className="landing-feature-card landing-function-block landing-function-block--agenda"
                data-pause-when-offscreen
                initial={featureInitial}
                whileInView={featureInView}
                viewport={featureViewport}
                transition={featureTransition}
              >
                <div className="landing-function-copy">
                  <p className="landing-function-eyebrow">01 · Agenda clara</p>
                  <h3>Todos tus turnos, claros de un vistazo.</h3>
                  <p>
                    Horarios, responsables y estados en una sola vista.
                  </p>
                  <div className="landing-function-points">
                    <span>Vista diaria, semanal y mensual.</span>
                    <span>Señas y pagos visibles.</span>
                    <span>Reprogramación desde el turno.</span>
                  </div>
                </div>

                <motion.div
                  className="landing-appointment-stream"
                  aria-label="Turnos entrando a la agenda"
                  initial={shouldReduceMotion ? false : { opacity: 0 }}
                  whileInView={shouldReduceMotion ? undefined : { opacity: 1 }}
                  viewport={motionViewport}
                  transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.16 }}
                >
                  <div className="landing-appointment-plane">
                    {[
                      [
                        ["09:00", "Corte de pelo", "Confirmado"],
                        ["10:30", "Limpieza dental", "Señado"],
                        ["12:00", "Color y corte", "En espera"],
                        ["14:30", "Consulta odontológica", "Pagado"],
                        ["16:00", "Barba completa", "Confirmado"]
                      ],
                      [
                        ["09:30", "Control mensual", "Señado"],
                        ["11:00", "Consulta inicial", "Confirmado"],
                        ["13:30", "Perfilado", "Pagado"],
                        ["15:00", "Ortodoncia", "En espera"],
                        ["18:00", "Corte + barba", "Confirmado"]
                      ]
                    ].map((column, columnIndex) => (
                      <div
                        key={columnIndex}
                        className={`landing-appointment-track landing-appointment-track--${columnIndex + 1}`}
                      >
                        {[0, 1, 2].map((groupIndex) => (
                          <div key={groupIndex} className="landing-appointment-group" aria-hidden={groupIndex > 0}>
                            {column.map(([time, service, status]) => (
                              <div key={`${service}-${time}-${groupIndex}`} className="landing-appointment-pill">
                                <span>{time}</span>
                                <strong>{service}</strong>
                                <small data-status={status}>{status}</small>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </motion.div>

                <LandingCardDots />
              </motion.article>

              <div className="landing-functions-split">
                <motion.article
                  className="landing-feature-card landing-function-block landing-function-block--booking landing-function-card-dark"
                  data-pause-when-offscreen
                  initial={featureInitial}
                  whileInView={featureInView}
                  whileHover={shouldReduceMotion ? undefined : { y: -4 }}
                  viewport={featureViewport}
                  transition={{ ...featureTransition, delay: 0.1 }}
                >
                  <div className="landing-function-copy">
                    <span className="landing-function-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none">
                        <path d="M8 12h8M8 16h5M7 4.5h10A2.5 2.5 0 0 1 19.5 7v10A2.5 2.5 0 0 1 17 19.5H7A2.5 2.5 0 0 1 4.5 17V7A2.5 2.5 0 0 1 7 4.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                        <path d="M8 8h.01M12 8h.01M16 8h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                      </svg>
                    </span>
                    <p className="landing-function-eyebrow">02 · Reserva pública</p>
                    <h3>Reservas online, sin mensajes de por medio.</h3>
                    <p>
                      El cliente elige servicio y horario. Tu agenda se actualiza sola.
                    </p>
                    <div className="landing-function-points">
                      <span>Reservas 24/7 desde cualquier dispositivo.</span>
                      <span>Disponibilidad real según sede, servicio y profesional.</span>
                      <span>Señas y pagos listos para escalar la operación.</span>
                    </div>
                  </div>

                  <LandingBookingAnimation shouldReduceMotion={shouldReduceMotion}>
                    {({ bookingPreview, visibleBookingPreviewPhase }) => (
                      <motion.div
                        className="landing-booking-preview"
                        aria-label="Vista previa de reserva online"
                        initial={previewInitial}
                        whileInView={previewInView}
                        viewport={motionViewport}
                        transition={{ ...smoothTransition, delay: 0.2 }}
                      >
                        <div className="landing-booking-stage">
                        <div className="landing-booking-grid">
                          <motion.div
                            key={bookingPreview.service}
                            className="landing-booking-services"
                            initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
                            animate={visibleBookingPreviewPhase === 3 ? { opacity: 0, y: -5 } : { opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                          >
                            <small>Servicio</small>
                            <span className={visibleBookingPreviewPhase >= 1 && visibleBookingPreviewPhase < 3 ? "is-selected" : undefined}>
                              <strong>{bookingPreview.service}</strong>
                              <small>{bookingPreview.duration}</small>
                            </span>
                          </motion.div>

                          <motion.div
                            key={`${bookingPreview.service}-hours`}
                            className="landing-booking-hours"
                            initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
                            animate={visibleBookingPreviewPhase === 3 ? { opacity: 0, y: -5 } : { opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                          >
                            <small>Horario</small>
                            {bookingPreview.hours.map((hour) => (
                              <span
                                key={hour}
                                className={visibleBookingPreviewPhase === 2 && hour === bookingPreview.selectedHour ? "is-selected" : undefined}
                              >
                                {hour}
                              </span>
                            ))}
                          </motion.div>

                        <div className={`landing-booking-confirm${visibleBookingPreviewPhase === 2 ? " is-visible" : ""}`}>
                            <span>
                              <img
                                src={statusCheckIcon}
                                alt=""
                                aria-hidden="true"
                                width="24"
                                height="24"
                                className="h-6 w-6 brightness-0 invert"
                              />
                            </span>
                          <strong>Turno confirmado</strong>
                          <small>{bookingPreview.service} · {bookingPreview.selectedHour}</small>
                        </div>
                          </div>
                        </div>
                        <LandingCardDots count={11} />
                      </motion.div>
                    )}
                  </LandingBookingAnimation>
                </motion.article>

                <motion.article
                  className="landing-feature-card landing-function-block landing-function-block--clients landing-function-card-dark"
                  data-pause-when-offscreen
                  initial={featureInitial}
                  whileInView={featureInView}
                  whileHover={shouldReduceMotion ? undefined : { y: -4 }}
                  viewport={featureViewport}
                  transition={{ ...featureTransition, delay: 0.22 }}
                >
                  <div className="landing-function-copy">
                    <span className="landing-function-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none">
                        <path d="M9.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4.5 18.5c.8-2.6 2.55-4.1 5-4.1s4.2 1.5 5 4.1M16.5 11.5a2.45 2.45 0 1 0 0-4.9M15.5 14.5c1.9.2 3.25 1.45 4 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                      </svg>
                    </span>
                    <p className="landing-function-eyebrow">03 · Clientes y equipo</p>
                    <h3>Clientes y equipo, cada uno en su lugar.</h3>
                    <p>
                      Historial, responsables y permisos claros desde un mismo panel.
                    </p>
                    <div className="landing-function-points">
                      <span>Clientes duplicados reducidos por teléfono o email.</span>
                      <span>Roles para propietario, administrador y miembros.</span>
                      <span>Ausencias, pagos y seguimiento en un mismo perfil.</span>
                    </div>
                  </div>

                  <motion.div
                    className="landing-client-preview"
                    aria-label="Vista previa de clientes y equipo"
                    initial={previewInitial}
                    whileInView={previewInView}
                    viewport={motionViewport}
                    transition={{ ...smoothTransition, delay: 0.26 }}
                  >
                    <div className="landing-system-mini-panel">
                      <div className="landing-system-mini-header">
                        <div>
                          <strong>Clientes</strong>
                          <span>Todo en un perfil</span>
                        </div>
                        <small>Activo</small>
                      </div>
                      <div className="landing-system-mini-card">
                        <div className="landing-system-mini-person">
                          <span>JP</span>
                          <div>
                            <strong>Juan Pérez</strong>
                            <small>11 2345-6789</small>
                          </div>
                        </div>
                        <div className="landing-system-mini-labels">
                          <span>Sin ausencias</span>
                        </div>
                      </div>
                    </div>

                    <div className="landing-system-mini-panel">
                      <div className="landing-system-mini-header">
                        <div>
                          <strong>Tu equipo</strong>
                          <span>Roles claros</span>
                        </div>
                        <small>Disponible</small>
                      </div>
                      <div className="landing-system-mini-card">
                        <div className="landing-system-mini-person">
                          <span>SD</span>
                          <div>
                            <strong>Sofía Díaz <small>Propietaria</small></strong>
                            <small>Sede principal</small>
                          </div>
                        </div>
                        <div className="landing-system-mini-labels">
                          <span>Toma turnos</span>
                        </div>
                      </div>
                    </div>
                    <LandingCardDots count={11} />
                  </motion.div>
                </motion.article>
              </div>

            </div>
          </div>
        </section>

        <section id="pricing" className="landing-pricing-section scroll-mt-24 px-5 py-12 sm:px-7">
          <div className="mx-auto max-w-7xl">
            <div data-scroll-reveal className="landing-scroll-reveal landing-rise landing-pricing-heading">
                <p className="landing-section-eyebrow">Precios</p>
                <h2 className="landing-page-title">
                  Un plan para cada etapa de tu negocio.
                </h2>
                <p>
                  Empezá con lo que necesitás hoy y cambiá de plan cuando tu equipo crezca.
                </p>
            </div>

            <div className="landing-pricing-grid">
                {billingPlans.map((plan) => (
                  <article
                    key={plan.name}
                    data-scroll-reveal
                    className={`landing-scroll-reveal landing-pricing-card${plan.recommended ? " is-recommended" : ""}`}
                  >
                    {plan.recommended && (
                      <span className="landing-pricing-badge">
                        Más elegido
                      </span>
                    )}
                    <h3>{plan.name}</h3>
                    <p className="landing-pricing-description">
                      {plan.description}
                    </p>

                    <div className="landing-pricing-price">
                      <p>
                        {formatPlanPrice(prices.data, plan.id)}
                      </p>
                      <span>
                        {plan.period}
                      </span>
                    </div>

                    <div className="landing-pricing-features">
                      {plan.features.map((feature) => (
                        <p key={feature}>
                          <span />
                          {feature}
                        </p>
                      ))}
                    </div>

                    <div className="landing-pricing-action">
                      <Link
                        to={`/register?plan=${plan.id}`}
                        {...authPreloadHandlers}
                        className="landing-cta"
                      >
                        <span>{plan.recommended ? "Empezar con Profesional" : `Elegir ${plan.name}`}</span>
                      </Link>
                    </div>
                  </article>
                ))}
            </div>

            <div data-scroll-reveal className="landing-scroll-reveal landing-rise landing-delay-3 landing-pricing-notes">
              <div>
                {[
                  ["Prueba gratis", "7 días del plan Inicial"],
                  ["Pagos", "Suscripción mensual con Mercado Pago"],
                  ["Cambio de plan", "Podés mejorar cuando el negocio crece"],
                  ["Cancelación", "Sin permanencia mínima"]
                ].map(([title, copy]) => (
                  <div
                    key={title}
                  >
                    <p>{title}</p>
                    <span>{copy}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <footer className="landing-footer">
          <div className="landing-contact-wrap">
            <section data-scroll-reveal id="contact" className="landing-scroll-reveal landing-contact scroll-mt-24">
              <div className="landing-contact-copy">
                <p className="landing-section-eyebrow">Contacto</p>
                <h2>Estamos para ayudarte a avanzar.</h2>
                <p>
                  Elegí el canal adecuado y conversemos sobre tu cuenta, tu equipo o el plan que mejor acompaña tu operación.
                </p>
              </div>

              <div className="landing-contact-options">
                <a href="mailto:hola@turnosi.com?subject=Consulta%20sobre%20TurnoSi" className="landing-contact-option">
                  <span className="landing-contact-number">01</span>
                  <div>
                    <p>Soporte y consultas</p>
                    <span>Configuración, cuenta y uso diario.</span>
                    <strong>hola@turnosi.com <span aria-hidden="true">↗</span></strong>
                  </div>
                </a>

                <a href="mailto:hola@turnosi.com?subject=Consulta%20comercial%20TurnoSi" className="landing-contact-option">
                  <span className="landing-contact-number">02</span>
                  <div>
                    <p>Planes para equipos</p>
                    <span>Multi-sede, volumen y necesidades comerciales.</span>
                    <strong>Hablar con nosotros <span aria-hidden="true">↗</span></strong>
                  </div>
                </a>
              </div>
            </section>
          </div>

          <div className="landing-footer-surface">
            <div className="landing-footer-inner">
              <section data-scroll-reveal className="landing-scroll-reveal landing-footer-cta">
                <div>
                  <p className="landing-footer-kicker">Empezá hoy</p>
                  <h3>Tu agenda puede trabajar mejor desde ahora.</h3>
                  <p>Probá TurnoSi durante 7 días. Sin tarjeta y sin permanencia.</p>
                </div>
                <Link
                  to="/register"
                  {...authPreloadHandlers}
                  className="landing-cta landing-footer-cta-button"
                >
                  Crear cuenta gratis <span aria-hidden="true">→</span>
                </Link>
              </section>

              <div className="landing-footer-main">
                <div className="landing-footer-brand">
                  <div className="py-3"><LandingBrand /></div>
                  <p>Turnos, clientes y equipo conectados para trabajar con más orden.</p>
                </div>

                <nav className="landing-footer-nav" aria-label="Navegación del pie de página">
                  <div>
                    <p>Producto</p>
                    <a href="#funciones">Funciones</a>
                    <a href="#pricing">Precios</a>
                    <a href="#inicio">Inicio</a>
                  </div>
                  <div>
                    <p>Cuenta</p>
                    <Link to="/login" {...authPreloadHandlers}>Ingresar</Link>
                    <Link to="/register" {...authPreloadHandlers}>Crear cuenta</Link>
                    <a href="#contact">Contacto</a>
                  </div>
                  <div>
                    <p>Escribinos</p>
                    <a href="mailto:hola@turnosi.com">hola@turnosi.com</a>
                    <span>Argentina</span>
                  </div>
                </nav>
              </div>

              <div className="landing-footer-bottom">
                <p>© 2026 TurnoSi. Todos los derechos reservados.</p>
                <a href="#inicio">Volver arriba <span aria-hidden="true">↑</span></a>
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
