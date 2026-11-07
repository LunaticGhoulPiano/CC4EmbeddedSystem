/*
 * Copyright 2011 Google Inc. All Rights Reserved.
 * Copyright 2026 CC4EmbeddedSystem contributors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * Full license text: ../../licenses/zopfli.txt
 *
 * TypeScript reimplementation of Zopfli's iterative minimum-cost LZ77 parsing,
 * entropy feedback, length-limited Huffman coding and block cost selection.
 * Adapted from google/zopfli: squeeze.c, tree.c, deflate.c, blocksplitter.c.
 * Uses a bounded per-block match cache and package-merge lists instead of the
 * C implementation's hash/cache layout and boundary package-merge allocator.
 * Encoded bytes are not intended to match the C implementation byte for byte.
 */

const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DISTANCE_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DISTANCE_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
const LENGTH_SYMBOL = new Uint16Array(259);
const DISTANCE_SYMBOL = new Uint8Array(32769);
for (let i = 0; i < LENGTH_BASE.length; i++) LENGTH_SYMBOL.fill(257 + i, LENGTH_BASE[i]!, LENGTH_BASE[i + 1] ?? 259);
for (let i = 0; i < DISTANCE_BASE.length; i++) DISTANCE_SYMBOL.fill(i, DISTANCE_BASE[i]!, DISTANCE_BASE[i + 1] ?? 32769);

interface Token { value: number; distance: number; position: number; }
interface Match { length: number; distance: number; }
interface Histogram { ll: number[]; dd: number[]; }
interface Package { weight: number; symbol: number; children?: readonly [Package, Package]; }
interface TreeHeader { llCount: number; ddCount: number; clCount: number; lengths: number[]; runs: [number, number][]; bits: number; }
interface BlockTree { ll: number[]; dd: number[]; header: TreeHeader; bits: number; }

class BitWriter {
    private readonly bytes: number[] = [];
    private partial = 0;
    private used = 0;

    public write(value: number, count: number): void {
        for (let i = 0; i < count; i++) {
            this.partial |= ((value >>> i) & 1) << this.used;
            if (++this.used === 8) {
                this.bytes.push(this.partial);
                this.partial = this.used = 0;
            }
        }
    }

    public code(value: number, count: number): void {
        for (let i = count - 1; i >= 0; i--) this.write((value >>> i) & 1, 1);
    }

    public align(): void {
        if (this.used > 0) this.write(0, 8 - this.used);
    }

    public finish(): Buffer {
        this.align();
        return Buffer.from(this.bytes);
    }
}

// Package-merge gives optimal code lengths within DEFLATE's 15/7-bit limits.
function codeLengths(frequencies: readonly number[], maxBits: number): number[] {
    const lengths = frequencies.map(() => 0);
    const leaves: Package[] = [];
    frequencies.forEach((weight, symbol) => { if (weight > 0) leaves.push({ weight, symbol }); });
    leaves.sort((a, b) => a.weight - b.weight || a.symbol - b.symbol);
    if (leaves.length === 0) return lengths;
    if (leaves.length === 1) { lengths[leaves[0]!.symbol] = 1; return lengths; }
    let list = leaves;
    for (let depth = 1; depth < maxBits; depth++) {
        const packages: Package[] = [];
        for (let i = 0; i + 1 < list.length; i += 2) {
            const left = list[i]!;
            const right = list[i + 1]!;
            packages.push({ weight: left.weight + right.weight, symbol: -1, children: [left, right] });
        }
        const merged: Package[] = [];
        let l = 0, p = 0;
        while (l < leaves.length || p < packages.length) {
            if (p === packages.length || (l < leaves.length && leaves[l]!.weight <= packages[p]!.weight)) merged.push(leaves[l++]!);
            else merged.push(packages[p++]!);
        }
        list = merged;
    }
    const count = (node: Package): void => {
        if (node.children) { count(node.children[0]); count(node.children[1]); }
        else lengths[node.symbol] = lengths[node.symbol]! + 1;
    };
    for (let i = 0; i < 2 * leaves.length - 2; i++) count(list[i]!);
    return lengths;
}

function codes(lengths: readonly number[]): number[] {
    const counts = new Array<number>(16).fill(0);
    for (const length of lengths) if (length) counts[length] = counts[length]! + 1;
    const next = new Array<number>(16).fill(0);
    for (let bits = 1; bits < 16; bits++) next[bits] = (next[bits - 1]! + counts[bits - 1]!) << 1;
    return lengths.map(length => {
        if (! length) return 0;
        const result = next[length]!;
        next[length] = result + 1;
        return result;
    });
}

