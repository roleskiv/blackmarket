/**
 * Append-only JSON-lines round store. Every round is one line; status
 * changes are appended as patch lines, so nothing is ever rewritten.
 * Good enough for a reference deployment and for audit exports; a
 * production RGS would use its transactional database behind the same
 * RoundStore interface.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { MemoryRoundStore } from '../rgs/memory';
import type { RoundRecord } from '../rgs/types';

type Line = { t: 'round'; record: RoundRecord } | { t: 'patch'; roundId: string; patch: Partial<RoundRecord> };

export class FileRoundStore extends MemoryRoundStore {
  constructor(private readonly path: string) {
    const records: RoundRecord[] = [];
    if (existsSync(path)) {
      const byId = new Map<string, RoundRecord>();
      for (const raw of readFileSync(path, 'utf8').split('\n')) {
        if (!raw.trim()) continue;
        const line = JSON.parse(raw) as Line;
        if (line.t === 'round') {
          records.push(line.record);
          byId.set(line.record.roundId, line.record);
        } else {
          const r = byId.get(line.roundId);
          if (r) Object.assign(r, line.patch);
        }
      }
    } else {
      mkdirSync(dirname(path), { recursive: true });
    }
    super(records);
  }

  private write(line: Line): void {
    appendFileSync(this.path, JSON.stringify(line) + '\n');
  }

  override async append(record: RoundRecord): Promise<void> {
    this.write({ t: 'round', record });
    await super.append(record);
  }

  override async update(roundId: string, patch: Partial<RoundRecord>): Promise<void> {
    this.write({ t: 'patch', roundId, patch });
    await super.update(roundId, patch);
  }
}
