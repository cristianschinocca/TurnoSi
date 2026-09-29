type ModalCloseButtonProps = {
  disabled?: boolean;
  label?: string;
  onClick: () => void;
};

export function ModalCloseButton({
  disabled = false,
  label = "Cerrar",
  onClick
}: ModalCloseButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="group grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--color-border-strong)] bg-white/70 text-[var(--color-ink)] transition-all duration-200 hover:border-[var(--color-accent)] hover:bg-white hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="relative h-4 w-4 transition-transform duration-200 group-hover:rotate-90">
        <span className="absolute left-1/2 top-1/2 h-0.5 w-4 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-full bg-current" />
        <span className="absolute left-1/2 top-1/2 h-0.5 w-4 -translate-x-1/2 -translate-y-1/2 -rotate-45 rounded-full bg-current" />
      </span>
    </button>
  );
}