function histogram(tokens: readonly Token[], start = 0, end = tokens.length): Histogram {
    const ll = new Array<number>(288).fill(0);
    const dd = new Array<number>(32).fill(0);
    ll[256] = 1;
    for (let i = start; i < end; i++) {
        const token = tokens[i]!;
        const symbol = token.distance ? LENGTH_SYMBOL[token.value]! : token.value;
        ll[symbol] = ll[symbol]! + 1;
        if (token.distance) { const d = DISTANCE_SYMBOL[token.distance]!; dd[d] = dd[d]! + 1; }
    }
    return { ll, dd };
}

function symbolBits(stats: Histogram, ll: readonly number[], dd: readonly number[]): number {
    let bits = 0;
    for (let i = 0; i < 286; i++) bits += stats.ll[i]! * (ll[i]! + (i >= 257 ? LENGTH_EXTRA[i - 257]! : 0));
    for (let i = 0; i < 30; i++) bits += stats.dd[i]! * (dd[i]! + DISTANCE_EXTRA[i]!);
    return bits;
}

function treeHeader(ll: readonly number[], dd: readonly number[]): TreeHeader {
    let llCount = 286, ddCount = 30;
    while (llCount > 257 && !ll[llCount - 1]) llCount--;
    while (ddCount > 1 && !dd[ddCount - 1]) ddCount--;
    const sequence = [...ll.slice(0, llCount), ...dd.slice(0, ddCount)];
    let best: TreeHeader | undefined;
    for (let flags = 0; flags < 8; flags++) {
        const runs: [number, number][] = [];
        for (let i = 0; i < sequence.length;) {
            const symbol = sequence[i]!;
            let count = 1;
            if ((flags & 1) || (symbol === 0 && (flags & 6))) {
                while (i + count < sequence.length && sequence[i + count] === symbol) count++;
            }
            i += count;
            if (symbol === 0) {
                if (flags & 4) while (count >= 11) { const n = Math.min(count, 138); runs.push([18, n - 11]); count -= n; }
                if (flags & 2) while (count >= 3) { const n = Math.min(count, 10); runs.push([17, n - 3]); count -= n; }
            }
            if ((flags & 1) && count >= 4) {
                runs.push([symbol, 0]); count--;
                while (count >= 3) { const n = Math.min(count, 6); runs.push([16, n - 3]); count -= n; }
            }
            while (count-- > 0) runs.push([symbol, 0]);
        }
        const counts = new Array<number>(19).fill(0);
        for (const [symbol] of runs) counts[symbol] = counts[symbol]! + 1;
        const lengths = codeLengths(counts, 7);
        let clCount = 19;
        while (clCount > 4 && !lengths[CL_ORDER[clCount - 1]!]) clCount--;
        let bits = 14 + clCount * 3;
        for (const [symbol] of runs) bits += lengths[symbol]! + (symbol === 16 ? 2 : symbol === 17 ? 3 : symbol === 18 ? 7 : 0);
        if (!best || bits < best.bits) best = { llCount, ddCount, clCount, lengths, runs, bits };
    }
    return best!;
}

function optimizeCountsForRle(source: readonly number[]): number[] {
    const counts = [...source];
    let size = counts.length;
    while (size > 0 && !counts[size - 1]) size--;
    if (!size) return counts;
    const good = new Uint8Array(size);
    let symbol = counts[0]!, stride = 0;
    for (let i = 0; i <= size; i++) {
        if (i === size || counts[i] !== symbol) {
            if ((symbol === 0 && stride >= 5) || (symbol !== 0 && stride >= 7)) good.fill(1, i - stride, i);
            stride = 1;
            if (i < size) symbol = counts[i]!;
        } else stride++;
    }
    stride = 0;
    let limit = counts[0]!, sum = 0;
    for (let i = 0; i <= size; i++) {
        if (i === size || good[i] || Math.abs(counts[i]! - limit) >= 4) {
            if (stride >= 4 || (stride >= 3 && sum === 0)) {
                const replacement = sum === 0 ? 0 : Math.max(1, Math.floor((sum + stride / 2) / stride));
                counts.fill(replacement, i - stride, i);
            }
            stride = sum = 0;
            limit = i < size - 3 ? Math.floor((counts[i]! + counts[i + 1]! + counts[i + 2]! + counts[i + 3]! + 2) / 4) : (counts[i] ?? 0);
        }
        stride++;
        if (i < size) sum += counts[i]!;
    }
    return counts;
}

