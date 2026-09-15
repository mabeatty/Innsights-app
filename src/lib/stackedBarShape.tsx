// Recharts doesn't support "round only the visual top of a stack" out of
// the box — giving every segment radius=[3,3,0,0] rounds each segment's own
// top corners independently, which looks like a stack of separate pills
// rather than one bar with a rounded top. This renders a plain rect for
// every segment except whichever one is topmost for that row (the last key,
// in stacking order, with a nonzero value), which gets rounded top corners
// instead — matching how a single-color bar (e.g. Company Financials'
// actual/budget bars) naturally looks.

export function getTopmostKey(row: Record<string, any>, keysInStackOrder: string[]): string | undefined {
  for (let i = keysInStackOrder.length - 1; i >= 0; i--) {
    const key = keysInStackOrder[i];
    if (Number(row[key]) > 0) return key;
  }
  return undefined;
}

function roundedTopRectPath(x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.max(0, Math.min(radius, width / 2, height));
  return `M${x},${y + height} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${y + height} Z`;
}

// Pass as a Bar's `shape` prop. `row` is that Bar's own chart data row
// (used only to look up its own value/topmost status; recharts also passes
// `payload` with the row, which is what's actually used at render time).
export function makeStackedBarShape(thisKey: string, keysInStackOrder: string[], radius = 3) {
  return (props: any) => {
    const { x, y, width, height, fill, fillOpacity, payload } = props;
    if (!height || height <= 0 || !width || width <= 0) return null;
    const isTopmost = getTopmostKey(payload ?? {}, keysInStackOrder) === thisKey;
    if (isTopmost) {
      return <path d={roundedTopRectPath(x, y, width, height, radius)} fill={fill} fillOpacity={fillOpacity} />;
    }
    return <rect x={x} y={y} width={width} height={height} fill={fill} fillOpacity={fillOpacity} />;
  };
}
