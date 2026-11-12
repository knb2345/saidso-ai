/**
 * Rebuilds the entity graph from the current memories (src/lib/graph.ts). One model call.
 *
 *   npm run graph
 */
import { buildGraph } from '../src/lib/graph';
import { config } from '../src/lib/config';

const user = process.argv.find((a) => a.startsWith('--user='))?.slice(7) || config.defaultUserId;
const t0 = Date.now();
buildGraph(user)
  .then((r) => {
    console.log(
      `graph built for ${user}: ${r.entities} entities, ${r.links} links from ${r.covered}/${r.memories} memories` +
        ` in ${((Date.now() - t0) / 1000).toFixed(1)}s, ~$${r.costUsd.toFixed(5)}`
    );
  })
  .catch((e) => {
    console.error('graph build failed:', e?.message ?? e);
    process.exit(1);
  });