function dynamicTree(stats: Histogram): BlockTree {
    let best: BlockTree | undefined;
    for (const optimize of [false, true]) {
        const ll = codeLengths(optimize ? optimizeCountsForRle(stats.ll) : stats.ll, 15);
        const dd = codeLengths(optimize ? optimizeCountsForRle(stats.dd) : stats.dd, 15);
        // Match upstream's compatibility patch for decoders needing two distances.
        const used = dd.filter(length => length > 0).length;
        if (used === 0) dd[0] = dd[1] = 1;
        else if (used === 1) dd[dd[0] ? 1 : 0] = 1;
        const header = treeHeader(ll, dd);
        const bits = 3 + header.bits + symbolBits(stats, ll, dd);
        if (!best || bits < best.bits) best = { ll, dd, header, bits };
    }
    return best!;
}

const FIXED_LL = Array.from({ length: 288 }, (_, i) => i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8);
const FIXED_DD = new Array<number>(32).fill(5);

function matchCache(input: Buffer, start: number, end: number): Match[][] {
    const windowStart = Math.max(0, start - 32768);
    const heads = new Int32Array(32768).fill(-1);
    const previous = new Int32Array(end - windowStart).fill(-1);
    const matches: Match[][] = [];
    for (let pos = windowStart; pos < end; pos++) {
        if (pos + 2 >= end) { if (pos >= start) matches.push([]); continue; }
        const hash = ((input[pos]! << 10) ^ (input[pos + 1]! << 5) ^ input[pos + 2]!) & 32767;
        let candidate = heads[hash]!;
        previous[pos - windowStart] = candidate;
        heads[hash] = pos;
        if (pos < start) continue;
        const runs: Match[] = [];
        const limit = Math.min(258, end - pos);
        let longest = 2, hits = 8192;
        while (candidate >= windowStart && pos - candidate <= 32768 && hits-- > 0) {
            if (input[candidate + longest] === input[pos + longest]) {
                let length = 0;
                while (length < limit && input[candidate + length] === input[pos + length]) length++;
                if (length > longest) {
                    runs.push({ length, distance: pos - candidate });
                    longest = length;
                    if (length === limit) break;
                }
            }
            candidate = previous[candidate - windowStart]!;
        }
        matches.push(runs);
    }
    return matches;
}

function greedy(input: Buffer, start: number, end: number, cache: readonly Match[][], cacheStart: number): Token[] {
    const result: Token[] = [];
    for (let pos = start; pos < end;) {
        const runs = cache[pos - cacheStart]!;
        const match = runs[runs.length - 1];
        const length = Math.min(match?.length ?? 0, end - pos);
        const distance = match?.distance ?? 0;
        const score = length - (distance > 1024 ? 1 : 0);
        const nextRuns = cache[pos + 1 - cacheStart];
        const next = nextRuns?.[nextRuns.length - 1];
        const nextScore = Math.min(next?.length ?? 0, end - pos - 1) - ((next?.distance ?? 0) > 1024 ? 1 : 0);
        if (score >= 3 && nextScore <= score + 1) {
            result.push({ value: length, distance, position: pos }); pos += length;
        } else { result.push({ value: input[pos]!, distance: 0, position: pos }); pos++; }
    }
    return result;
}

function entropy(counts: readonly number[]): number[] {
    const total = counts.reduce((sum, count) => sum + count, 0);
    const logTotal = Math.log2(total || counts.length);
    return counts.map(count => Math.max(0, logTotal - (count ? Math.log2(count) : 0)));
}

