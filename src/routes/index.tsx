import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import PosetCanvas, { type PosetNode } from "../components/PosetCanvas";
import { isPosetIsomorphic } from "../lib/posetIsomorphism";
import { constructInstance, type Edge } from "../lib/posetToPreferences";
import { RotationPoset } from "../lib/rotationPoset";
import {
  ROOMMATES_EXAMPLES,
  generateAlgorithmSteps,
  generateRandomRoommatesInstance,
  getStablePairs,
  validateRoommatesPreferences,
  type AlgorithmStep,
} from "../lib/stableRoommates";

type UrlState = {
  nodes: Array<{ x: number; y: number }>;
  edges: Edge[];
};

type TabId = "poset" | "roommates";

export const Route = createFileRoute("/")({
  component: MatchingVisualisationsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    state: typeof search.state === "string" ? search.state : undefined,
    tab:
      search.tab === "roommates" || search.tab === "poset"
        ? search.tab
        : undefined,
  }),
});

const VIEW_CENTER = { x: 50, y: 30 };
const VIEWBOX = { width: 100, height: 60 };
const NODE_RADIUS = 4;
const MIN_RANDOM_N = 1;
const MAX_RANDOM_N = 40;
const MIN_ROOMMATES_RANDOM_N = 4;
const MAX_ROOMMATES_RANDOM_N = 20;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const clampInt = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)));

const createNode = (id: number, total: number): PosetNode => {
  const angle = (id / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2;
  const radius = 22;
  return {
    id,
    x: VIEW_CENTER.x + Math.cos(angle) * radius,
    y: VIEW_CENTER.y + Math.sin(angle) * radius,
  };
};

const createNodes = (count: number): PosetNode[] =>
  Array.from({ length: count }, (_, index) => createNode(index, count));

const formatPref = (prefs: number[], prefix: string) =>
  prefs.map((value) => `${prefix}${value}`).join(" > ");

const shuffle = <T,>(items: T[]) => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

const layoutTreeNodes = (n: number): PosetNode[] => {
  if (n <= 0) return [];
  const levels: number[][] = [];
  let index = 0;
  let level = 0;
  while (index < n) {
    const count = Math.min(2 ** level, n - index);
    levels.push(Array.from({ length: count }, (_, i) => index + i));
    index += count;
    level += 1;
  }

  const maxLevel = levels.length - 1;
  return levels.flatMap((layer, depth) => {
    const spacing = VIEWBOX.width / (layer.length + 1);
    const y =
      maxLevel === 0
        ? VIEW_CENTER.y
        : NODE_RADIUS +
          (VIEWBOX.height - NODE_RADIUS * 2) * (depth / maxLevel);
    return layer.map((id, position) => ({
      id,
      x: clamp(spacing * (position + 1), NODE_RADIUS, VIEWBOX.width - NODE_RADIUS),
      y: clamp(y, NODE_RADIUS, VIEWBOX.height - NODE_RADIUS),
    }));
  });
};

const buildBalancedTree = (n: number) => {
  const edges: Edge[] = [];
  for (let i = 0; i < n; i += 1) {
    const left = 2 * i + 1;
    const right = 2 * i + 2;
    if (left < n) edges.push({ from: i, to: left });
    if (right < n) edges.push({ from: i, to: right });
  }
  return edges;
};

const relabelEdges = (edges: Edge[], mapping: number[]) =>
  edges.map((edge) => ({
    from: mapping[edge.from],
    to: mapping[edge.to],
  }));

const encodeState = (state: UrlState) =>
  encodeURIComponent(JSON.stringify(state));

const decodeState = (value?: string): UrlState | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(value));
    if (!parsed || typeof parsed !== "object") return null;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    return parsed as UrlState;
  } catch {
    return null;
  }
};

