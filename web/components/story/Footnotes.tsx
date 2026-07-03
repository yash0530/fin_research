/** Footer footnotes section: "How to read this" + disclaimer lines. */
export function Footnotes({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;

  return (
    <footer className="story-footer">
      <div className="big">How to read this</div>
      {notes.map((note, i) => (
        <p key={i} style={{ margin: "0 0 6px" }}>
          {note}
        </p>
      ))}
    </footer>
  );
}
