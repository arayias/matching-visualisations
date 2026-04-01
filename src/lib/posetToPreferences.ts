export type Edge = { from: number; to: number }
export type EdgeTuple = [number, number]

export type InstanceInfo = {
  k: number
  ePrime: number
  relabeledPoset: EdgeTuple[]
  pPrimeEdges: EdgeTuple[]
  hasseEdges: EdgeTuple[]
  edgeToId: Record<string, number>
}

export type InstanceResult = {
  menPrefs: number[][]
  womenPrefs: number[][]
  info: InstanceInfo
}

const edgeKey = (edge: EdgeTuple) => `${edge[0]}->${edge[1]}`

const uniqueEdges = (edges: EdgeTuple[]) => {
  const seen = new Set<string>()
  const result: EdgeTuple[] = []
  for (const edge of edges) {
    const key = edgeKey(edge)
    if (!seen.has(key)) {
      seen.add(key)
      result.push(edge)
    }
  }
  return result
}

const validateEdges = (edges: EdgeTuple[], k: number) => {
  for (const [u, v] of edges) {
    if (!Number.isInteger(u) || !Number.isInteger(v)) {
      throw new Error('All edges must use integer node ids.')
    }
    if (u < 0 || v < 0 || u >= k || v >= k) {
      throw new Error(`Edge (${u} → ${v}) is out of bounds for k=${k}.`)
    }
    if (u === v) {
      throw new Error('Self-loops are not allowed in a poset.')
    }
  }
}

const topologicalRelabel = (edges: EdgeTuple[], k: number): EdgeTuple[] => {
  const adj: number[][] = Array.from({ length: k }, () => [])
  const inDegree = new Array<number>(k).fill(0)

  for (const [u, v] of edges) {
    adj[u].push(v)
    inDegree[v] += 1
  }

  for (const list of adj) {
    list.sort((a, b) => a - b)
  }

  const queue: number[] = []
  for (let i = 0; i < k; i += 1) {
    if (inDegree[i] === 0) {
      queue.push(i)
    }
  }

  const topoOrder: number[] = []
  let index = 0
  while (index < queue.length) {
    const node = queue[index]
    index += 1
    topoOrder.push(node)
    for (const neighbor of adj[node]) {
      inDegree[neighbor] -= 1
      if (inDegree[neighbor] === 0) {
        queue.push(neighbor)
      }
    }
  }

  if (topoOrder.length !== k) {
    throw new Error('Poset contains a cycle or k is incorrect.')
  }

  const oldToNew = new Map<number, number>()
  topoOrder.forEach((oldLabel, idx) => {
    oldToNew.set(oldLabel, idx + 1)
  })

  return edges.map(([u, v]) => {
    const mappedU = oldToNew.get(u)
    const mappedV = oldToNew.get(v)
    if (mappedU === undefined || mappedV === undefined) {
      throw new Error('Failed to relabel poset edges.')
    }
    return [mappedU, mappedV]
  })
}

const extendPoset = (relabeledEdges: EdgeTuple[], k: number): EdgeTuple[] => {
  const pPrimeEdges: EdgeTuple[] = [...relabeledEdges]

  for (let i = 1; i <= k; i += 1) {
    pPrimeEdges.push([0, i])
  }

  for (let i = 1; i <= k; i += 1) {
    pPrimeEdges.push([i, k + 1])
  }

  pPrimeEdges.push([0, k + 1])

  return uniqueEdges(pPrimeEdges)
}

const computeHasseDiagram = (edges: EdgeTuple[], numNodes: number): EdgeTuple[] => {
  const direct = Array.from({ length: numNodes }, () =>
    new Array<boolean>(numNodes).fill(false),
  )

  for (const [u, v] of edges) {
    direct[u][v] = true
  }

  const reach = direct.map((row) => row.slice())

  for (let k = 0; k < numNodes; k += 1) {
    for (let i = 0; i < numNodes; i += 1) {
      if (!reach[i][k]) continue
      for (let j = 0; j < numNodes; j += 1) {
        if (reach[k][j]) {
          reach[i][j] = true
        }
      }
    }
  }

  const hasseEdges: EdgeTuple[] = []
  for (let i = 0; i < numNodes; i += 1) {
    for (let j = 0; j < numNodes; j += 1) {
      if (i === j || !direct[i][j]) continue
      let hasIntermediate = false
      for (let k = 0; k < numNodes; k += 1) {
        if (k !== i && k !== j && reach[i][k] && reach[k][j]) {
          hasIntermediate = true
          break
        }
      }
      if (!hasIntermediate) {
        hasseEdges.push([i, j])
      }
    }
  }

  return hasseEdges
}

export const constructInstance = (
  posetEdges: EdgeTuple[],
  numPosetElements: number,
): InstanceResult => {
  const k = numPosetElements
  if (k === 0) {
    return {
      menPrefs: [[1]],
      womenPrefs: [[1]],
      info: {
        k: 0,
        ePrime: 1,
        relabeledPoset: [],
        pPrimeEdges: [[0, 1]],
        hasseEdges: [[0, 1]],
        edgeToId: { '0->1': 1 },
      },
    }
  }

  validateEdges(posetEdges, k)

  const relabeledEdges = topologicalRelabel(posetEdges, k)
  const pPrimeEdges = extendPoset(relabeledEdges, k)
  const hasseEdges = computeHasseDiagram(pPrimeEdges, k + 2)

  const edgeToId: Record<string, number> = {}
  hasseEdges.forEach((edge, idx) => {
    edgeToId[edgeKey(edge)] = idx + 1
  })

  const ePrime = hasseEdges.length
  if (ePrime === 0) {
    return {
      menPrefs: [[1]],
      womenPrefs: [[1]],
      info: {
        k,
        ePrime: 0,
        relabeledPoset: relabeledEdges,
        pPrimeEdges,
        hasseEdges,
        edgeToId,
      },
    }
  }

  const menLists: Record<number, number[]> = {}
  const womenLists: Record<number, number[]> = {}

  for (let j = 1; j <= ePrime; j += 1) {
    menLists[j] = [j]
    womenLists[j] = [j]
  }

  for (let i = 1; i <= k; i += 1) {
    const incidentEdges = hasseEdges.filter(([u, v]) => u === i || v === i)
    if (incidentEdges.length === 0) continue

    const edgeIds = incidentEdges.map((edge) => edgeToId[edgeKey(edge)])
    const r = edgeIds.length
    const currentLast = edgeIds.map((id) => menLists[id][menLists[id].length - 1])

    for (let j = 0; j < r; j += 1) {
      const m = edgeIds[j]
      const wNext = currentLast[(j + 1) % r]
      menLists[m].push(wNext)
      womenLists[wNext].unshift(m)
    }
  }

  const menPrefs: number[][] = []
  const womenPrefs: number[][] = []
  for (let j = 1; j <= ePrime; j += 1) {
    menPrefs.push(menLists[j])
    womenPrefs.push(womenLists[j])
  }

  return {
    menPrefs,
    womenPrefs,
    info: {
      k,
      ePrime,
      relabeledPoset: relabeledEdges,
      pPrimeEdges,
      hasseEdges,
      edgeToId,
    },
  }
}
