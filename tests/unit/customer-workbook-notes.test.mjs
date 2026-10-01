import assert from "node:assert/strict";
import test from "node:test";

const { remapCustomerWorkbookNotes, remapCustomerWorkbookNoteShapes } =
  await import("../../src/features/reports/customer-workbook-notes.ts");

test("remaps comment references and drops comments for omitted rows", () => {
  const comments =
    '<comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><commentList><comment ref="P6027" authorId="0"><text><t>keep</t></text></comment><comment ref="O6091" authorId="1"><text><t>drop</t></text></comment><comment ref="A1" authorId="2"><text><t>keep</t></text></comment></commentList></comments>';

  const remapped = remapCustomerWorkbookNotes(
    comments,
    new Map([
      [6027, 12],
      [1, 3],
    ]),
  );

  assert.match(remapped, /ref="P12"/);
  assert.match(remapped, /ref="A3"/);
  assert.doesNotMatch(remapped, /ref="O6091"|>drop</);
  assert.match(remapped, /authorId="0"/);
});

test("moves note row and anchor coordinates while preserving other VML shapes", () => {
  const vml = `<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:x="urn:schemas-microsoft-com:office:excel"><v:shape id="note" style="position:absolute"><x:ClientData ObjectType="Note"><x:Anchor>16, 6, 6025, 12, 18, 6, 6029, 2</x:Anchor><x:Row>6026</x:Row><x:Column>15</x:Column></x:ClientData></v:shape><v:shape id="button" style="position:absolute"><x:ClientData ObjectType="Button"><x:Row>6026</x:Row></x:ClientData></v:shape><v:shape id="orphan"><x:ClientData ObjectType="Note"><x:Anchor>1, 2, 8, 4, 3, 5, 9, 6</x:Anchor><x:Row>9</x:Row></x:ClientData></v:shape></xml>`;

  const remapped = remapCustomerWorkbookNoteShapes(
    vml,
    new Map([
      [6027, 11],
      [1, 2],
    ]),
  );

  assert.match(remapped, /id="note"/);
  assert.match(remapped, /<x:Row>10<\/x:Row>/);
  assert.match(remapped, /<x:Anchor>16, 6, 9, 12, 18, 6, 13, 2<\/x:Anchor>/);
  assert.match(
    remapped,
    /id="button"[\s\S]*ObjectType="Button"[\s\S]*<x:Row>6026<\/x:Row>/,
  );
  assert.doesNotMatch(remapped, /id="orphan"/);
});

test("keeps note anchor formatting and handles namespaced VML tags", () => {
  const vml = `<v:shape id="note"><x:ClientData ObjectType="Note"><x:Anchor> 1, 2, 10, 4, 3, 5, 20, 6 </x:Anchor><x:Row>11</x:Row></x:ClientData></v:shape>`;
  const remapped = remapCustomerWorkbookNoteShapes(vml, new Map([[12, 15]]));

  assert.match(remapped, /<x:Row>14<\/x:Row>/);
  assert.match(remapped, /<x:Anchor> 1, 2, 13, 4, 3, 5, 23, 6 <\/x:Anchor>/);
});
