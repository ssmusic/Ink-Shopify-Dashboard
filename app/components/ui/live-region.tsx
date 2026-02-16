export function LiveRegion({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="sr-only" role="status" aria-live="polite">
      {message}
    </div>
  );
}
