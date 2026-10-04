"use client";

import { useLayoutEffect, useRef, useState } from "react";

export function RollingValue({ value }: { value: string }) {
  const lastValue = useRef(value);
  const [previous, setPrevious] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (lastValue.current === value) return;
    // Show only the old and new measured values. The transition never invents
    // intermediate counts that did not come from the database.
    setPrevious(lastValue.current);
    lastValue.current = value;
    const timer = window.setTimeout(() => setPrevious(null), 650);
    return () => window.clearTimeout(timer);
  }, [value]);

  return <span className="count-window inline-grid overflow-hidden align-bottom" role="text" aria-label={value}>
    {previous !== null && <span key={previous} aria-hidden="true" className="count-old col-start-1 row-start-1">{previous}</span>}
    <span key={value} aria-hidden="true" className={`col-start-1 row-start-1 ${previous !== null ? "count-new" : ""}`}>{value}</span>
  </span>;
}
