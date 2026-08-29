import { useState } from "react";

import { browserCases, type BrowserCase } from "./case-manifest.js";

function CaseIndex() {
  return (
    <main className="benchmark-shell" data-heapsleuth-index="true">
      <p className="eyebrow">HeapSleuth benchmark dataset</p>
      <h1>Benchmark cases</h1>
      <p>Select an isolated synthetic interaction scenario.</p>
      <ul className="case-list">
        {browserCases.map((benchmarkCase) => (
          <li key={benchmarkCase.id}>
            <a
              data-heapsleuth-case-link={benchmarkCase.id}
              href={benchmarkCase.route}
            >
              <strong>{benchmarkCase.title}</strong>
              <span>{benchmarkCase.description}</span>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}

function CasePage({ benchmarkCase }: { benchmarkCase: BrowserCase }) {
  const [isMounted, setIsMounted] = useState(false);
  const CaseComponent = benchmarkCase.Component;

  return (
    <main
      className="benchmark-shell"
      data-heapsleuth-case-id={benchmarkCase.id}
      data-heapsleuth-ready="true"
    >
      <a className="back-link" href="/">
        All cases
      </a>
      <p className="eyebrow">HeapSleuth benchmark scenario</p>
      <h1>{benchmarkCase.title}</h1>
      <p>{benchmarkCase.description}</p>
      <button
        data-heapsleuth-toggle
        type="button"
        onClick={() => setIsMounted((current) => !current)}
      >
        {isMounted ? benchmarkCase.closeLabel : benchmarkCase.openLabel}
      </button>
      {isMounted ? <CaseComponent /> : null}
    </main>
  );
}

export function App() {
  const pathname = window.location.pathname;

  if (pathname === "/") {
    return <CaseIndex />;
  }

  const benchmarkCase = browserCases.find(({ route }) => route === pathname);
  if (benchmarkCase === undefined) {
    return (
      <main className="benchmark-shell">
        <h1>HeapSleuth benchmark</h1>
        <p>Unknown benchmark route.</p>
        <a href="/">View all cases</a>
      </main>
    );
  }

  return <CasePage benchmarkCase={benchmarkCase} />;
}
