#!/usr/bin/env node
'use strict';

const requiredGetE3dUrl = 'https://e3d.ai/token';

function getArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  if (match) return match.slice(prefix.length);
  return process.env[name.toUpperCase().replace(/-/g, '_')] || fallback;
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} did not return JSON: ${error.message}`);
  }
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  return { response, text };
}

async function expectOk(url, label, options = {}) {
  const { response, text } = await fetchText(url, options);
  if (!response.ok) {
    throw new Error(`${label} failed with ${response.status}: ${text.slice(0, 300)}`);
  }
  return { response, text };
}

async function main() {
  const baseUrl = getArg('base-url', 'https://cast.e3d.ai').replace(/\/+$/, '');
  const creditKey = getArg('credit-key', '');
  const transcriptText = getArg(
    'transcript-text',
    'Cast deployment smoke test transcript. This is a dry-run paid submission path check.'
  );

  console.log(`Smoke target: ${baseUrl}`);

  const home = await expectOk(`${baseUrl}/`, 'UI home');
  if (!/<div class="page-shell">/.test(home.text) || !/id="get-e3d-link"/.test(home.text)) {
    throw new Error('UI home did not include the expected workspace shell or Get E3D link');
  }
  console.log('PASS ui-home');

  const uiConfig = await expectOk(`${baseUrl}/ui-api/config`, 'UI config');
  const config = parseJson(uiConfig.text, 'UI config');
  if (config.getE3dUrl !== requiredGetE3dUrl) {
    throw new Error(`Unexpected Get E3D URL: ${config.getE3dUrl || '<missing>'}`);
  }
  console.log('PASS ui-config');

  const healthResult = await expectOk(`${baseUrl}/api/cast/health`, 'Cast health');
  const health = parseJson(healthResult.text, 'Cast health');
  if (health.status !== 'healthy') {
    throw new Error(`Health endpoint returned unexpected status: ${health.status || '<missing>'}`);
  }
  console.log('PASS cast-health');

  const capabilitiesResult = await expectOk(`${baseUrl}/api/cast/capabilities`, 'Cast capabilities');
  const capabilities = parseJson(capabilitiesResult.text, 'Cast capabilities');
  if (!Array.isArray(capabilities.tiers) || capabilities.tiers.length === 0) {
    throw new Error('Capabilities response did not include any tiers');
  }
  console.log('PASS capabilities');

  const openApiResult = await expectOk(`${baseUrl}/openapi/e3d-cast.yaml`, 'OpenAPI document');
  if (!/openapi:\s*3\./.test(openApiResult.text)) {
    throw new Error('OpenAPI document did not look like an OpenAPI 3 spec');
  }
  console.log('PASS openapi');

  const llmsResult = await expectOk(`${baseUrl}/llms.txt`, 'llms.txt');
  if (!/cast/i.test(llmsResult.text)) {
    throw new Error('llms.txt did not mention Cast');
  }
  console.log('PASS llms-txt');

  const agentCapsResult = await expectOk(
    `${baseUrl}/.well-known/agent-capabilities.json`,
    'agent capabilities'
  );
  const agentCapabilities = parseJson(agentCapsResult.text, 'agent capabilities');
  if (agentCapabilities.openapiUrl !== `${baseUrl}/openapi/e3d-cast.yaml`) {
    throw new Error(`Unexpected OpenAPI URL in agent capabilities: ${agentCapabilities.openapiUrl || '<missing>'}`);
  }
  console.log('PASS agent-capabilities');

  if (!creditKey) {
    console.log('SKIP paid-dry-run (set CREDIT_KEY or --credit-key to enable)');
    return;
  }

  const submitResult = await expectOk(`${baseUrl}/api/cast/jobs`, 'Paid dry-run submit', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${creditKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      input: {
        kind: 'transcript',
        text: transcriptText,
      },
      outputPreset: 'transcript_short',
      options: {
        dryRun: true,
        subtitleStyle: 'bold_mobile',
        brandEndCard: true,
        madeWithCast: true,
        archiveToIpfs: false,
        title: 'Deployment smoke dry-run',
        description: 'Production deployment smoke validation.',
        tags: ['smoke', 'deployment'],
      },
    }),
  });
  const submitPayload = parseJson(submitResult.text, 'Paid dry-run submit');
  if (!submitPayload.jobId) {
    throw new Error('Paid dry-run submit did not return a jobId');
  }
  console.log(`PASS paid-dry-run ${submitPayload.jobId}`);
}

main().catch((error) => {
  console.error(`FAIL ${error.message}`);
  process.exitCode = 1;
});
