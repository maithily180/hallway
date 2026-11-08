import { cx } from "./format";

/** Category art used until a listing has photos: tinted tile with an outline glyph. */
const ART: Record<string, { hue: string; ink: string; d: string }> = {
  projector: { hue: "#fde7dc", ink: "#c8461d", d: "M3 8h18v9H3z M7 17v2 M17 17v2 M15 12.5a2.5 2.5 0 1 0 0-.01 M6 11h4" },
  drill: { hue: "#fff1d6", ink: "#a8660a", d: "M3 7h12v6H3z M15 9h6 M9 13l-2 8h4l1-8" },
  tools: { hue: "#fff1d6", ink: "#a8660a", d: "M7 3l3 18 M17 3l-3 18 M8 8h8 M9 14h6" },
  bike: { hue: "#e2f2e9", ink: "#23764a", d: "M6 17a3.5 3.5 0 1 0 0-.01 M18 17a3.5 3.5 0 1 0 0-.01 M6 17l4-8h5l3 8 M10 9l-1-3H7 M15 9l1-3h2" },
  lamp: { hue: "#fff6cf", ink: "#9a7a00", d: "M8 3h8l3 7H5l3-7Z M12 10v9 M8 21h8" },
  monitor: { hue: "#e4ecfb", ink: "#2f5bb7", d: "M3 4h18v12H3z M9 20h6 M12 16v4" },
  speaker: { hue: "#efe6fb", ink: "#6b3fb2", d: "M6 3h12v18H6z M12 15a3 3 0 1 0 0-.01 M12 7h.01" },
  kitchen: { hue: "#e0f2f1", ink: "#1f7a72", d: "M5 10h14v8a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-8Z M3 10h18 M9 6c0-1 1-1 1-2 M14 6c0-1 1-1 1-2" },
  textbook: { hue: "#fbe4e9", ink: "#a8304f", d: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z M4 19a2 2 0 0 1 2-2h13 M8 7h7" },
  other: { hue: "#ece7df", ink: "#6f665b", d: "M4 7l8-4 8 4v10l-8 4-8-4V7Z M4 7l8 4 8-4 M12 11v10" },
};

export function ItemThumb({
  category,
  photo,
  alt = "",
  className,
}: {
  category: string;
  photo?: string;
  alt?: string;
  className?: string;
}) {
  const art = ART[category] ?? ART.other;
  return (
    <div
      className={cx("relative flex items-center justify-center overflow-hidden", className)}
      style={photo ? undefined : { background: art.hue }}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt={alt} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke={art.ink}
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-2/5 w-2/5 max-h-20 max-w-20"
          role="img"
          aria-label={alt || category}
        >
          <path d={art.d} />
        </svg>
      )}
    </div>
  );
}