function optimalParse(input: Buffer, start: number, end: number, cache: readonly Match[][], cacheStart: number, ll: readonly number[], dd: readonly number[]): Token[] {
    const size = end - start;
    const costs = new Float64Array(size + 1).fill(Infinity);
    const lengths = new Uint16Array(size + 1);
    const distances = new Uint16Array(size + 1);
    costs[0] = 0;
    const lengthCosts = Array.from({ length: 259 }, (_, length) => length < 3 ? 0 : ll[LENGTH_SYMBOL[length]!]! + LENGTH_EXTRA[LENGTH_SYMBOL[length]! - 257]!);
    for (let i = 0; i < size; i++) {
        const cost = costs[i]!;
        const literalCost = cost + ll[input[start + i]!]!;
        if (literalCost < costs[i + 1]!) { costs[i + 1] = literalCost; lengths[i + 1] = 1; }
        let previousLength = 2;
        for (const match of cache[start + i - cacheStart]!) {
            const maxLength = Math.min(match.length, size - i);
            const ds = DISTANCE_SYMBOL[match.distance]!;
            const baseCost = cost + dd[ds]! + DISTANCE_EXTRA[ds]!;
            for (let length = previousLength + 1; length <= maxLength; length++) {
                const candidate = baseCost + lengthCosts[length]!;
                if (candidate < costs[i + length]!) {
                    costs[i + length] = candidate;
                    lengths[i + length] = length;
                    distances[i + length] = match.distance;
                }
            }
            previousLength = maxLength;
            if (maxLength === size - i) break;
        }
    }
    const tokens: Token[] = [];
    for (let endIndex = size; endIndex > 0;) {
        const length = lengths[endIndex]!;
        if (!length) throw new Error('Zopfli could not trace the LZ77 path.');
        const position = start + endIndex - length;
        tokens.push({ value: length === 1 ? input[position]! : length, distance: length === 1 ? 0 : distances[endIndex]!, position });
        endIndex -= length;
    }
    return tokens.reverse();
}

function optimizeBlock(input: Buffer, start: number, end: number, cache: readonly Match[][], cacheStart: number, iterations: number): { tokens: Token[]; tree: BlockTree; fixed: boolean } {
    let best = greedy(input, start, end, cache, cacheStart);
    let stats = histogram(best);
    let bestStats = stats;
    let tree = dynamicTree(stats);
    let lastCost = -1, randomized = false;
    let mw = 1, mz = 2;
    const random = (): number => {
        mz = (36969 * (mz & 65535) + (mz >>> 16)) >>> 0;
        mw = (18000 * (mw & 65535) + (mw >>> 16)) >>> 0;
        return ((mz << 16) + mw) >>> 0;
    };
    for (let i = 0; i < iterations; i++) {
        const tokens = optimalParse(input, start, end, cache, cacheStart, entropy(stats.ll), entropy(stats.dd));
        const nextStats = histogram(tokens);
        const candidate = dynamicTree(nextStats);
        if (candidate.bits < tree.bits) { best = tokens; tree = candidate; bestStats = stats; }
        const previous = stats;
        stats = nextStats;
        if (randomized) {
            stats = { ll: stats.ll.map((n, j) => Math.floor(n + previous.ll[j]! * 0.5)), dd: stats.dd.map((n, j) => Math.floor(n + previous.dd[j]! * 0.5)) };
            stats.ll[256] = 1;
        }
        if (i > 5 && candidate.bits === lastCost) {
            stats = { ll: [...bestStats.ll], dd: [...bestStats.dd] };
            for (const counts of [stats.ll, stats.dd]) {
                for (let j = 0; j < counts.length; j++) if ((random() >>> 4) % 3 === 0) counts[j] = counts[random() % counts.length]!;
            }
            stats.ll[256] = 1;
            randomized = true;
        }
        lastCost = candidate.bits;
    }
    const fixedTokens = optimalParse(input, start, end, cache, cacheStart, FIXED_LL, FIXED_DD);
    if (3 + symbolBits(histogram(fixedTokens), FIXED_LL, FIXED_DD) < tree.bits) return { tokens: fixedTokens, tree, fixed: true };
    return { tokens: best, tree, fixed: false };
}

function splitBlocks(tokens: readonly Token[], end: number): number[] {
    const memo = new Map<string, number>();
    const cost = (start: number, stop: number): number => {
        const key = `${start}:${stop}`;
        const cached = memo.get(key);
        if (cached !== undefined) return cached;
        const stats = histogram(tokens, start, stop);
        const bytes = (tokens[stop]?.position ?? end) - tokens[start]!.position;
        const result = Math.min(dynamicTree(stats).bits, 3 + symbolBits(stats, FIXED_LL, FIXED_DD), bytes * 8 + 40);
        memo.set(key, result);
        return result;
    };
    const segments = [{ start: 0, end: tokens.length, done: false }];
    const rawBytes = end - tokens[0]!.position;
    if (cost(0, tokens.length) >= rawBytes * 8 + 40) return [tokens[0]!.position, end];
    while (segments.length < 15) {
        const segment = segments.filter(s => !s.done).sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];
        if (!segment) break;
        segment.done = true;
        if (segment.end - segment.start < 20) continue;
        let low = segment.start + 1, high = segment.end - 1;
        let best = low, bestCost = Infinity;
        while (high - low > 9) {
            const step = Math.floor((high - low) / 10);
            let roundBest = -1, roundCost = Infinity;
            for (let i = 1; i <= 9; i++) {
                const position = low + i * step;
                const value = cost(segment.start, position) + cost(position, segment.end);
                if (value < roundCost) { roundCost = value; roundBest = position; }
            }
            if (roundCost >= bestCost) break;
            best = roundBest; bestCost = roundCost;
            low = Math.max(low, best - step); high = Math.min(high, best + step);
        }
        for (let position = low; position <= high; position++) {
            const value = cost(segment.start, position) + cost(position, segment.end);
            if (value < bestCost) { best = position; bestCost = value; }
        }
        if (bestCost >= cost(segment.start, segment.end)) continue;
        segments.splice(segments.indexOf(segment), 1,
            { start: segment.start, end: best, done: false }, { start: best, end: segment.end, done: false });
    }
    return [...segments.map(s => tokens[s.start]!.position), end];
}

