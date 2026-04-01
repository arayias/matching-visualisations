export type AlgorithmPhase = "phase1" | "phase2" | "complete" | "unsolvable";

export type ChangeType =
  | "proposal"
  | "deletion"
  | "semiengagement"
  | "break"
  | "rotation_found"
  | "rotation_eliminated"
  | "initialization";

export type PreferenceTableState = {
  n: number;
  prefs: number[][];
  rank: Array<Array<[number, number]>>;
};

export type RotationPair = {
  x: number;
  y: number;
};

export type RotationState = {
  pairs: RotationPair[];
};

export type AlgorithmChange = {
  type: ChangeType;
  details: {
    person?: number;
    from?: number;
    to?: number;
    deletedPairs?: Array<[number, number]>;
    rotation?: RotationState;
    message: string;
  };
};

export type AlgorithmStep = {
  stepNumber: number;
  phase: AlgorithmPhase;
  table: PreferenceTableState;
  free: number[];
  semiengaged: Array<[number, number]>;
  currentProposal?: { from: number; to: number };
  rotation?: RotationState;
  rotationPath?: number[];
  rotationCycle?: number[];
  rotationP?: number[];
  rotationQ?: number[];
  rotationCurrent?: { p: number; q: number; nextP: number | null };
  explanation: string;
  changes: AlgorithmChange[];
  proposals?: Array<[number, number[]]>;
  tentativeAcceptances?: Array<[number, number]>;
  rejections?: Array<[number, number[]]>;
};

export const ROOMMATES_EXAMPLES: Record<string, number[][]> = {
  "Simple 4-Person": [
    [1, 2, 3],
    [2, 3, 0],
    [3, 0, 1],
    [0, 1, 2],
  ],
  "Complex 6-Person": [
    [1, 2, 3, 4, 5],
    [2, 3, 4, 5, 0],
    [3, 4, 5, 0, 1],
    [4, 5, 0, 1, 2],
    [5, 0, 1, 2, 3],
    [0, 1, 2, 3, 4],
  ],
  "Unsolvable 4-Person": [
    [2, 1, 3],
    [0, 2, 3],
    [1, 0, 3],
    [0, 2, 1],
  ],
};

export const generateRandomRoommatesInstance = (n: number): number[][] => {
  const prefs: number[][] = [];
  for (let i = 0; i < n; i += 1) {
    const others = Array.from({ length: n }, (_, j) => j).filter((j) => j !== i);
    for (let j = others.length - 1; j > 0; j -= 1) {
      const k = Math.floor(Math.random() * (j + 1));
      [others[j], others[k]] = [others[k], others[j]];
    }
    prefs.push(others);
  }
  return prefs;
};

class PreferenceTable {
  n: number;
  prefs: number[][];
  rank: Map<number, number>[];

  constructor(initialPrefs: number[][]) {
    this.n = initialPrefs.length;
    this.prefs = initialPrefs.map((prefList) => [...prefList]);
    this.rank = initialPrefs.map((prefList) => {
      const rankMap = new Map<number, number>();
      prefList.forEach((value, index) => rankMap.set(value, index));
      return rankMap;
    });
  }

  first(person: number) {
    return this.prefs[person]?.[0] ?? null;
  }

  second(person: number) {
    return this.prefs[person]?.[1] ?? null;
  }

  last(person: number) {
    const list = this.prefs[person];
    return list && list.length > 0 ? list[list.length - 1] : null;
  }

  isEmpty(person: number) {
    return (this.prefs[person]?.length ?? 0) === 0;
  }

  hasMultipleEntries(person: number) {
    return (this.prefs[person]?.length ?? 0) > 1;
  }

  hasEmptyList() {
    return this.prefs.some((prefList) => prefList.length === 0);
  }

  isMatching() {
    return this.prefs.every((prefList) => prefList.length === 1);
  }

  prefers(person: number, preferred: number, other: number) {
    const preferredRank = this.rank[person]?.get(preferred);
    const otherRank = this.rank[person]?.get(other);
    if (preferredRank === undefined || otherRank === undefined) {
      return false;
    }
    return preferredRank < otherRank;
  }

  deletePair(x: number, y: number) {
    const xIndex = this.prefs[x]?.indexOf(y) ?? -1;
    if (xIndex >= 0) {
      this.prefs[x].splice(xIndex, 1);
    }

    const yIndex = this.prefs[y]?.indexOf(x) ?? -1;
    if (yIndex >= 0) {
      this.prefs[y].splice(yIndex, 1);
    }
  }

