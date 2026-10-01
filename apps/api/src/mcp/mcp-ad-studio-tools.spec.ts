import {
  connectFirestoreOrmAdmin,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  listAuditLogEntriesForOrg,
} from '@growthos/firebase-orm-models';
import { configureAdStudioRuntime, createMemoryMediaStorage } from '@growthos/ad-studio';
import { registerMcpAdStudioTools } from './mcp-ad-studio-tools';
import type { McpAuthContext } from './mcp-auth.guard';
import type { ToolResult } from './mcp-tools';

/**
 * The Ad Studio over MCP, end to end against the Firestore emulator: an API-key agent creates an ad,
 * writes and renders image ideas, looks at an image, changes it, runs the autopilot to finished
 * creatives, and is refused what only a human may do (sending creatives to an ad platform). Google's
 * APIs are stood in for by a fetch stub with their documented shapes.
 */

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7, 7]);

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8100';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  await connectFirestoreOrmAdmin({ projectId: 'demo-growthos-test' });
});

let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  delete process.env.ANTHROPIC_API_KEY;
  const storage = createMemoryMediaStorage();
  configureAdStudioRuntime({ mediaStorage: () => storage });
  fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    if (url.endsWith(':generateContent')) {
      const schema = JSON.stringify((body?.generationConfig as { responseJsonSchema?: unknown })?.responseJsonSchema ?? {});
      const prompt = (body?.contents as { parts: { text: string }[] }[] | undefined)?.[0]?.parts?.[0]?.text ?? '';
      if (schema.includes('"key"')) {
        // The copywriter: one entry per creative it was asked about.
        const targets = JSON.parse(prompt.split('\n').at(-1) as string) as { key: string }[];
        return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ items: targets.map((target) => ({ key: target.key, headline: `Head ${target.key}`.slice(0, 30), primaryText: 'Sign from WhatsApp.', description: '' })) }) }] } }] });
      }
      if (schema.includes('"lines"')) {
        // The vocalizer: every line comes back with a marker standing in for the nikud.
        const lines = JSON.parse(prompt.split('\n')[1]) as { id: string; text: string }[];
        return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ lines: lines.map((line) => ({ id: line.id, pronunciation: `${line.text}\u05b8` })) }) }] } }] });
      }
      const answer = schema.includes('"concepts"')
        ? { concepts: [{ visualPrompt: 'A lawyer signing on a phone', headline: 'Sign in 30 seconds', formats: ['square'] }] }
        : { title: 't', scenes: [{ durationSeconds: 5, visualPrompt: 'A desk', voiceover: '', onScreenText: '' }] };
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] });
    }
    if (url === `${BASE}/interactions` && body?.model === 'gemini-3.1-flash-image') {
      return Response.json({ id: 'img', status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'image', mime_type: 'image/png', data: PNG.toString('base64') }] }] });
    }
    return new Response(JSON.stringify({ error: { message: `unexpected ${url}` } }), { status: 404 });
  });
});

afterEach(() => {
  fetchSpy.mockRestore();
  delete process.env.GEMINI_API_KEY;
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

async function setup(scopes: string[]) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: 'MCP Ad Studio Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  const auth = { organizationId: organization.id, projectId: project.id, principalKind: 'api_key', scopes, apiKeyId: 'key-1' } as unknown as McpAuthContext;
  const handlers = new Map<string, (args: unknown) => Promise<ToolResult>>();
  registerMcpAdStudioTools({ registerTool: (name: string, _config: unknown, handler: (args: unknown) => Promise<ToolResult>) => handlers.set(name, handler) } as never, auth);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const handler = handlers.get(name);
    if (!handler) throw new Error(`no tool ${name}`);
    return handler(args);
  };
  const json = async <T>(name: string, args: Record<string, unknown> = {}): Promise<T> => {
    const result = await call(name, args);
    if (result.isError) throw new Error(`${name} failed: ${(result.content[0] as { text: string }).text}`);
    return JSON.parse((result.content[0] as { text: string }).text) as T;
  };
  return { auth, call, json, orgId: organization.id };
}

const BRIEF = { name: 'Sign fast', objective: 'Trial signups', product_description: 'E-signatures for lawyers', format: 'vertical', language: 'en', target_seconds: 10 };