function emitTokens(writer: BitWriter, tokens: readonly Token[], ll: readonly number[], dd: readonly number[]): void {
    const lc = codes(ll), dc = codes(dd);
    for (const token of tokens) {
        if (!token.distance) writer.code(lc[token.value]!, ll[token.value]!);
        else {
            const ls = LENGTH_SYMBOL[token.value]!, ds = DISTANCE_SYMBOL[token.distance]!;
            writer.code(lc[ls]!, ll[ls]!);
            writer.write(token.value - LENGTH_BASE[ls - 257]!, LENGTH_EXTRA[ls - 257]!);
            writer.code(dc[ds]!, dd[ds]!);
            writer.write(token.distance - DISTANCE_BASE[ds]!, DISTANCE_EXTRA[ds]!);
        }
    }
    writer.code(lc[256]!, ll[256]!);
}

function emitBlock(writer: BitWriter, input: Buffer, start: number, end: number, cache: readonly Match[][], cacheStart: number, iterations: number, final: boolean): void {
    const block = optimizeBlock(input, start, end, cache, cacheStart, iterations);
    const bits = block.fixed ? 3 + symbolBits(histogram(block.tokens), FIXED_LL, FIXED_DD) : block.tree.bits;
    if ((end - start) * 8 + Math.ceil((end - start) / 65535) * 40 + 7 < bits) {
        for (let pos = start; pos < end;) {
            const size = Math.min(end - pos, 65535);
            writer.write(final && pos + size === end ? 1 : 0, 1); writer.write(0, 2); writer.align();
            writer.write(size, 16); writer.write(size ^ 65535, 16);
            for (let i = 0; i < size; i++) writer.write(input[pos + i]!, 8);
            pos += size;
        }
        return;
    }
    writer.write(final ? 1 : 0, 1); writer.write(block.fixed ? 1 : 2, 2);
    if (block.fixed) { emitTokens(writer, block.tokens, FIXED_LL, FIXED_DD); return; }
    const { ll, dd, header } = block.tree;
    writer.write(header.llCount - 257, 5); writer.write(header.ddCount - 1, 5); writer.write(header.clCount - 4, 4);
    for (let i = 0; i < header.clCount; i++) writer.write(header.lengths[CL_ORDER[i]!]!, 3);
    const clCodes = codes(header.lengths);
    for (const [symbol, extra] of header.runs) {
        writer.code(clCodes[symbol]!, header.lengths[symbol]!);
        if (symbol >= 16) writer.write(extra, symbol === 16 ? 2 : symbol === 17 ? 3 : 7);
    }
    emitTokens(writer, block.tokens, ll, dd);
}

export function zopfliDeflate(input: Buffer, iterations: number): Buffer {
    const writer = new BitWriter();
    if (!input.length) { writer.write(3, 3); writer.write(0, 7); return writer.finish(); }
    // Bound match-cache memory; matches can still use the preceding 32 KiB.
    for (let start = 0; start < input.length; start += 65536) {
        const end = Math.min(input.length, start + 65536);
        const cache = matchCache(input, start, end);
        const greedyTokens = greedy(input, start, end, cache, start);
        const boundaries = splitBlocks(greedyTokens, end);
        for (let i = 0; i + 1 < boundaries.length; i++) {
            emitBlock(writer, input, boundaries[i]!, boundaries[i + 1]!, cache, start, iterations, boundaries[i + 1] === input.length);
        }
    }
    return writer.finish();
}
