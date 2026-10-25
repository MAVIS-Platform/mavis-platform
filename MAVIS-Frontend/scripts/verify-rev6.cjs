const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const assert = require('assert/strict');

const root = path.resolve(__dirname, '..');
const { DOMParser } = require(path.join(root, 'tests/helpers/xml-dom-shim.cjs'));
globalThis.DOMParser = DOMParser;

require.extensions['.ts'] = (module, filename) => {
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  module._compile(js.replace(/require\(["']@\/([^"']+)["']\)/g, (_, n) => `require(${JSON.stringify(path.join(root, 'src', n))})`), filename);
};

const { extractDraftDocument, drawioSummary } = require(path.join(root, 'src/features/architecture/drawio-document.ts'));
const { projectDiagram } = require(path.join(root, 'src/lib/drawio/rules.ts'));
const { generateDrawio } = require(path.join(root, 'src/lib/drawio/server.ts'));

async function run() {
  const xmlRev6Path = path.resolve(__dirname, '../../output/m1/codex-roundtrip/test1-reloaded-rev6.drawio');
  const xmlRev6 = fs.readFileSync(xmlRev6Path, 'utf8');

  console.log('Testing extractDraftDocument on Revision 6...');
  const draft = extractDraftDocument(xmlRev6, '8b5a2dbc-329d-4e9a-8d01-b94ab4b1c241', 'container', 'C4', 'CONTAINER', 'container');

  assert.equal(draft.notation, 'C4');
  assert.equal(draft.level, 'CONTAINER');
  assert.equal(draft.omittedNodes, 64);
  assert.equal(draft.omittedEdges, 74);

  const doc = new DOMParser().parseFromString(xmlRev6, 'text/xml');
  const titleCell = Array.from(doc.querySelectorAll('mxCell')).find(c => c.getAttribute('id') === 'mavis_title');
  assert.ok(titleCell, 'Must have mavis_title cell');
  const storedQuality = JSON.parse(titleCell.getAttribute('mavisQuality') || '{}');
  console.log('Stored quality from mavis_title:', storedQuality);
  assert.equal(storedQuality.crossings, 0, 'crossings must be 0');
  assert.equal(storedQuality.nodeOverlaps, 0, 'nodeOverlaps must be 0');
  assert.equal(storedQuality.needsReview, false, 'needsReview must be false');

  const boundary = draft.layoutJson.nodes.find(n => n.id === 'system:boundary');
  assert.ok(boundary, 'Must find system:boundary');
  assert.equal(boundary.kind, 'SYSTEM_BOUNDARY');
  assert.equal(boundary.viewLocal, true);

  const members = draft.layoutJson.nodes.filter(n => n.parentId === 'system:boundary');
  assert.equal(members.length, 17, 'Must have exactly 17 member containers');

  const edges = draft.layoutJson.edges;
  assert.equal(edges.length, 12, 'Must have exactly 12 edges');

  console.log('PASS: Draft extracted with 1 boundary, 17 members, 12 edges!');

  const projected = projectDiagram(draft);
  console.log('Projected diagram:', projected.layoutJson.nodes.length, 'nodes,', projected.layoutJson.edges.length, 'edges');

  const reXml = await generateDrawio(projected);
  const doc2 = new DOMParser().parseFromString(reXml, 'text/xml');
  const boundaryCell = Array.from(doc2.querySelectorAll('mxCell')).find(c => c.getAttribute('mavisId') === 'system:boundary');
  assert.ok(boundaryCell);
  assert.equal(boundaryCell.getAttribute('mavisRole'), 'boundary');
  const reMembers = Array.from(doc2.querySelectorAll('mxCell')).filter(c => c.getAttribute('parent') === boundaryCell.getAttribute('id'));
  assert.equal(reMembers.length, 17);
  console.log('PASS: Re-generation maintains 1 System Boundary and 17 members!');

  const outputPath = path.resolve(__dirname, '../../output/m1/codex-roundtrip/test1-rev6-verification.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    pass: true,
    revision: 6,
    xmlBytes: Buffer.byteLength(xmlRev6, 'utf8'),
    systemBoundary: boundary.id,
    membersCount: members.length,
    edgesCount: edges.length,
    quality: storedQuality,
    omittedNodes: draft.omittedNodes,
    omittedEdges: draft.omittedEdges,
    members: members.map(m => ({ id: m.id, name: m.name, kind: m.kind }))
  }, null, 2));

  console.log('Written verification report to:', outputPath);
}

run().catch(e => {
  console.error('FAILED:', e);
  process.exit(1);
});
