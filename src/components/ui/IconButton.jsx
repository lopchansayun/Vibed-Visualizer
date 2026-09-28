export default function IconButton({ icon: Icon, label, onClick, active, disabled, variant = 'default', className = '', showLabel = true }) {
  const variants = {
    default:
      'text-text-muted hover:text-text hover:bg-panel-raised',
    primary:
      'text-bg bg-amber hover:brightness-110',
    danger:
      'text-red hover:bg-red-soft',
  }
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-md border border-transparent px-2.5 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        active ? 'bg-panel-raised text-text border-border' : ''
      } ${variants[variant]} ${className}`}
    >
      {Icon ? <Icon size={16} strokeWidth={2} /> : null}
      {showLabel && <span>{label}</span>}
    </button>
  )
}
