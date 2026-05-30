import path from 'node:path';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { pathExists, readJsonIfExists, stringifyJson } from '../utils/fs.js';
import { getStatePaths } from '../state/paths.js';
import { listActiveModes, writeModeState, type ModeState } from '../state/modes.js';
import type { OmqMcpTarget } from './registry.js';

export type JsonObject = Record<string, unknown>;

function cwdFromArgs(args: JsonObject): string {
  return typeof args.cwd === 'string' && args.cwd ? path.resolve(args.cwd) : process.cwd();
}

function stringArg(args: JsonObject, name: string, fallback = ''): string {
  const value = args[name];
  return typeof value === 'string' ? value : fallback;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'page';
}

function memoryDir(cwd: string): string {
  return path.join(getStatePaths(cwd).root, 'memory');
}

function memoryFile(cwd: string): string {
  return path.join(memoryDir(cwd), 'notepad.md');
}

function wikiDir(cwd: string): string {
  return path.join(getStatePaths(cwd).root, 'wiki', 'pages');
}

function wikiPagePath(cwd: string, page: string): string {
  const safe = slugify(page.replace(/\.md$/i, ''));
  return path.join(wikiDir(cwd), `${safe}.md`);
}

async function readTextIfExists(file: string): Promise<string> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw error;
  }
}

function textResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] };
}