  toState(): PreferenceTableState {
    return {
      n: this.n,
      prefs: this.prefs.map((list) => [...list]),
      rank: this.rank.map((map) => Array.from(map.entries())),
    };
  }
}

class Rotation {
  pairs: RotationPair[];

  constructor(pairs: RotationPair[]) {
    this.pairs = pairs;
  }

  get length() {
    return this.pairs.length;
  }

  toString() {
    return this.pairs
      .map(({ x, y }) => `(Person ${x + 1}, Person ${y + 1})`)
      .join(", ");
  }
}

const serializeProposalStates = (
  proposals: Map<number, Set<number>>,
  acceptances: Map<number, number>,
  rejections: Map<number, Set<number>>,
) => ({
  proposals: Array.from(proposals.entries()).map(
    ([person, proposedTo]) =>
      [person, Array.from(proposedTo)] as [number, number[]],
  ),
  tentativeAcceptances: Array.from(acceptances.entries()),
  rejections: Array.from(rejections.entries()).map(
    ([person, rejected]) => [person, Array.from(rejected)] as [number, number[]],
  ),
});

export const validateRoommatesPreferences = (prefs: number[][]): string | null => {
  if (!Array.isArray(prefs) || prefs.length === 0) {
    return "Preferences must be a non-empty array of arrays.";
  }
  if (prefs.length % 2 !== 0) {
    return "Stable roommates instances must have an even number of people.";
  }

  const n = prefs.length;
  for (let person = 0; person < n; person += 1) {
    const prefList = prefs[person];
    if (!Array.isArray(prefList)) {
      return `Preference list ${person + 1} is not an array.`;
    }
    if (prefList.length !== n - 1) {
      return `Person ${person + 1} must rank exactly ${n - 1} others.`;
    }

    const seen = new Set<number>();
    for (const choice of prefList) {
      if (!Number.isInteger(choice)) {
        return `Person ${person + 1} has a non-integer entry.`;
      }
      if (choice < 0 || choice >= n) {
        return `Person ${person + 1} references out-of-range person ${choice + 1}.`;
      }
      if (choice === person) {
        return `Person ${person + 1} cannot rank themselves.`;
      }
      if (seen.has(choice)) {
        return `Person ${person + 1} contains duplicate entry ${choice + 1}.`;
      }
      seen.add(choice);
    }
  }

  return null;
};