describe('Ad Studio MCP tools', () => {
  it('lets an agent write ideas, render an image, look at it, change it, and see it all in get_ad_brief', async () => {
    const { json, call } = await setup(['mcp.read', 'ai.use']);
    const { ad } = await json<{ ad: { id: string } }>('create_ad_brief', BRIEF);

    const ideas = await json<{ id: string; formats: string[] }[]>('generate_ad_image_ideas', { brief_id: ad.id, image_formats: ['square', 'story'] });
    expect(ideas[0].formats).toEqual(['square', 'story']);

    const rendered = await json<{ image_id: string; status: string; selected: boolean }>('render_ad_image', { brief_id: ad.id, idea_id: ideas[0].id, format: 'square' });
    expect(rendered).toMatchObject({ status: 'ready', selected: true });

    const image = await call('get_ad_image', { brief_id: ad.id, image_id: rendered.image_id });
    expect(image.isError).toBeUndefined();
    expect(image.content[1]).toEqual({ type: 'image', data: PNG.toString('base64'), mimeType: 'image/png' });

    const edited = await json<{ image_id: string; parent_image_id: string; version: number }>('edit_ad_image', { brief_id: ad.id, image_id: rendered.image_id, instruction: 'Warmer light' });
    expect(edited).toMatchObject({ parent_image_id: rendered.image_id, version: 2 });

    const state = await json<{ image_ideas: { placements: { format: string; state: string; selected_image_id: string | null; versions: unknown[] }[] }[] }>('get_ad_brief', { brief_id: ad.id });
    expect(state.image_ideas[0].placements).toEqual([
      expect.objectContaining({ format: 'square', state: 'ready', selected_image_id: edited.image_id }),
      expect.objectContaining({ format: 'story', state: 'none', selected_image_id: null, versions: [] }),
    ]);

    const usage = await json<{ today: { images: number; text_generations: number } }>('get_ad_studio_usage');
    expect(usage.today).toMatchObject({ images: 2, text_generations: 1 });
  });

  it('runs the autopilot to the plan, waits for the person to confirm it, then to finished creatives', async () => {
    const { json, call } = await setup(['mcp.read', 'ai.use']);
    const { ad } = await json<{ ad: { id: string } }>('create_ad_brief', BRIEF);
    type Run = { run_id: string; status: string; next: string | null; options: { confirm_plan: boolean }; plan_approved_on: string | null };
    let run = await json<Run>('start_ad_autopilot', { brief_id: ad.id, plan: false, video: false, image_formats: ['portrait'] });
    expect(run.options.confirm_plan).toBe(true);
    const advance = async () => {
      for (let calls = 0; calls < 20 && run.status === 'running'; calls += 1) {
        run = await json('advance_ad_autopilot', { brief_id: ad.id, run_id: run.run_id });
      }
    };
    await advance();
    expect(run.status).toBe('awaiting_approval');
    expect(run.next).toContain('approve_ad_plan');
    const before = await json<{ image_ideas: { placements: { state: string }[] }[] }>('get_ad_brief', { brief_id: ad.id });
    expect(before.image_ideas[0].placements[0].state).toBe('none');

    run = await json<Run>('approve_ad_plan', { brief_id: ad.id, run_id: run.run_id });
    expect(run).toMatchObject({ status: 'running', plan_approved_on: expect.any(String) });
    const again = await call('approve_ad_plan', { brief_id: ad.id, run_id: run.run_id });
    expect((again.content[0] as { text: string }).text).toContain('not waiting for its plan');
    await advance();
    expect(run.status).toBe('done');
    expect(run.next).toBeNull();
    const state = await json<{ image_ideas: { placements: { format: string; state: string }[] }[] }>('get_ad_brief', { brief_id: ad.id });
    expect(state.image_ideas[0].placements).toEqual([expect.objectContaining({ format: 'portrait', state: 'ready' })]);
  });

  it('vocalizes Hebrew narration when an agent saves the script, and keeps a pronunciation it sends back', async () => {
    const { json } = await setup(['mcp.read', 'ai.use']);
    const { ad } = await json<{ ad: { id: string } }>('create_ad_brief', { ...BRIEF, language: 'he' });
    // Hebrew as escapes (no Hebrew in code files).
    const plain = '\u05e9\u05dc\u05d5\u05dd';
    const scene = { id: 's1', duration_seconds: 5, visual_prompt: 'A desk', voiceover: plain, on_screen_text: '' };
    type Scene = { id: string; pronunciation: string | null };
    const saved = await json<Scene[]>('save_ad_script', { brief_id: ad.id, scenes: [scene, { ...scene, id: 's2', voiceover: '' }] });
    expect(saved.map((entry) => entry.pronunciation)).toEqual([`${plain}\u05b8`, null]);
    const kept = await json<Scene[]>('save_ad_script', { brief_id: ad.id, scenes: [{ ...scene, pronunciation: `${plain}!` }] });
    expect(kept[0].pronunciation).toBe(`${plain}!`);
    const usage = await json<{ today: { text_generations: number } }>('get_ad_studio_usage');
    expect(usage.today.text_generations).toBe(1);
  });

  it('lets an agent add app screenshots and illustrations, attach them to scenes, look at them, and delete them', async () => {
    const { json, call } = await setup(['mcp.read', 'ai.use']);
    const { ad } = await json<{ ad: { id: string } }>('create_ad_brief', BRIEF);
    const listed = await json<{ references: unknown[]; can_draw_illustrations: boolean }>('list_ad_references', { brief_id: ad.id });
    expect(listed).toEqual({ references: [], can_draw_illustrations: true });

    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
    type Ref = { image_id: string; source: string; status: string };
    const screen = await json<Ref>('add_ad_reference', { brief_id: ad.id, source: 'upload', label: 'Dashboard', description: 'The app dashboard', image_base64: pngHeader.toString('base64') });
    expect(screen).toMatchObject({ source: 'upload', status: 'ready' });
    const drawn = await json<Ref>('add_ad_reference', { brief_id: ad.id, source: 'illustration', label: 'Signed', prompt: 'A signed contract on a phone' });
    expect(drawn).toMatchObject({ source: 'illustration', status: 'ready' });
    const gif = await call('add_ad_reference', { brief_id: ad.id, source: 'upload', label: 'x', image_base64: Buffer.from('GIF89a').toString('base64') });
    expect((gif.content[0] as { text: string }).text).toBe('Cannot do that: unsupported_image.');
    const capture = await call('add_ad_reference', { brief_id: ad.id, source: 'screenshot', label: 'x' });
    expect((capture.content[0] as { text: string }).text).toBe('Invalid: source must be "upload" or "illustration".');

    const image = await call('get_ad_reference', { brief_id: ad.id, image_id: screen.image_id });
    expect(image.content[1]).toEqual({ type: 'image', data: pngHeader.toString('base64'), mimeType: 'image/png' });

    const scene = { id: 's1', duration_seconds: 5, visual_prompt: 'A laptop on a desk', voiceover: '', on_screen_text: '' };
    type Scene = { references: { image_id: string; use: string }[] };
    const saved = await json<Scene[]>('save_ad_script', { brief_id: ad.id, scenes: [{ ...scene, references: [{ image_id: screen.image_id, use: 'screen' }, { image_id: drawn.image_id, use: 'subject' }] }] });
    expect(saved[0].references).toEqual([
      { image_id: screen.image_id, use: 'screen' },
      { image_id: drawn.image_id, use: 'subject' },
    ]);
    const unknown = await call('save_ad_script', { brief_id: ad.id, scenes: [{ ...scene, references: [{ image_id: 'nope', use: 'screen' }] }] });
    expect((unknown.content[0] as { text: string }).text).toContain('unknown_reference (scene 1)');

    await json('delete_ad_reference', { brief_id: ad.id, image_id: screen.image_id });
    const state = await json<{ scenes: Scene[] }>('get_ad_brief', { brief_id: ad.id });
    expect(state.scenes[0].references).toEqual([{ image_id: drawn.image_id, use: 'subject' }]);
    expect((await json<{ today: { images: number } }>('get_ad_studio_usage')).today.images).toBe(1);
  });

  it('lets an agent write the ad copy of every creative, read it in get_ad_brief, edit it and clear it', async () => {
    const { json, call } = await setup(['mcp.read', 'ai.use']);
    const { ad } = await json<{ ad: { id: string } }>('create_ad_brief', BRIEF);
    await json('save_ad_script', { brief_id: ad.id, scenes: [{ id: 's1', duration_seconds: 5, visual_prompt: 'A desk', voiceover: 'Sign fast', on_screen_text: '' }] });
    const ideas = await json<{ id: string }[]>('save_ad_image_ideas', { brief_id: ad.id, ideas: [{ id: 'c1', visual_prompt: 'A phone', headline: '', formats: ['square'] }] });
    type Copy = { headline: string; primary_text: string; description: string } | null;
    const written = await json<{ video: Copy; image_ideas: { id: string; copy: Copy }[] }>('write_ad_copy', { brief_id: ad.id });
    expect(written.video).toEqual({ headline: 'Head video', primary_text: 'Sign from WhatsApp.', description: '' });
    expect(written.image_ideas).toEqual([{ id: ideas[0].id, copy: { headline: `Head ${ideas[0].id}`.slice(0, 30), primary_text: 'Sign from WhatsApp.', description: '' } }]);

    const edited = await json<{ video: Copy }>('save_ad_copy', { brief_id: ad.id, video_copy: { headline: 'Signed. Done.', primary_text: 'x', description: 'y' } });
    expect(edited.video).toEqual({ headline: 'Signed. Done.', primary_text: 'x', description: 'y' });
    const state = await json<{ video: { copy: Copy }; image_ideas: { copy: Copy }[] }>('get_ad_brief', { brief_id: ad.id });
    expect(state.video.copy?.headline).toBe('Signed. Done.');
    expect(state.image_ideas[0].copy).not.toBeNull();
    const tooLong = await call('save_ad_copy', { brief_id: ad.id, image_copies: { [ideas[0].id]: { headline: 'x'.repeat(31), primary_text: '', description: '' } } });
    expect((tooLong.content[0] as { text: string }).text).toBe(`The ad copy breaks these rules: copy_headline_too_long (${ideas[0].id}).`);
    const cleared = await json<{ image_ideas: { copy: Copy }[] }>('save_ad_copy', { brief_id: ad.id, image_copies: { [ideas[0].id]: null } });
    expect(cleared.image_ideas[0].copy).toBeNull();
  });

  it('refuses without the permission each tool needs, and never lets an API key export', async () => {
    const readOnly = await setup(['mcp.read']);
    const refused = await readOnly.call('list_ad_briefs');
    expect(refused.isError).toBe(true);
    expect((refused.content[0] as { text: string }).text).toContain('"ai.use"');

    const agent = await setup(['mcp.read', 'ai.use', 'project.configure']);
    const { ad } = await agent.json<{ ad: { id: string } }>('create_ad_brief', BRIEF);
    const exported = await agent.call('export_ad_image', { brief_id: ad.id, image_id: 'x', destination: 'meta', title: 'x' });
    expect(exported.isError).toBe(true);
    expect((exported.content[0] as { text: string }).text).toContain('"automation.execute"');
    const published = await agent.call('publish_ad', { brief_id: ad.id, destination: 'meta', image_id: 'x', campaign_name: 'x', headline: 'x', primary_text: 'x', link_url: 'https://x.example', daily_budget: 10 });
    expect(published.isError).toBe(true);
    expect((published.content[0] as { text: string }).text).toContain('"automation.execute"');

    const limits = await agent.json<{ daily_images: number }>('set_ad_studio_limits', { daily_text_generations: 10, daily_video_seconds: 60, daily_images: 0 });
    expect(limits.daily_images).toBe(0);
    // The AI quality check of clips: on with one retry by default; a partial change keeps the rest.
    expect((await agent.json<{ video_qa: unknown }>('get_ad_studio_usage')).video_qa).toEqual({ enabled: true, retries: 1 });
    const qa = await agent.json<{ video_qa: unknown }>('set_ad_studio_limits', { daily_text_generations: 10, daily_video_seconds: 60, video_qa_retries: 2 });
    expect(qa.video_qa).toEqual({ enabled: true, retries: 2 });
    const badRetries = await agent.call('set_ad_studio_limits', { daily_text_generations: 10, daily_video_seconds: 60, video_qa_retries: 9 });
    expect((badRetries.content[0] as { text: string }).text).toContain('videoQa.retries must be a whole number from 0 to 2');
    const ideas = await agent.json<{ id: string }[]>('save_ad_image_ideas', { brief_id: ad.id, ideas: [{ id: 'c1', visual_prompt: 'A phone', headline: '', formats: ['square'] }] });
    const overLimit = await agent.call('render_ad_image', { brief_id: ad.id, idea_id: ideas[0].id, format: 'square' });
    expect((overLimit.content[0] as { text: string }).text).toContain('daily Ad Studio limit for images is reached (0 of 0)');

    const audit = await listAuditLogEntriesForOrg(agent.orgId, 50);
    expect(audit.some((entry) => entry.action === 'mcp.tool_call')).toBe(true);
  });
});
