export type Rotation = {
  id: number
  pairs: [number, number][]
}

type Label = {
  index: number
  rotId: number
  type: 1 | 2
}

type GsLists = {
  M0: number[]
  Mz: number[]
  menLists: number[][]
  womenLists: number[][]
}

export type RotationPosetResult = {
  rotations: Rotation[]
  edges: Record<number, number[]>
}

export class RotationPoset {
  private menPrefs: number[][]
  private womenPrefs: number[][]
  private n: number
  private menRank: number[][]
  private womenRank: number[][]

  rotations: Rotation[] = []
  rotationEdges: Record<number, number[]> = {}

  constructor(
    menPrefs: number[][],
    womenPrefs: number[][],
    oneIndexed = true,
  ) {
    if (oneIndexed) {
      this.menPrefs = menPrefs.map((row) => row.map((w) => w - 1))
      this.womenPrefs = womenPrefs.map((row) => row.map((m) => m - 1))
    } else {
      this.menPrefs = menPrefs.map((row) => [...row])
      this.womenPrefs = womenPrefs.map((row) => [...row])
    }

    this.n = this.menPrefs.length
    if (this.n !== this.womenPrefs.length) {
      throw new Error('Preference lists must be the same size.')
    }

    this.menRank = this.menPrefs.map((pref) => {
      const rank = new Array<number>(this.n).fill(-1)
      pref.forEach((w, i) => {
        rank[w] = i
      })
      return rank
    })

    this.womenRank = this.womenPrefs.map((pref) => {
      const rank = new Array<number>(this.n).fill(-1)
      pref.forEach((m, i) => {
        rank[m] = i
      })
      return rank
    })
  }

  private galeShapley(
    proposersPrefs: number[][],
    receiversPrefs: number[][],
  ): number[] {
    const n = proposersPrefs.length
    const receiverRank = receiversPrefs.map((pref) => {
      const rank = new Array<number>(n).fill(-1)
      pref.forEach((p, i) => {
        rank[p] = i
      })
      return rank
    })

    const free: number[] = Array.from({ length: n }, (_, i) => i)
    const nextIndex = new Array<number>(n).fill(0)
    const partnerOfReceiver = new Array<number>(n).fill(-1)

    while (free.length > 0) {
      const p = free.shift()
      if (p === undefined) break
      const prefs = proposersPrefs[p]
      const r = prefs[nextIndex[p]]
      nextIndex[p] += 1

      if (partnerOfReceiver[r] === -1) {
        partnerOfReceiver[r] = p
      } else {
        const current = partnerOfReceiver[r]
        if (receiverRank[r][p] < receiverRank[r][current]) {
          partnerOfReceiver[r] = p
          free.push(current)
        } else {
          free.push(p)
        }
      }
    }

    const partnerOfProposer = new Array<number>(n).fill(-1)
    partnerOfReceiver.forEach((p, r) => {
      partnerOfProposer[p] = r
    })
    return partnerOfProposer
  }

  private buildGsLists(): GsLists {
    const n = this.n

    const M0 = this.galeShapley(this.menPrefs, this.womenPrefs)

    const womenOptimal = this.galeShapley(this.womenPrefs, this.menPrefs)
    const Mz = new Array<number>(n).fill(-1)
    womenOptimal.forEach((m, w) => {
      Mz[m] = w
    })

    const menLists: number[][] = Array.from({ length: n }, () => [])
    for (let m = 0; m < n; m += 1) {
      const pref = this.menPrefs[m]
      const i0 = this.menRank[m][M0[m]]
      const iz = this.menRank[m][Mz[m]]
      const valid = i0 <= iz ? pref.slice(i0, iz + 1) : pref.slice(iz, i0 + 1)
      menLists[m] = [...valid]
      if (menLists[m][0] !== M0[m]) {
        throw new Error('Failed to build men GS-lists.')
      }
    }

    const invM0 = new Array<number>(n).fill(-1)
    const invMz = new Array<number>(n).fill(-1)
    for (let m = 0; m < n; m += 1) {
      invM0[M0[m]] = m
      invMz[Mz[m]] = m
    }

    const womenLists: number[][] = Array.from({ length: n }, () => [])
    for (let w = 0; w < n; w += 1) {
      const pref = this.womenPrefs[w]
      const iz = this.womenRank[w][invMz[w]]
      const i0 = this.womenRank[w][invM0[w]]
      const valid = iz <= i0 ? pref.slice(iz, i0 + 1) : pref.slice(i0, iz + 1)
      womenLists[w] = [...valid]
    }

    let changed = true
    while (changed) {
      changed = false
      for (let m = 0; m < n; m += 1) {
        for (let i = menLists[m].length - 1; i >= 0; i -= 1) {
          const w = menLists[m][i]
          if (!womenLists[w].includes(m)) {
            menLists[m].splice(i, 1)
            changed = true
          }
        }
      }
      for (let w = 0; w < n; w += 1) {
        for (let i = womenLists[w].length - 1; i >= 0; i -= 1) {
          const m = womenLists[w][i]
          if (!menLists[m].includes(w)) {
            womenLists[w].splice(i, 1)
            changed = true
          }
        }
      }
    }

    return { M0, Mz, menLists, womenLists }
  }