const restoreState = (value?: string) => {
  const decoded = decodeState(value);
  if (!decoded) return null;

  const count = decoded.nodes.length;
  if (count < 1) return null;

  const nodes = decoded.nodes.map((node, index) => {
    const fallback = createNode(index, count);
    const rawX = typeof node?.x === "number" ? node.x : fallback.x;
    const rawY = typeof node?.y === "number" ? node.y : fallback.y;
    return {
      id: index,
      x: clamp(rawX, NODE_RADIUS, VIEWBOX.width - NODE_RADIUS),
      y: clamp(rawY, NODE_RADIUS, VIEWBOX.height - NODE_RADIUS),
    };
  });

  const edges: Edge[] = [];
  const seen = new Set<string>();
  for (const edge of decoded.edges) {
    if (!edge || typeof edge.from !== "number" || typeof edge.to !== "number") {
      continue;
    }
    const from = Math.floor(edge.from);
    const to = Math.floor(edge.to);
    if (from === to || from < 0 || to < 0 || from >= count || to >= count) {
      continue;
    }
    const key = `${from}-${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ from, to });
  }

  return { nodes, edges };
};

function MatchingVisualisationsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const restored = useMemo(() => restoreState(search.state), [search.state]);
  const activeTab: TabId = search.tab ?? "poset";

  const [nodes, setNodes] = useState<PosetNode[]>(() =>
    restored?.nodes ? restored.nodes : createNodes(2),
  );
  const [edges, setEdges] = useState<Edge[]>(() =>
    restored?.edges ? restored.edges : [{ from: 0, to: 1 }],
  );
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [hoveredEdgeKey, setHoveredEdgeKey] = useState<string | null>(null);
  const [randomCount, setRandomCount] = useState<number>(8);
  const urlUpdateTimer = useRef<number | null>(null);

  const [selectedExample, setSelectedExample] =
    useState<string>("Simple 4-Person");
  const [useCustomRoommates, setUseCustomRoommates] = useState(false);
  const [customRoommatesInput, setCustomRoommatesInput] = useState("");
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    const state: UrlState = {
      nodes: nodes.map((node) => ({ x: node.x, y: node.y })),
      edges,
    };
    const encoded = encodeState(state);
    if (encoded === search.state) return;
    if (urlUpdateTimer.current !== null) {
      window.clearTimeout(urlUpdateTimer.current);
    }
    urlUpdateTimer.current = window.setTimeout(() => {
      navigate({
        search: (prev) => ({ ...prev, state: encoded }),
        replace: true,
        resetScroll: false,
      });
    }, 250);
    return () => {
      if (urlUpdateTimer.current !== null) {
        window.clearTimeout(urlUpdateTimer.current);
        urlUpdateTimer.current = null;
      }
    };
  }, [edges, navigate, nodes, search.state]);

  useEffect(() => {
    if (!hoveredEdgeKey) return;
    const stillExists = edges.some(
      (edge) => `${edge.from}-${edge.to}` === hoveredEdgeKey,
    );
    if (!stillExists) {
      setHoveredEdgeKey(null);
    }
  }, [edges, hoveredEdgeKey]);

  const hoveredEdge = useMemo(() => {
    if (!hoveredEdgeKey) return null;
    return (
      edges.find((edge) => `${edge.from}-${edge.to}` === hoveredEdgeKey) ?? null
    );
  }, [edges, hoveredEdgeKey]);

  const computation = useMemo(() => {
    try {
      const posetEdges = edges.map((edge) => [edge.from, edge.to] as [number, number]);
      return {
        result: constructInstance(posetEdges, nodes.length),
        error: null,
      };
    } catch (error) {
      return {
        result: null,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }, [edges, nodes.length]);

  const verification = useMemo(() => {
    if (!computation.result) return null;
    try {
      const rotationPoset = new RotationPoset(
        computation.result.menPrefs,
        computation.result.womenPrefs,
        true,
      );
      const { rotations, edges: rotationEdges } =
        rotationPoset.computeRotationPoset();
      const rotationEdgeList: Edge[] = [];
      Object.entries(rotationEdges).forEach(([fromKey, succs]) => {
        const from = Number(fromKey);
        succs.forEach((to) => rotationEdgeList.push({ from, to }));
      });

      const countMatches = rotations.length === nodes.length;
      const isomorphic = countMatches
        ? isPosetIsomorphic(edges, rotationEdgeList, nodes.length)
        : false;

      return {
        rotationCount: rotations.length,
        rotationEdges: rotationEdgeList,
        isomorphic,
        reason: countMatches
          ? undefined
          : `Rotation count ${rotations.length} does not match input ${nodes.length}.`,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Verification failed.",
      };
    }
  }, [computation.result, edges, nodes.length]);

  const roommatesInput = useMemo(() => {
    if (!useCustomRoommates) {
      const prefs =
        ROOMMATES_EXAMPLES[selectedExample] ?? ROOMMATES_EXAMPLES["Simple 4-Person"];
      return { prefs, inputError: null };
    }

    if (!customRoommatesInput.trim()) {
      return {
        prefs: [] as number[][],
        inputError: "Enter a JSON array of preference lists.",
      };
    }

    try {
      const parsed = JSON.parse(customRoommatesInput);
      if (!Array.isArray(parsed) || !parsed.every(Array.isArray)) {
        return {
          prefs: [] as number[][],
          inputError: "Custom input must be a JSON array of arrays.",
        };
      }
      return { prefs: parsed as number[][], inputError: null };
    } catch {
      return {
        prefs: [] as number[][],
        inputError: "Custom input is not valid JSON.",
      };
    }
  }, [customRoommatesInput, selectedExample, useCustomRoommates]);

  const roommatesValidationError = useMemo(() => {
    if (roommatesInput.inputError) {
      return roommatesInput.inputError;
    }
    return validateRoommatesPreferences(roommatesInput.prefs);
  }, [roommatesInput]);

  const roommatesSteps = useMemo(() => {
    if (roommatesValidationError) {
      return [] as AlgorithmStep[];
    }
    return generateAlgorithmSteps(roommatesInput.prefs);
  }, [roommatesInput.prefs, roommatesValidationError]);

  useEffect(() => {
    setCurrentStepIndex(0);
    setIsPlaying(false);
  }, [roommatesInput.prefs, roommatesValidationError]);

  useEffect(() => {
    if (!isPlaying || roommatesSteps.length === 0) return;
    if (currentStepIndex >= roommatesSteps.length - 1) {
      setIsPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setCurrentStepIndex((prev) => Math.min(prev + 1, roommatesSteps.length - 1));
    }, 1000 / speed);
    return () => window.clearTimeout(timer);
  }, [currentStepIndex, isPlaying, roommatesSteps.length, speed]);

  const currentRoommatesStep =
    roommatesSteps[Math.min(currentStepIndex, Math.max(roommatesSteps.length - 1, 0))];

  const posetStats = computation.result?.info;
  const roommatesStepCount = roommatesSteps.length;

  const switchTab = (tab: TabId) => {
    navigate({
      search: (prev) => ({ ...prev, tab }),
      replace: true,
      resetScroll: false,
    });
  };

  const addNode = () => {
    const nextId = nodes.length;
    setNodes([...nodes, createNode(nextId, nextId + 1)]);
  };

  const removeLastNode = () => {
    if (nodes.length <= 1) return;
    const removedId = nodes[nodes.length - 1].id;
    setNodes(nodes.slice(0, -1));
    setEdges((prev) =>
      prev.filter((edge) => edge.from !== removedId && edge.to !== removedId),
    );
    if (selectedNodeId === removedId) {
      setSelectedNodeId(null);
    }
  };

  const clearEdges = () => {
    setEdges([]);
    setSelectedNodeId(null);
    setHoveredEdgeKey(null);
  };

  const resetGraph = () => {
    setNodes(createNodes(2));
    setEdges([{ from: 0, to: 1 }]);
    setSelectedNodeId(null);
    setHoveredEdgeKey(null);
  };

  const autoLayout = () => {
    setNodes(createNodes(nodes.length));
  };

  const generateBalancedTree = () => {
    const count = clampInt(randomCount, MIN_RANDOM_N, MAX_RANDOM_N);
    const nodesForTree = layoutTreeNodes(count);
    const permutation = shuffle(Array.from({ length: count }, (_, i) => i));
    const nodeMap = new Array<number>(count).fill(0);
    permutation.forEach((newId, oldId) => {
      nodeMap[oldId] = newId;
    });
    setNodes(
      nodesForTree
        .map((node, oldId) => ({ ...node, id: nodeMap[oldId] ?? oldId }))
        .sort((a, b) => a.id - b.id),
    );
    setEdges(relabelEdges(buildBalancedTree(count), nodeMap));
    setSelectedNodeId(null);
    setHoveredEdgeKey(null);
  };

  const handleNodeClick = (nodeId: number) => {
    if (selectedNodeId === null) {
      setSelectedNodeId(nodeId);
      return;
    }
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null);
      return;
    }
    setEdges((prev) => {
      if (prev.some((edge) => edge.from === selectedNodeId && edge.to === nodeId)) {
        return prev;
      }
      return [...prev, { from: selectedNodeId, to: nodeId }];
    });
    setSelectedNodeId(null);
  };

  const handleNodeMove = (nodeId: number, position: { x: number; y: number }) => {
    setNodes((prev) =>
      prev.map((node) => (node.id === nodeId ? { ...node, ...position } : node)),
    );
  };

  const handleRemoveEdge = (edgeToRemove: Edge) => {
    setEdges((prev) =>
      prev.filter(
        (edge) =>
          !(edge.from === edgeToRemove.from && edge.to === edgeToRemove.to),
      ),
    );
    setHoveredEdgeKey(null);
  };

  const handleGenerateRandomRoommates = () => {
    const raw = window.prompt(
      `Enter an even number of people (${MIN_ROOMMATES_RANDOM_N}-${MAX_ROOMMATES_RANDOM_N}).`,
      "6",
    );
    const parsed = Number.parseInt(raw ?? "", 10);
    if (!Number.isFinite(parsed)) return;
    const n = clampInt(parsed, MIN_ROOMMATES_RANDOM_N, MAX_ROOMMATES_RANDOM_N);
    const evenN = n % 2 === 0 ? n : Math.min(MAX_ROOMMATES_RANDOM_N, n + 1);
    const instance = generateRandomRoommatesInstance(evenN);
    setCustomRoommatesInput(JSON.stringify(instance, null, 2));
    setUseCustomRoommates(true);
  };

  const sortedEdges = [...edges].sort((a, b) =>
    a.from === b.from ? a.to - b.to : a.from - b.from,
  );

  const helperText = hoveredEdge
    ? `Edge r${hoveredEdge.from} -> r${hoveredEdge.to}. Click to remove.`
    : selectedNodeId === null
      ? "Click a node to start a dependency. Click a second node to complete the edge."
      : `Linking from r${selectedNodeId}. Click a target node or tap the background to cancel.`;

  const headlineTitle =
    activeTab === "poset" ? "Poset to Preferences" : "Stable Roommates Stepper";
  const headlineDescription =
    activeTab === "poset"
      ? "Draw a rotation poset, generate the corresponding stable-marriage preferences, and verify the reconstructed poset."
      : "Step through Irving's stable roommates algorithm inside the same interface and styling system.";

  return (
    <div className="page">
      <section className="hero">
        <h1>Matching Visualisations</h1>
        <p>{headlineDescription}</p>
      </section>

      <nav className="tabs" aria-label="Matching visualisation tabs">
        <button
          type="button"
          className={`tab-button${activeTab === "poset" ? " active" : ""}`}
          onClick={() => switchTab("poset")}
        >
          Poset to Preferences
        </button>
        <button
          type="button"
          className={`tab-button${activeTab === "roommates" ? " active" : ""}`}
          onClick={() => switchTab("roommates")}
        >
          Stable Roommates Stepper
        </button>
      </nav>

      {activeTab === "poset" ? (
        <div className="grid">
          <section className="panel">
            <h2>Poset Builder</h2>
            <div className="toolbar">
              <button className="button primary" type="button" onClick={addNode}>
                Add rotation
              </button>
              <button className="button" type="button" onClick={removeLastNode}>
                Remove last
              </button>
              <div className="toolbar-group">
                <label className="input-label" htmlFor="random-count">
                  n
                </label>
                <input
                  id="random-count"
                  type="number"
                  min={MIN_RANDOM_N}
                  max={MAX_RANDOM_N}
                  value={randomCount}
                  onChange={(event) =>
                    setRandomCount(
                      clampInt(
                        Number(event.target.value || randomCount),
                        MIN_RANDOM_N,
                        MAX_RANDOM_N,
                      ),
                    )
                  }
                />
                <button
                  className="button secondary"
                  type="button"
                  onClick={generateBalancedTree}
                >
                  Random balanced tree
                </button>
              </div>
              <button className="button secondary" type="button" onClick={autoLayout}>
                Auto layout
              </button>
              <button className="button ghost" type="button" onClick={clearEdges}>
                Clear edges
              </button>
              <button className="button ghost" type="button" onClick={resetGraph}>
                Reset sample
              </button>
            </div>
            <p className="helper-text">{helperText}</p>
            <div className="canvas-shell">
              <PosetCanvas
                nodes={nodes}
                edges={edges}
                selectedNodeId={selectedNodeId}
                hoveredEdgeKey={hoveredEdgeKey}
                onNodeClick={handleNodeClick}
                onNodeMove={handleNodeMove}
                onBackgroundClick={() => setSelectedNodeId(null)}
                onEdgeHover={setHoveredEdgeKey}
                onEdgeClick={handleRemoveEdge}
              />
            </div>

            <div>
              <h3>Edges</h3>
              {sortedEdges.length === 0 ? (
                <p className="helper-text">No edges yet. Start linking rotations.</p>
              ) : (
                <div className="edge-list">
                  {sortedEdges.map((edge) => {
                    const key = `${edge.from}-${edge.to}`;
                    return (
                      <div
                        className={`edge-item${hoveredEdgeKey === key ? " hover" : ""}`}
                        key={key}
                        onMouseEnter={() => setHoveredEdgeKey(key)}
                        onMouseLeave={() => setHoveredEdgeKey(null)}
                      >
                        <span>
                          r{edge.from} -&gt; r{edge.to}
                        </span>
                        <button type="button" onClick={() => handleRemoveEdge(edge)}>
                          remove
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <section className="panel sticky-panel">
            <h2>Preferences Output</h2>
            {computation.error ? (
              <div className="error-box">{computation.error}</div>
            ) : computation.result ? (
              <div className="prefs-grid">
                <div>
                  <table className="prefs-table">
                    <thead>
                      <tr>
                        <th>Man</th>
                        <th>Preferences</th>
                      </tr>
                    </thead>
                    <tbody>
                      {computation.result.menPrefs.map((prefs, index) => (
                        <tr key={`m-${index + 1}`}>
                          <td>m{index + 1}</td>
                          <td>{formatPref(prefs, "w")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div>
                  <table className="prefs-table">
                    <thead>
                      <tr>
                        <th>Woman</th>
                        <th>Preferences</th>
                      </tr>
                    </thead>
                    <tbody>
                      {computation.result.womenPrefs.map((prefs, index) => (
                        <tr key={`w-${index + 1}`}>
                          <td>w{index + 1}</td>
                          <td>{formatPref(prefs, "m")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div>
                  <h3>Verification</h3>
                  {verification?.error ? (
                    <div className="error-box">{verification.error}</div>
                  ) : verification ? (
                    <>
                      {verification.isomorphic ? (
                        <div className="success-box">
                          Rotation poset matches input.
                        </div>
                      ) : (
                        <div className="error-box">
                          Mismatch detected.
                          {verification.reason ? ` ${verification.reason}` : ""}
                        </div>
                      )}
                      <p className="helper-text">
                        Reconstructed {verification.rotationCount} rotations from the
                        generated preferences.
                      </p>
                      <div className="edge-list">
                        {verification.rotationEdges.map((edge) => (
                          <div
                            className="edge-item"
                            key={`rot-${edge.from}-${edge.to}`}
                          >
                            <span>
                              r{edge.from} -&gt; r{edge.to}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="helper-text">
                      Generate preferences to verify the poset.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="helper-text">Add nodes to see preferences.</p>
            )}
          </section>
        </div>
      ) : (
        <div className="grid roommates-grid">
          <section className="panel roommates-main-panel">
            <h2>Stable Roommates Input</h2>
            <div className="toolbar">
              <div className="toolbar-group">
                <span className="input-label">Mode</span>
                <button
                  className={`button${useCustomRoommates ? "" : " primary"}`}
                  type="button"
                  onClick={() => setUseCustomRoommates(false)}
                >
                  Examples
                </button>
                <button
                  className={`button${useCustomRoommates ? " primary" : ""}`}
                  type="button"
                  onClick={() => setUseCustomRoommates(true)}
                >
                  Custom JSON
                </button>
              </div>

              {!useCustomRoommates ? (
                <div className="toolbar-group">
                  <label className="input-label" htmlFor="roommates-example">
                    Example
                  </label>
                  <select
                    id="roommates-example"
                    className="select-input"
                    value={selectedExample}
                    onChange={(event) => {
                      setSelectedExample(event.target.value);
                      setUseCustomRoommates(false);
                    }}
                  >
                    {Object.keys(ROOMMATES_EXAMPLES).map((key) => (
                      <option key={key} value={key}>
                        {key}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <button
                className="button secondary"
                type="button"
                onClick={handleGenerateRandomRoommates}
              >
                Random instance
              </button>
            </div>

            {useCustomRoommates ? (
              <div className="form-stack">
                <label className="input-label" htmlFor="roommates-json">
                  Preference lists
                </label>
                <textarea
                  id="roommates-json"
                  className="text-area"
                  rows={8}
                  value={customRoommatesInput}
                  onChange={(event) => setCustomRoommatesInput(event.target.value)}
                  placeholder='[[1,2,3],[2,3,0],[3,0,1],[0,1,2]]'
                />
              </div>
            ) : null}

            {roommatesValidationError ? (
              <div className="error-box">{roommatesValidationError}</div>
            ) : currentRoommatesStep ? (
              <div className="roommates-shell">
                <div className="status-row">
                  <span className={`status-chip status-${currentRoommatesStep.phase}`}>
                    {formatPhaseLabel(currentRoommatesStep.phase)}
                  </span>
                  <span className="helper-text">
                    Step {currentStepIndex + 1} of {roommatesSteps.length}
                  </span>
                </div>

                <RoommatesPreferenceTable step={currentRoommatesStep} />
                <CompactRoommatesLegend />

                {currentRoommatesStep.rotationP?.length ? (
                  <RoommatesRotationTable step={currentRoommatesStep} />
                ) : null}

                {currentRoommatesStep.phase === "complete" ? (
                  <div className="matching-grid">
                    {getStablePairs(currentRoommatesStep).map(([a, b]) => (
                      <div className="matching-card" key={`${a}-${b}`}>
                        <strong>
                          Person {a + 1} ↔ Person {b + 1}
                        </strong>
                        <span>Stable pair in the final matching.</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="panel sticky-panel">
            <h2>Step Explanation</h2>
            {roommatesValidationError ? (
              <p className="helper-text">
                Fix the custom input to generate a valid stable roommates instance.
              </p>
            ) : currentRoommatesStep ? (
              <div className="roommates-info">
                <div className="info-block">
                  <h3>{formatPhaseLabel(currentRoommatesStep.phase)}</h3>
                  <p className="helper-text">
                    {describePhase(currentRoommatesStep.phase)}
                  </p>
                </div>

                <div className="info-block">
                  <h3>Current Step</h3>
                  <p>{currentRoommatesStep.explanation}</p>
                </div>

                <div className="info-block">
                  <h3>Changes</h3>
                  <div className="edge-list">
                    {currentRoommatesStep.changes.map((change, index) => (
                      <div className="edge-item" key={`${change.type}-${index}`}>
                        <span>{change.details.message}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="stats compact-stats">
                  <div className="stat-pill">
                    <span>Free</span>
                    <strong>{currentRoommatesStep.free.length}</strong>
                  </div>
                  <div className="stat-pill">
                    <span>Semi-Engaged</span>
                    <strong>{currentRoommatesStep.semiengaged.length}</strong>
                  </div>
                  <div className="stat-pill">
                    <span>Pairs Left</span>
                    <strong>
                      {currentRoommatesStep.table.prefs.reduce(
                        (total, prefs) => total + prefs.length,
                        0,
                      ) / 2}
                    </strong>
                  </div>
                </div>
              </div>
            ) : (
              <p className="helper-text">Choose an example to begin.</p>
            )}
          </section>
        </div>
      )}

      {activeTab === "roommates" && currentRoommatesStep && !roommatesValidationError ? (
        <div className="floating-controls" aria-label="Stable roommates controls">
          <button
            className="button ghost"
            type="button"
            onClick={() => {
              setIsPlaying(false);
              setCurrentStepIndex(0);
            }}
          >
            Reset
          </button>
          <button
            className="button"
            type="button"
            onClick={() => {
              setIsPlaying(false);
              setCurrentStepIndex((prev) => Math.max(prev - 1, 0));
            }}
            disabled={currentStepIndex === 0}
          >
            Prev
          </button>
          <button
            className="button primary"
            type="button"
            onClick={() => {
              if (isPlaying) {
                setIsPlaying(false);
              } else if (currentStepIndex < roommatesSteps.length - 1) {
                setIsPlaying(true);
              }
            }}
            disabled={roommatesSteps.length <= 1}
          >
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button
            className="button"
            type="button"
            onClick={() => {
              setIsPlaying(false);
              setCurrentStepIndex((prev) =>
                Math.min(prev + 1, roommatesSteps.length - 1),
              );
            }}
            disabled={currentStepIndex >= roommatesSteps.length - 1}
          >
            Next
          </button>
          <div className="floating-meta">
            <label className="input-label" htmlFor="speed-select">
              Speed
            </label>
            <select
              id="speed-select"
              className="select-input compact-select"
              value={speed}
              onChange={(event) => setSpeed(Number(event.target.value))}
            >
              <option value={0.5}>0.5x</option>
              <option value={1}>1x</option>
              <option value={1.5}>1.5x</option>
              <option value={2}>2x</option>
            </select>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RoommatesPreferenceTable({ step }: { step: AlgorithmStep }) {
  const proposalsMap = new Map<number, Set<number>>();
  step.proposals?.forEach(([person, proposed]) => {
    proposalsMap.set(person, new Set(proposed));
  });

  const tentativeAcceptancesMap = new Map<number, number>();
  step.tentativeAcceptances?.forEach(([person, accepted]) => {
    tentativeAcceptancesMap.set(person, accepted);
  });

  const rejectionsMap = new Map<number, Set<number>>();
  step.rejections?.forEach(([person, rejected]) => {
    rejectionsMap.set(person, new Set(rejected));
  });

  return (
    <div className="roommates-table">
      {Array.from({ length: step.table.n }, (_, person) => {
        const prefs = step.table.prefs[person] ?? [];
        const isActive =
          step.currentProposal?.from === person || step.currentProposal?.to === person;
        const stateClass =
          prefs.length === 0 ? "empty" : prefs.length === 1 ? "matched" : "";

        return (
          <div
            className={`roommates-row${isActive ? " active" : ""}${
              stateClass ? ` ${stateClass}` : ""
            }`}
            key={`person-${person}`}
          >
            <div className="roommates-person">
              <span className="roommates-person-badge">{person + 1}</span>
              <div>
                <strong>Person {person + 1}</strong>
                <div className="helper-text">
                  {prefs.length === 0
                    ? "Empty list"
                    : prefs.length === 1
                      ? "Matched"
                      : `${prefs.length} options left`}
                </div>
              </div>
            </div>

            <div className="prefs-pills">
              {prefs.length === 0 ? (
                <span className="helper-text">No remaining preferences.</span>
              ) : (
                prefs.map((candidate) => {
                  const isProposed = proposalsMap.get(person)?.has(candidate) ?? false;
                  const isAccepted = tentativeAcceptancesMap.get(person) === candidate;
                  const isRejected = rejectionsMap.get(person)?.has(candidate) ?? false;

                  return (
                    <span
                      className={`prefs-pill${
                        isProposed ? " proposed" : ""
                      }${isAccepted ? " accepted" : ""}${
                        isRejected ? " rejected" : ""
                      }`}
                      key={`${person}-${candidate}`}
                    >
                      {candidate + 1}
                    </span>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CompactRoommatesLegend() {
  return (
    <div className="legend-inline">
      <span className="legend-label">Legend</span>
      <div className="legend-inline-item">
        <span className="prefs-pill proposed">2</span>
        <span>proposed</span>
      </div>
      <div className="legend-inline-item">
        <span className="prefs-pill accepted">2</span>
        <span>accepted</span>
      </div>
      <div className="legend-inline-item">
        <span className="prefs-pill rejected">2</span>
        <span>rejected</span>
      </div>
    </div>
  );
}

function RoommatesRotationTable({ step }: { step: AlgorithmStep }) {
  const rowLength = Math.max(step.rotationP?.length ?? 0, step.rotationQ?.length ?? 0);

  return (
    <div className="rotation-box">
      <h3>Rotation Search</h3>
      <table className="prefs-table">
        <tbody>
          <tr>
            <th>pᵢ</th>
            {Array.from({ length: rowLength }, (_, index) => {
              const person = step.rotationP?.[index];
              const inCycle = person !== undefined && step.rotationCycle?.includes(person);
              return (
                <td key={`p-${index}`}>
                  {person === undefined ? (
                    "-"
                  ) : (
                    <span className={`rotation-pill${inCycle ? " cycle" : ""}`}>
                      {person + 1}
                    </span>
                  )}
                </td>
              );
            })}
          </tr>
          <tr>
            <th>qᵢ</th>
            {Array.from({ length: rowLength }, (_, index) => {
              const person = step.rotationQ?.[index];
              return (
                <td key={`q-${index}`}>
                  {person === undefined ? "-" : <span className="rotation-pill">{person + 1}</span>}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function formatPhaseLabel(phase: AlgorithmStep["phase"]) {
  switch (phase) {
    case "phase1":
      return "Phase 1";
    case "phase2":
      return "Phase 2";
    case "complete":
      return "Complete";
    case "unsolvable":
      return "Unsolvable";
  }
}

function describePhase(phase: AlgorithmStep["phase"]) {
  switch (phase) {
    case "phase1":
      return "Free people propose to their first choice and dominated pairs are deleted.";
    case "phase2":
      return "Exposed rotations are traced and eliminated until a matching or contradiction appears.";
    case "complete":
      return "The reduced table is now a stable matching.";
    case "unsolvable":
      return "An empty preference list was produced, so no stable matching exists.";
  }
}