export const generateAlgorithmSteps = (initialPrefs: number[][]): AlgorithmStep[] => {
  const validationError = validateRoommatesPreferences(initialPrefs);
  if (validationError) {
    return [
      {
        stepNumber: 0,
        phase: "unsolvable",
        table: {
          n: initialPrefs.length,
          prefs: initialPrefs.map((list) => (Array.isArray(list) ? [...list] : [])),
          rank: initialPrefs.map((list) =>
            Array.isArray(list)
              ? list.map((value, index) => [value, index] as [number, number])
              : [],
          ),
        },
        free: [],
        semiengaged: [],
        explanation: validationError,
        changes: [
          {
            type: "initialization",
            details: { message: validationError },
          },
        ],
        proposals: [],
        tentativeAcceptances: [],
        rejections: [],
      },
    ];
  }

  const steps: AlgorithmStep[] = [];
  let stepNumber = 0;

  const initialTable = new PreferenceTable(initialPrefs);
  const free = new Set<number>(Array.from({ length: initialPrefs.length }, (_, i) => i));
  const semiengaged = new Map<number, number>();

  steps.push({
    stepNumber: stepNumber++,
    phase: "phase1",
    table: initialTable.toState(),
    free: Array.from(free),
    semiengaged: Array.from(semiengaged.entries()),
    explanation: "Initialization: starting Phase 1 with all people free.",
    changes: [
      {
        type: "initialization",
        details: { message: "Algorithm initialized with initial preference lists." },
      },
    ],
    proposals: [],
    tentativeAcceptances: [],
    rejections: [],
  });

  const table = new PreferenceTable(initialPrefs);
  const freeSet = new Set<number>(Array.from({ length: initialPrefs.length }, (_, i) => i));
  const semiengagedMap = new Map<number, number>();
  const proposalsMap = new Map<number, Set<number>>();
  const tentativeAcceptancesMap = new Map<number, number>();
  const rejectionsMap = new Map<number, Set<number>>();

  while (freeSet.size > 0) {
    let proposer: number | null = null;
    for (const person of freeSet) {
      if (!table.isEmpty(person)) {
        proposer = person;
        break;
      }
    }

    if (proposer === null) {
      break;
    }

    const proposee = table.first(proposer);
    if (proposee === null) {
      continue;
    }

    const changes: AlgorithmChange[] = [];
    let explanation = `Person ${proposer + 1} proposes to Person ${proposee + 1}.`;

    freeSet.delete(proposer);
    if (!proposalsMap.has(proposer)) {
      proposalsMap.set(proposer, new Set<number>());
    }
    proposalsMap.get(proposer)?.add(proposee);

    changes.push({
      type: "proposal",
      details: {
        from: proposer,
        to: proposee,
        message: `Person ${proposer + 1} proposes to Person ${proposee + 1}.`,
      },
    });

    if (semiengagedMap.has(proposee)) {
      const previous = semiengagedMap.get(proposee)!;
      freeSet.add(previous);
      semiengagedMap.delete(proposee);
      tentativeAcceptancesMap.delete(proposee);
      changes.push({
        type: "break",
        details: {
          person: proposee,
          from: previous,
          to: proposer,
          message: `Person ${proposee + 1} breaks engagement with Person ${previous + 1}.`,
        },
      });
      explanation += ` Person ${proposee + 1} breaks engagement with Person ${previous + 1}, who becomes free again.`;
    }

    semiengagedMap.set(proposee, proposer);
    tentativeAcceptancesMap.set(proposee, proposer);
    changes.push({
      type: "semiengagement",
      details: {
        person: proposee,
        from: proposer,
        to: proposee,
        message: `Person ${proposee + 1} becomes semi-engaged to Person ${proposer + 1}.`,
      },
    });
    explanation += ` Person ${proposee + 1} becomes semi-engaged to Person ${proposer + 1}.`;

    const toDelete: number[] = [];
    for (const candidate of [...table.prefs[proposee]]) {
      if (candidate !== proposer && table.prefers(proposee, proposer, candidate)) {
        toDelete.push(candidate);
      }
    }

    if (toDelete.length > 0) {
      explanation += ` Person ${proposee + 1} prefers Person ${proposer + 1} over ${toDelete
        .map((value) => `Person ${value + 1}`)
        .join(", ")}, so those pairs are deleted.`;
    }

    for (const rejected of toDelete) {
      if (!rejectionsMap.has(proposee)) {
        rejectionsMap.set(proposee, new Set<number>());
      }
      rejectionsMap.get(proposee)?.add(rejected);
      table.deletePair(proposee, rejected);
      changes.push({
        type: "deletion",
        details: {
          from: proposee,
          to: rejected,
          deletedPairs: [[proposee, rejected]],
          message: `Deleted pair {${proposee + 1}, ${rejected + 1}}.`,
        },
      });
    }

    steps.push({
      stepNumber: stepNumber++,
      phase: "phase1",
      table: table.toState(),
      free: Array.from(freeSet),
      semiengaged: Array.from(semiengagedMap.entries()),
      currentProposal: { from: proposer, to: proposee },
      explanation,
      changes,
      ...serializeProposalStates(
        proposalsMap,
        tentativeAcceptancesMap,
        rejectionsMap,
      ),
    });

    if (table.hasEmptyList()) {
      steps.push({
        stepNumber: stepNumber++,
        phase: "unsolvable",
        table: table.toState(),
        free: Array.from(freeSet),
        semiengaged: Array.from(semiengagedMap.entries()),
        explanation:
          "Phase 1 terminated: an empty preference list was created, so the instance is unsolvable.",
        changes: [
          {
            type: "initialization",
            details: { message: "Instance is unsolvable after Phase 1." },
          },
        ],
        ...serializeProposalStates(
          proposalsMap,
          tentativeAcceptancesMap,
          rejectionsMap,
        ),
      });
      return steps;
    }
  }

  if (table.isMatching()) {
    steps.push({
      stepNumber: stepNumber++,
      phase: "complete",
      table: table.toState(),
      free: [],
      semiengaged: Array.from(semiengagedMap.entries()),
      explanation:
        "Phase 1 completed with a stable matching: every person has exactly one remaining partner.",
      changes: [
        {
          type: "initialization",
          details: { message: "Matching found in Phase 1." },
        },
      ],
      ...serializeProposalStates(
        proposalsMap,
        tentativeAcceptancesMap,
        rejectionsMap,
      ),
    });
    return steps;
  }

  steps.push({
    stepNumber: stepNumber++,
    phase: "phase2",
    table: table.toState(),
    free: [],
    semiengaged: Array.from(semiengagedMap.entries()),
    explanation: "Phase 1 is complete. Proceeding to Phase 2 rotation elimination.",
    changes: [
      {
        type: "initialization",
        details: { message: "Phase 2 begins." },
      },
    ],
    ...serializeProposalStates(proposalsMap, tentativeAcceptancesMap, rejectionsMap),
  });

  let rotationCount = 0;

  while (!table.isMatching() && !table.hasEmptyList()) {
    let start: number | null = null;
    for (let person = 0; person < table.n; person += 1) {
      if (table.hasMultipleEntries(person)) {
        start = person;
        break;
      }
    }

    if (start === null) {
      break;
    }

    const startSecond = table.second(start);
    if (startSecond === null) {
      break;
    }

    steps.push({
      stepNumber: stepNumber++,
      phase: "phase2",
      table: table.toState(),
      free: [],
      semiengaged: Array.from(semiengagedMap.entries()),
      rotationPath: [start],
      rotationP: [start],
      rotationQ: [],
      rotationCurrent: { p: start, q: startSecond, nextP: null },
      explanation: `Starting rotation search at Person ${start + 1}. We set p0 = Person ${start + 1} and q0 = second(p0) = Person ${startSecond + 1}.`,
      changes: [
        {
          type: "rotation_found",
          details: {
            person: start,
            message: `Starting rotation search from Person ${start + 1}.`,
          },
        },
      ],
      ...serializeProposalStates(proposalsMap, tentativeAcceptancesMap, rejectionsMap),
    });

    const pSequence: number[] = [start];
    const qSequence: number[] = [];
    const visited = new Set<number>([start]);
    let currentP = start;
    let currentQ: number | null = table.second(currentP);

    while (currentQ !== null) {
      qSequence.push(currentQ);
      const nextP = table.last(currentQ);
      if (nextP === null) {
        break;
      }

      steps.push({
        stepNumber: stepNumber++,
        phase: "phase2",
        table: table.toState(),
        free: [],
        semiengaged: Array.from(semiengagedMap.entries()),
        rotationPath: [...pSequence, nextP],
        rotationP: [...pSequence],
        rotationQ: [...qSequence],
        rotationCurrent: { p: currentP, q: currentQ, nextP },
        explanation: `For p${pSequence.length - 1} = Person ${currentP + 1}, we have q${qSequence.length - 1} = Person ${currentQ + 1}. Then p${pSequence.length} = last(q${qSequence.length - 1}) = Person ${nextP + 1}.`,
        changes: [
          {
            type: "rotation_found",
            details: {
              person: nextP,
              message: `Advanced the search to Person ${nextP + 1}.`,
            },
          },
        ],
        ...serializeProposalStates(
          proposalsMap,
          tentativeAcceptancesMap,
          rejectionsMap,
        ),
      });

      if (visited.has(nextP)) {
        const cycleStart = pSequence.indexOf(nextP);
        const cycle = pSequence.slice(cycleStart);

        steps.push({
          stepNumber: stepNumber++,
          phase: "phase2",
          table: table.toState(),
          free: [],
          semiengaged: Array.from(semiengagedMap.entries()),
          rotationPath: [...pSequence, nextP],
          rotationP: [...pSequence, nextP],
          rotationQ: [...qSequence],
          rotationCycle: [...cycle],
          rotationCurrent: { p: currentP, q: currentQ, nextP },
          explanation: `Cycle detected: Person ${nextP + 1} appears again, so the exposed rotation is traced by ${cycle
            .map((person) => `Person ${person + 1}`)
            .join(" -> ")}.`,
          changes: [
            {
              type: "rotation_found",
              details: {
                person: nextP,
                message: `Cycle detected at Person ${nextP + 1}.`,
              },
            },
          ],
          ...serializeProposalStates(
            proposalsMap,
            tentativeAcceptancesMap,
            rejectionsMap,
          ),
        });

        const rotationPairs = cycle.map((x) => ({ x, y: table.first(x)! }));
        const rotation = new Rotation(rotationPairs);
        const rotationState: RotationState = { pairs: rotationPairs };
        rotationCount += 1;

        steps.push({
          stepNumber: stepNumber++,
          phase: "phase2",
          table: table.toState(),
          free: [],
          semiengaged: Array.from(semiengagedMap.entries()),
          rotation: rotationState,
          rotationP: [...pSequence, nextP],
          rotationQ: [...qSequence],
          rotationCycle: [...cycle],
          explanation: `Rotation ${rotationCount} found with ${rotation.length} pairs: ${rotation.toString()}.`,
          changes: [
            {
              type: "rotation_found",
              details: {
                rotation: rotationState,
                message: `Found rotation ${rotationCount}.`,
              },
            },
          ],
          ...serializeProposalStates(
            proposalsMap,
            tentativeAcceptancesMap,
            rejectionsMap,
          ),
        });

        const eliminationChanges: AlgorithmChange[] = [];
        let eliminationExplanation = `Eliminating rotation ${rotationCount}. `;

        for (let i = 0; i < rotationPairs.length; i += 1) {
          const pair = rotationPairs[i];
          const predecessor = rotationPairs[(i - 1 + rotationPairs.length) % rotationPairs.length].x;
          const successor = rotationPairs[(i + 1) % rotationPairs.length].y;
          const toDelete: number[] = [];

          for (const candidate of [...table.prefs[pair.y]]) {
            if (candidate !== predecessor && table.prefers(pair.y, predecessor, candidate)) {
              toDelete.push(candidate);
            }
          }

          for (const candidate of toDelete) {
            table.deletePair(pair.y, candidate);
            eliminationChanges.push({
              type: "deletion",
              details: {
                from: pair.y,
                to: candidate,
                deletedPairs: [[pair.y, candidate]],
                message: `Deleted pair {${pair.y + 1}, ${candidate + 1}}.`,
              },
            });
          }

          eliminationExplanation += `Person ${pair.x + 1} moves from Person ${pair.y + 1} to Person ${successor + 1}. `;
        }

        steps.push({
          stepNumber: stepNumber++,
          phase: "phase2",
          table: table.toState(),
          free: [],
          semiengaged: Array.from(semiengagedMap.entries()),
          rotation: rotationState,
          explanation: eliminationExplanation.trim(),
          changes: [
            {
              type: "rotation_eliminated",
              details: {
                rotation: rotationState,
                message: `Rotation ${rotationCount} eliminated.`,
              },
            },
            ...eliminationChanges,
          ],
          ...serializeProposalStates(
            proposalsMap,
            tentativeAcceptancesMap,
            rejectionsMap,
          ),
        });

        break;
      }

      pSequence.push(nextP);
      visited.add(nextP);
      currentP = nextP;
      currentQ = table.second(currentP);
    }

    if (table.hasEmptyList()) {
      steps.push({
        stepNumber: stepNumber++,
        phase: "unsolvable",
        table: table.toState(),
        free: [],
        semiengaged: Array.from(semiengagedMap.entries()),
        explanation:
          "Phase 2 terminated: an empty preference list was created, so the instance is unsolvable.",
        changes: [
          {
            type: "initialization",
            details: { message: "Instance is unsolvable after Phase 2." },
          },
        ],
        ...serializeProposalStates(
          proposalsMap,
          tentativeAcceptancesMap,
          rejectionsMap,
        ),
      });
      return steps;
    }

    if (table.isMatching()) {
      steps.push({
        stepNumber: stepNumber++,
        phase: "complete",
        table: table.toState(),
        free: [],
        semiengaged: Array.from(semiengagedMap.entries()),
        explanation:
          "Phase 2 completed with a stable matching: every person has exactly one remaining partner.",
        changes: [
          {
            type: "initialization",
            details: { message: "Matching found in Phase 2." },
          },
        ],
        ...serializeProposalStates(
          proposalsMap,
          tentativeAcceptancesMap,
          rejectionsMap,
        ),
      });
      return steps;
    }
  }

  return steps;
};

export const getStablePairs = (step: AlgorithmStep): Array<[number, number]> => {
  if (step.phase !== "complete") {
    return [];
  }

  const matching = step.table.prefs.map((prefs) => prefs[0]);
  const used = new Set<number>();
  const pairs: Array<[number, number]> = [];

  for (let i = 0; i < matching.length; i += 1) {
    if (used.has(i)) {
      continue;
    }
    const partner = matching[i];
    if (partner !== undefined && matching[partner] === i) {
      pairs.push([i, partner]);
      used.add(i);
      used.add(partner);
    }
  }

  return pairs;
};
