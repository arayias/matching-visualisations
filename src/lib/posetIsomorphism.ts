import type { Edge } from './posetToPreferences'

type Reachability = boolean[][]

type Signature = {
  key: string
  pred: number
  succ: number
}

const buildReachability = (edges: Edge[], n: number): Reachability => {
  const reach: Reachability = Array.from({ length: n }, () =>
    new Array<boolean>(n).fill(false),
  )

  for (const edge of edges) {
    if (edge.from === edge.to) continue
    if (edge.from < 0 || edge.from >= n || edge.to < 0 || edge.to >= n) continue
    reach[edge.from][edge.to] = true
  }

  for (let k = 0; k < n; k += 1) {
    for (let i = 0; i < n; i += 1) {
      if (!reach[i][k]) continue
      for (let j = 0; j < n; j += 1) {
        if (reach[k][j]) {
          reach[i][j] = true
        }
      }
    }
  }

  return reach
}

const signatureFor = (reach: Reachability, node: number): Signature => {
  const n = reach.length
  let pred = 0
  let succ = 0
  for (let i = 0; i < n; i += 1) {
    if (reach[i][node]) pred += 1
    if (reach[node][i]) succ += 1
  }
  const inc = n - 1 - pred - succ
  return {
    key: `${pred}|${succ}|${inc}`,
    pred,
    succ,
  }
}

export const isPosetIsomorphic = (aEdges: Edge[], bEdges: Edge[], n: number) => {
  if (n === 0) return true

  const reachA = buildReachability(aEdges, n)
  const reachB = buildReachability(bEdges, n)

  const signaturesA = new Array<Signature>(n)
  const signaturesB = new Array<Signature>(n)

  const bucketB: Record<string, number[]> = {}

  for (let i = 0; i < n; i += 1) {
    signaturesA[i] = signatureFor(reachA, i)
    signaturesB[i] = signatureFor(reachB, i)
    const key = signaturesB[i].key
    if (!bucketB[key]) bucketB[key] = []
    bucketB[key].push(i)
  }

  const candidates: number[][] = []
  for (let i = 0; i < n; i += 1) {
    const key = signaturesA[i].key
    const options = bucketB[key] ?? []
    if (options.length === 0) return false
    candidates[i] = [...options]
  }

  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => candidates[a].length - candidates[b].length,
  )

  const used = new Array<boolean>(n).fill(false)
  const mapping = new Array<number>(n).fill(-1)

  const isCompatible = (u: number, v: number) => {
    for (let u2 = 0; u2 < n; u2 += 1) {
      const v2 = mapping[u2]
      if (v2 === -1) continue
      if (reachA[u][u2] !== reachB[v][v2]) return false
      if (reachA[u2][u] !== reachB[v2][v]) return false
    }
    return true
  }

  const backtrack = (index: number): boolean => {
    if (index === n) return true
    const u = order[index]
    for (const v of candidates[u]) {
      if (used[v]) continue
      if (!isCompatible(u, v)) continue
      mapping[u] = v
      used[v] = true
      if (backtrack(index + 1)) return true
      mapping[u] = -1
      used[v] = false
    }
    return false
  }

  return backtrack(0)
}
