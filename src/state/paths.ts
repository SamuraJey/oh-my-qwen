import path from 'node:path';
import { ensureDir } from '../utils/fs.js';
import { stateRoot } from '../qwen/paths.js';

export interface StatePaths {
  root: string;
  context: string;
  plans: string;
  goals: string;
  reviews: string;
  logs: string;
  modes: string;
  hooks: string;
  backups: string;
  team: string;
}

export function getStatePaths(cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env): StatePaths {
  const root = stateRoot(cwd, env);
  return {
    root,
    context: path.join(root, 'context'),
    plans: path.join(root, 'plans'),
    goals: path.join(root, 'goals'),
    reviews: path.join(root, 'reviews'),
    logs: path.join(root, 'logs'),
    modes: path.join(root, 'state', 'modes'),
    hooks: path.join(root, 'state', 'hooks'),
    backups: path.join(root, 'backups'),
    team: path.join(root, 'team'),
  };
}

export async function ensureStateTree(cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env): Promise<StatePaths> {
  const paths = getStatePaths(cwd, env);
  await Promise.all(Object.values(paths).map((dir) => ensureDir(dir)));
  return paths;
}
