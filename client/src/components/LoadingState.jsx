export default function LoadingState() {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>Generating your study set…</span>
    </div>
  );
}
