// Generates docs/light-kanban-验收清单.xlsx from docs/manual-test-checklist.md
// (the markdown stays the single source of truth). The 结果 column gets an
// Excel data-validation dropdown: ✅ 通过 / ❌ 失败 / ⚠ 存疑.
// Pure Node, no dependencies — writes the OOXML package by hand.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const MD = path.join(ROOT, 'docs', 'manual-test-checklist.md');
const XLSX = path.join(ROOT, 'docs', 'light-kanban-验收清单.xlsx');

// ---- parse the markdown tables into rows ----
const lines = fs.readFileSync(MD, 'utf8').split(/\r?\n/);
const rows = [];
let group = '';
for (const line of lines) {
  const m = line.match(/^## (.+)$/);
  if (m) { group = m[1]; continue; }
  if (!line.startsWith('|')) continue;
  const cells = line.split('|').map((c) => c.trim());
  cells.shift();
  cells.pop();
  if (cells.length < 5) continue;
  if (cells[0] === '#' || /^-+$/.test(cells[0])) continue;
  if (!/^[A-Z]\d+[a-z]?$/.test(cells[0])) continue;
  rows.push({ group, id: cells[0], what: cells[1], how: cells[2], expected: cells[3] });
}
if (rows.length === 0) {
  console.error('no rows parsed from ' + MD);
  process.exit(1);
}

// ---- OOXML helpers ----
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const HEADER = ['编号', '分组', '测什么', '怎么测', '预期结果', '结果', '评论（留给我）'];
const LAST = rows.length + 1;

function colLetter(i) { return String.fromCharCode(65 + i); }

function sheetXml() {
  const parts = [];
  parts.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  parts.push('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">');
  parts.push(`<dimension ref="A1:G${LAST}"/>`);
  parts.push('<cols>' + HEADER.map((_, i) => {
    const widths = [8, 16, 42, 46, 46, 10, 28];
    return `<col min="${i + 1}" max="${i + 1}" width="${widths[i]}" customWidth="1"/>`;
  }).join('') + '</cols>');
  parts.push('<sheetData>');
  // header row
  const headCells = HEADER.map((h, i) =>
    `<c r="${colLetter(i)}1" t="inlineStr" s="1"><is><t>${esc(h)}</t></is></c>`).join('');
  parts.push(`<row r="1">${headCells}</row>`);
  // data rows
  rows.forEach((row, idx) => {
    const r = idx + 2;
    const values = [row.id, row.group, row.what, row.how, row.expected, '', ''];
    const cells = values.map((v, i) =>
      `<c r="${colLetter(i)}${r}" t="inlineStr" s="0"><is><t>${esc(v)}</t></is></c>`).join('');
    parts.push(`<row r="${r}">${cells}</row>`);
  });
  parts.push('</sheetData>');
  // dropdown on the 结果 column
  parts.push(`<dataValidations count="1"><dataValidation type="list" allowBlank="1" sqref="F2:F${LAST}">`);
  parts.push('<formula1>&quot;✅ 通过,❌ 失败,⚠ 存疑&quot;</formula1>');
  parts.push('</dataValidation></dataValidations>');
  parts.push('</worksheet>');
  return parts.join('');
}

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/></patternFill></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="2"><xf xfId="0"/><xf xfId="0" fontId="1" fillId="2" applyFont="1" applyFill="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="验收清单" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

// ---- minimal ZIP writer (store + central directory + EOCD) ----
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function makeZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const crc = crc32(f.data);
    const compressed = zlib.deflateRawSync(f.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, compressed);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt16LE(0, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(compressed.length, 20);
    cen.writeUInt32LE(f.data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30);
    cen.writeUInt16LE(0, 32);
    cen.writeUInt16LE(0, 34);
    cen.writeUInt16LE(0, 36);
    cen.writeUInt32LE(0, 38);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += local.length + nameBuf.length + compressed.length;
  }
  const cenBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cenBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, cenBuf, eocd]);
}

const files = [
  { name: '[Content_Types].xml', data: Buffer.from(contentTypesXml, 'utf8') },
  { name: '_rels/.rels', data: Buffer.from(relsXml, 'utf8') },
  { name: 'xl/workbook.xml', data: Buffer.from(workbookXml, 'utf8') },
  { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(workbookRelsXml, 'utf8') },
  { name: 'xl/styles.xml', data: Buffer.from(stylesXml, 'utf8') },
  { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheetXml(), 'utf8') },
];

fs.writeFileSync(XLSX, makeZip(files));
console.log(`wrote ${XLSX} (${rows.length} rows, columns A-G, dropdown on F)`);
