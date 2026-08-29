import type { ComponentType } from "react";

import { ClosureRegistryCase } from "../cases/ClosureRegistryCase.js";
import { DetachedDomCase } from "../cases/DetachedDomCase.js";
import { EventBusCase } from "../cases/EventBusCase.js";
import { EventListenerCase } from "../cases/EventListenerCase.js";
import { GlobalCacheCase } from "../cases/GlobalCacheCase.js";
import { HealthyControlCase } from "../cases/HealthyControlCase.js";
import { IntervalCase } from "../cases/IntervalCase.js";
import { ResizeObserverCase } from "../cases/ResizeObserverCase.js";

export type BrowserCase = {
  id: string;
  route: string;
  title: string;
  description: string;
  openLabel: string;
  closeLabel: string;
  Component: ComponentType;
};

export const browserCases: readonly BrowserCase[] = [
  {
    id: "event-listener",
    route: "/cases/event-listener",
    title: "Notification preview",
    description: "Open and close a notification preview repeatedly.",
    openLabel: "Open preview",
    closeLabel: "Close preview",
    Component: EventListenerCase,
  },
  {
    id: "interval",
    route: "/cases/interval",
    title: "Live activity",
    description: "Open and close a live activity card repeatedly.",
    openLabel: "Open activity",
    closeLabel: "Close activity",
    Component: IntervalCase,
  },
  {
    id: "resize-observer",
    route: "/cases/resize-observer",
    title: "Responsive preview",
    description: "Open and close a responsive preview repeatedly.",
    openLabel: "Open preview",
    closeLabel: "Close preview",
    Component: ResizeObserverCase,
  },
  {
    id: "detached-dom",
    route: "/cases/detached-dom",
    title: "Temporary details",
    description: "Open and close a temporary details panel repeatedly.",
    openLabel: "Open details",
    closeLabel: "Close details",
    Component: DetachedDomCase,
  },
  {
    id: "global-cache",
    route: "/cases/global-cache",
    title: "Recent item",
    description: "Open and close a recently viewed item repeatedly.",
    openLabel: "Open item",
    closeLabel: "Close item",
    Component: GlobalCacheCase,
  },
  {
    id: "closure-registry",
    route: "/cases/closure-registry",
    title: "Report preview",
    description: "Open and close a report preview repeatedly.",
    openLabel: "Open report",
    closeLabel: "Close report",
    Component: ClosureRegistryCase,
  },
  {
    id: "event-bus",
    route: "/cases/event-bus",
    title: "Message center",
    description: "Open and close a message center repeatedly.",
    openLabel: "Open messages",
    closeLabel: "Close messages",
    Component: EventBusCase,
  },
  {
    id: "healthy-control",
    route: "/cases/healthy-control",
    title: "Temporary summary",
    description: "Open and close a temporary summary repeatedly.",
    openLabel: "Open summary",
    closeLabel: "Close summary",
    Component: HealthyControlCase,
  },
];