  computeRotationPoset(): RotationPosetResult {
    const { menLists, womenLists } = this.buildGsLists()
    const n = this.n

    const currentPartnerOfM = menLists.map((list) => list[0])
    const currentPartnerOfW = new Array<number>(n).fill(-1)
    currentPartnerOfM.forEach((w, m) => {
      currentPartnerOfW[w] = m
    })

    const labels: Label[][] = Array.from({ length: n }, () => [])
    const rotations: Rotation[] = []

    let stack: number[] = []
    let x = 0

    const manHasMoreThanOne = (m: number) => menLists[m].length > 1

    while (x < n) {
      if (stack.length === 0) {
        while (x < n && !manHasMoreThanOne(x)) {
          x += 1
        }
        if (x >= n) break
        stack.push(x)
      }

      const m = stack[stack.length - 1]
      if (!manHasMoreThanOne(m)) {
        stack.pop()
        continue
      }

      const wSecond = menLists[m][1]
      const mNext = currentPartnerOfW[wSecond]

      const cycleStart = stack.indexOf(mNext)
      if (cycleStart !== -1) {
        const cycleMen = stack.slice(cycleStart)
        stack = stack.slice(0, cycleStart)

        const rotId = rotations.length
        const rotPairs: [number, number][] = cycleMen.map((mm) => [mm, menLists[mm][0]])
        rotations.push({ id: rotId, pairs: rotPairs })

        const wOld: Record<number, number> = {}
        const wNew: Record<number, number> = {}
        cycleMen.forEach((mm) => {
          wOld[mm] = menLists[mm][0]
          wNew[mm] = menLists[mm][1]
        })

        for (const mm of cycleMen) {
          const newW = wNew[mm]
          const idxNewInList = menLists[mm].indexOf(newW)
          labels[mm].push({ index: idxNewInList, rotId, type: 1 })

          const mOld = currentPartnerOfW[newW]
          if (mOld === mm) continue

          const rankNew = this.womenRank[newW][mm]
          const rankOld = this.womenRank[newW][mOld]

          if (rankNew < rankOld) {
            for (let rank = rankNew + 1; rank < rankOld; rank += 1) {
              const rejectedM = this.womenPrefs[newW][rank]

              const idxInWomen = womenLists[newW].indexOf(rejectedM)
              if (idxInWomen !== -1) {
                womenLists[newW].splice(idxInWomen, 1)
              }

              const idxWInRejected = menLists[rejectedM].indexOf(newW)
              if (idxWInRejected !== -1) {
                labels[rejectedM].push({ index: idxWInRejected, rotId, type: 2 })
                menLists[rejectedM].splice(idxWInRejected, 1)
              }
            }
          }
        }

        for (const mm of cycleMen) {
          const oldW = wOld[mm]
          if (menLists[mm][0] !== oldW) {
            throw new Error('Rotation elimination failed (men list mismatch).')
          }
          menLists[mm].shift()
          const idxInWomenOld = womenLists[oldW].indexOf(mm)
          if (idxInWomenOld !== -1) {
            womenLists[oldW].splice(idxInWomenOld, 1)
          }
          currentPartnerOfM[mm] = wNew[mm]
        }

        const k = cycleMen.length
        for (let idx = 0; idx < k; idx += 1) {
          const mm = cycleMen[idx]
          const oldW = wOld[mm]
          const prevM = cycleMen[(idx - 1 + k) % k]
          currentPartnerOfW[oldW] = prevM
        }
      } else {
        stack.push(mNext)
      }
    }

    const edges: Record<number, number[]> = {}
    rotations.forEach((rot) => {
      edges[rot.id] = []
    })

    for (let m = 0; m < n; m += 1) {
      const labs = labels[m]
      if (labs.length === 0) continue
      labs.sort((a, b) => {
        if (a.index !== b.index) return a.index - b.index
        if (a.type !== b.type) return a.type - b.type
        return a.rotId - b.rotId
      })

      let lastType1: number | null = null
      for (const label of labs) {
        if (label.type === 1) {
          if (lastType1 !== null && lastType1 !== label.rotId) {
            if (!edges[lastType1].includes(label.rotId)) {
              edges[lastType1].push(label.rotId)
            }
          }
          lastType1 = label.rotId
        } else {
          if (lastType1 !== null && lastType1 !== label.rotId) {
            if (!edges[label.rotId].includes(lastType1)) {
              edges[label.rotId].push(lastType1)
            }
          }
        }
      }
    }

    this.rotations = rotations
    this.rotationEdges = edges
    return { rotations, edges }
  }
}
