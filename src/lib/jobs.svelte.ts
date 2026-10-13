// The job queue: renders, recordings and transcriptions run one at a time.

import * as backend from './backend';
import { uid } from './model';

export type JobKind = 'render' | 'record' | 'whisper' | 'download';
export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface JobSpec {
  kind: JobKind;
  title: string;
  program: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  /** Where the result is expected to land (for Open / Show in folder). */
  output?: string;
  /** Called with stdout when the job succeeds (e.g. whisper text). */
  onDone?: (job: Job) => void;
}

export interface Job extends JobSpec {
  id: string;
  status: JobStatus;
  progress: { title: string; current: number; total: number; eta: number } | null;
  log: string[];
  stdout: string[];
  error: string | null;
  startedAt: number | null;
  endedAt: number | null;
}

const LOG_LIMIT = 3000;

class JobQueue {
  jobs = $state<Job[]>([]);
  private listening = false;

  get active(): Job | undefined {
    return this.jobs.find((j) => j.status === 'running');
  }

  get pending(): number {
    return this.jobs.filter((j) => j.status === 'queued' || j.status === 'running').length;
  }

  async init() {
    if (this.listening) return;
    this.listening = true;
    await backend.onJobOutput((e) => {
      const job = this.find(e.id);
      if (!job) return;
      const target = e.stream === 'stdout' ? job.stdout : job.log;
      target.push(e.line);
      if (target.length > LOG_LIMIT) target.splice(0, target.length - LOG_LIMIT);
    });
    await backend.onJobProgress((e) => {
      const job = this.find(e.id);
      if (job) job.progress = { title: e.title, current: e.current, total: e.total, eta: e.eta };
    });
    await backend.onJobExit((e) => {
      const job = this.find(e.id);
      if (!job) return;
      job.endedAt = Date.now();
      if (e.cancelled) job.status = 'cancelled';
      else if (e.code === 0) job.status = 'done';
      else {
        job.status = 'failed';
        job.error = e.error ?? backend.aeError(job.log.join('\n')) ?? `auto-editor exited with code ${e.code}`;
      }
      if (job.status === 'done') job.onDone?.(job);
      this.next();
    });
  }

  private find(id: string): Job | undefined {
    return this.jobs.find((j) => j.id === id);
  }

  add(specs: JobSpec[]): Job[] {
    const added = specs.map<Job>((s) => ({
      ...s,
      id: uid('job'),
      status: 'queued',
      progress: null,
      log: [],
      stdout: [],
      error: null,
      startedAt: null,
      endedAt: null,
    }));
    this.jobs.push(...added);
    this.next();
    return added.map((j) => this.find(j.id)!);
  }

  private async next() {
    if (this.active) return;
    const job = this.jobs.find((j) => j.status === 'queued');
    if (!job) return;
    job.status = 'running';
    job.startedAt = Date.now();
    job.log.push(`$ ${job.title}`);
    try {
      await backend.startJob(job.id, job.program, job.args, { cwd: job.cwd, env: job.env });
    } catch (e) {
      job.status = 'failed';
      job.error = backend.errorText(e);
      job.endedAt = Date.now();
      this.next();
    }
  }

  /** Recordings finish gracefully (Ctrl-C keeps the capture); everything
   *  else is killed. */
  async stop(id: string) {
    const job = this.find(id);
    if (!job) return;
    if (job.status === 'queued') {
      job.status = 'cancelled';
      return;
    }
    if (job.status !== 'running') return;
    const graceful = job.kind === 'record' || (job.kind === 'whisper' && job.args.includes(':mic'));
    if (graceful) {
      job.log.push('Stopping recording…');
      await backend.stopJob(id, true);
    } else {
      await backend.stopJob(id, false);
    }
  }

  async kill(id: string) {
    await backend.stopJob(id, false);
  }

  retry(id: string) {
    const job = this.find(id);
    if (!job) return;
    this.add([{ kind: job.kind, title: job.title, program: job.program, args: job.args, cwd: job.cwd, env: job.env, output: job.output, onDone: job.onDone }]);
  }

  clearFinished() {
    this.jobs = this.jobs.filter((j) => j.status === 'queued' || j.status === 'running');
  }

  remove(id: string) {
    this.jobs = this.jobs.filter((j) => j.id !== id || j.status === 'running');
  }
}

export const queue = new JobQueue();

export function percent(job: Job): number | null {
  if (job.status === 'done') return 100;
  const p = job.progress;
  if (!p || !p.total) return null;
  return Math.max(0, Math.min(100, (p.current / p.total) * 100));
}