function errorResult(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

export function buildStateTools(): Tool[] {
  return [
    {
      name: 'state_status',
      description: 'List active .omq workflow modes and important state paths for the current project.',
      inputSchema: {
        type: 'object',
        properties: { cwd: { type: 'string', description: 'Project directory. Defaults to the MCP process cwd.' } },
        additionalProperties: false,
      },
    },
    {
      name: 'state_read_mode',
      description: 'Read a mode JSON state file from .omq/state/modes.',
      inputSchema: {
        type: 'object',
        properties: {
          cwd: { type: 'string' },
          mode: { type: 'string', description: 'Mode name, for example launch, goal, team, ralplan.' },
        },
        required: ['mode'],
        additionalProperties: false,
      },
    },
    {
      name: 'state_write_mode',
      description: 'Write a mode JSON state file under .omq/state/modes. Use for durable workflow checkpoints.',
      inputSchema: {
        type: 'object',
        properties: {
          cwd: { type: 'string' },
          mode: { type: 'string' },
          state: { type: 'object', additionalProperties: true },
        },
        required: ['mode', 'state'],
        additionalProperties: false,
      },
    },
  ];
}

export function buildMemoryTools(): Tool[] {
  return [
    {
      name: 'memory_read',
      description: 'Read the project .omq memory notepad.',
      inputSchema: {
        type: 'object',
        properties: { cwd: { type: 'string' } },
        additionalProperties: false,
      },
    },
    {
      name: 'memory_write',
      description: 'Append a timestamped note to the project .omq memory notepad.',
      inputSchema: {
        type: 'object',
        properties: {
          cwd: { type: 'string' },
          section: { type: 'string', description: 'Optional section label.' },
          content: { type: 'string' },
        },
        required: ['content'],
        additionalProperties: false,
      },
    },
  ];
}

export function buildWikiTools(): Tool[] {
  return [
    {
      name: 'wiki_search',
      description: 'Search project .omq wiki pages by filename or content.',
      inputSchema: {
        type: 'object',
        properties: {
          cwd: { type: 'string' },
          query: { type: 'string' },
          limit: { type: 'number' },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
    {
      name: 'wiki_read',
      description: 'Read a project .omq wiki page by title or slug.',
      inputSchema: {
        type: 'object',
        properties: {
          cwd: { type: 'string' },
          page: { type: 'string' },
        },
        required: ['page'],
        additionalProperties: false,
      },
    },
    {
      name: 'wiki_write',
      description: 'Create or replace a project .omq wiki page.',
      inputSchema: {
        type: 'object',
        properties: {
          cwd: { type: 'string' },
          title: { type: 'string' },
          content: { type: 'string' },
          category: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'content'],
        additionalProperties: false,
      },
    },
  ];
}

export function toolsForTarget(target: OmqMcpTarget): Tool[] {
  if (target === 'state') return buildStateTools();
  if (target === 'memory') return buildMemoryTools();
  return buildWikiTools();
}

export async function callStateTool(name: string, args: JsonObject): Promise<CallToolResult> {
  const cwd = cwdFromArgs(args);
  const paths = getStatePaths(cwd);
  if (name === 'state_status') {
    const active = await listActiveModes(cwd);
    return textResult(stringifyJson({ cwd, stateRoot: paths.root, activeModes: active.map((mode) => ({ mode: mode.mode, file: mode.file, state: mode.state })) }));
  }
  if (name === 'state_read_mode') {
    const mode = stringArg(args, 'mode');
    if (!mode) return errorResult('mode is required');
    const file = path.join(paths.modes, `${mode}.json`);
    const state = await readJsonIfExists<ModeState | null>(file, null);
    if (!state) return errorResult(`mode state not found: ${mode}`);
    return textResult(stringifyJson({ file, state }));
  }
  if (name === 'state_write_mode') {
    const mode = stringArg(args, 'mode');
    const state = args.state;
    if (!mode) return errorResult('mode is required');
    if (!state || typeof state !== 'object' || Array.isArray(state)) return errorResult('state object is required');
    const file = await writeModeState(mode, state as ModeState, cwd);
    return textResult(stringifyJson({ file, state: await readJsonIfExists<ModeState>(file, {}) }));
  }
  return errorResult(`unknown state tool: ${name}`);
}

export async function callMemoryTool(name: string, args: JsonObject): Promise<CallToolResult> {
  const cwd = cwdFromArgs(args);
  if (name === 'memory_read') {
    const file = memoryFile(cwd);
    const text = await readTextIfExists(file);
    return textResult(text || `No project memory yet at ${file}`);
  }
  if (name === 'memory_write') {
    const content = stringArg(args, 'content').trim();
    const section = stringArg(args, 'section', 'note').trim() || 'note';
    if (!content) return errorResult('content is required');
    await mkdir(memoryDir(cwd), { recursive: true });
    const file = memoryFile(cwd);
    const previous = await readTextIfExists(file);
    const entry = `\n## ${section} — ${new Date().toISOString()}\n\n${content}\n`;
    await writeFile(file, `${previous}${entry}`, 'utf8');
    return textResult(stringifyJson({ file, appended: true }));
  }
  return errorResult(`unknown memory tool: ${name}`);
}

export async function callWikiTool(name: string, args: JsonObject): Promise<CallToolResult> {
  const cwd = cwdFromArgs(args);
  if (name === 'wiki_write') {
    const title = stringArg(args, 'title').trim();
    const content = stringArg(args, 'content').trim();
    if (!title) return errorResult('title is required');
    if (!content) return errorResult('content is required');
    const category = stringArg(args, 'category', 'reference');
    const tags = Array.isArray(args.tags) ? args.tags.filter((tag): tag is string => typeof tag === 'string') : [];
    await mkdir(wikiDir(cwd), { recursive: true });
    const file = wikiPagePath(cwd, title);
    const body = `---\ntitle: ${JSON.stringify(title)}\ncategory: ${JSON.stringify(category)}\ntags: ${JSON.stringify(tags)}\nupdated_at: ${JSON.stringify(new Date().toISOString())}\n---\n\n# ${title}\n\n${content}\n`;
    await writeFile(file, body, 'utf8');
    return textResult(stringifyJson({ file, title, category, tags }));
  }
  if (name === 'wiki_read') {
    const page = stringArg(args, 'page').trim();
    if (!page) return errorResult('page is required');
    const file = wikiPagePath(cwd, page);
    const text = await readTextIfExists(file);
    if (!text) return errorResult(`wiki page not found: ${page}`);
    return textResult(text);
  }
  if (name === 'wiki_search') {
    const query = stringArg(args, 'query').trim().toLowerCase();
    const limit = typeof args.limit === 'number' && Number.isFinite(args.limit) ? Math.max(1, Math.min(Math.trunc(args.limit), 50)) : 10;
    if (!query) return errorResult('query is required');
    const dir = wikiDir(cwd);
    if (!(await pathExists(dir))) return textResult('[]');
    const files = (await readdir(dir)).filter((file) => file.endsWith('.md'));
    const matches: Array<{ page: string; file: string; snippet: string }> = [];
    for (const fileName of files) {
      const file = path.join(dir, fileName);
      const text = await readTextIfExists(file);
      const haystack = `${fileName}\n${text}`.toLowerCase();
      if (!haystack.includes(query)) continue;
      const idx = Math.max(0, haystack.indexOf(query));
      matches.push({ page: fileName.replace(/\.md$/, ''), file, snippet: text.slice(Math.max(0, idx - 120), idx + 240) });
      if (matches.length >= limit) break;
    }
    return textResult(stringifyJson(matches));
  }
  return errorResult(`unknown wiki tool: ${name}`);
}

export async function callToolForTarget(target: OmqMcpTarget, name: string, args: JsonObject): Promise<CallToolResult> {
  const exposed = toolsForTarget(target);
  if (!exposed.some((tool) => tool.name === name)) return errorResult(`tool "${name}" is not exposed by omq_${target}`);
  if (target === 'state') return callStateTool(name, args);
  if (target === 'memory') return callMemoryTool(name, args);
  return callWikiTool(name, args);
}

export function objectArgs(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}
