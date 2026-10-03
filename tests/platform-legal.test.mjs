import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {LEGAL_PATHS, LEGAL_VERSION, legalDocuments, legalPage} from '../platform/client/legal.mjs';

test('legal center exposes all nine policies with explicit draft status and contact',()=>{
 const html=legalPage('/legal').html;
 assert.equal(Object.keys(legalDocuments).length,9);
 assert.match(html,/Prelaunch drafts/);
 assert.match(html,/mailto:crateshipstudios@gmail.com/);
 assert.match(html,/Jamaine Martin, Washington, United States/);
 for(const path of Object.keys(legalDocuments))assert.ok(html.includes(`href="${path}"`));
});

test('every legal document has unique in-page sections and versioned draft disclosure',()=>{
 for(const [path,doc] of Object.entries(legalDocuments)) {
  const html=legalPage(path).html;
  assert.match(html,/Prelaunch drafts/);
  assert.ok(html.includes(LEGAL_VERSION));
  assert.ok(doc.sections.length>=3);
  doc.sections.forEach((_,i)=>{
   assert.equal(html.split(`id="legal-section-${i+1}"`).length-1,1);
   assert.ok(html.includes(`href="${path}#legal-section-${i+1}"`));
  });
 }
 assert.equal(legalPage('/missing-policy'),null);
});

test('draft payouts distinguish sales fees from eligible ad income',()=>{
 assert.match(legalPage('/payout-policy').html,/70% to the creator/);
 assert.match(legalPage('/payout-policy').html,/80% creator/);
 assert.match(legalPage('/payout-policy').html,/platform’s share/);
 assert.match(legalPage('/payout-policy').html,/not enabled/);
});

test('all legal paths have production rewrites and local routing',async()=>{
 const redirects=await readFile(new URL('../_redirects',import.meta.url),'utf8');
 const local=await readFile(new URL('../platform/dev/server.mjs',import.meta.url),'utf8');
 for(const path of LEGAL_PATHS){
  assert.ok(redirects.split(/\r?\n/).includes(`${path} / 200`),path);
  assert.ok(local.includes(path.slice(1)),path);
 }
});

test('panel scroll style confines lower content and makes rails independently scrollable',async()=>{
 const css=await readFile(new URL('../platform/client/panel-scroll.css',import.meta.url),'utf8');
 assert.match(css,/max-height: calc\(100dvh - 112px\)/);
 assert.match(css,/overflow-y: auto/);
 assert.match(css,/\.full-width \{ grid-column: 2; grid-row: 2/);
 assert.match(css,/overscroll-behavior-y: contain/);
});
