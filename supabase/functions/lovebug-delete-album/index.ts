/** Retired in v0.6.4: deleting an entire active album would bypass both votes.
 * Disconnect instead grants both people a 7-day download-only window.
 * Retained at its original route so older clients fail safely, not destructively.
 */
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};
Deno.serve((request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return Response.json({ error: 'POST required' }, { status: 405, headers });
  return Response.json({ error: 'Full album deletion is disabled. Disconnect instead; shared photos require two approvals.' },
    { status: 410, headers });
});
