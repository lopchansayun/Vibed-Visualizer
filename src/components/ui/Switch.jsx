export default function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-xs font-medium text-text-muted hover:text-text"
    >
      <span
        className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-amber' : 'bg-border'
        }`}
      >
        <span
          className={`inline-block h-3 w-3 transform rounded-full bg-panel transition-transform ${
            checked ? 'translate-x-3.5' : 'translate-x-0.5'
          }`}
        />
      </span>
      {label && <span>{label}</span>}
    </button>
  )
}
