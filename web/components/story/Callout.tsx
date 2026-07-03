/** Callout block: accent-soft background with left accent border. */
export function Callout({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <div className="callout">
      {title && <b>{title}</b>}
      {title && " "}
      {children}
    </div>
  );
}
