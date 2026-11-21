'use client';
// Small dependency-free Office Open XML (.xlsx) exporter. Writes a true ZIP archive
// with a single worksheet; no remote spreadsheet library or CDN required.
export type Cell = string | number | boolean | null | undefined;
const encoder=new TextEncoder();
function xml(v:unknown){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]||c)).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'')}
function column(idx:number){let s='';for(let i=idx+1;i;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s}
function sheet(headers:string[],rows:Cell[][]){const body=[headers,...rows].map((row,i)=>'<row r="'+(i+1)+'">'+row.map((value,j)=>{
 const r=column(j)+(i+1);const style=i===0?' s="1"':'';
 if(typeof value==='number'&&Number.isFinite(value))return `<c r="${r}"${style}><v>${value}</v></c>`;
 if(typeof value==='boolean')return `<c r="${r}" t="b"${style}><v>${value?1:0}</v></c>`;
 return `<c r="${r}" t="inlineStr"${style}><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
 }).join('')+'</row>').join('');
 return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="17"/><sheetData>${body}</sheetData></worksheet>`}
const crcTable=Array.from({length:256},(_,i)=>{let c=i;for(let n=0;n<8;n++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0});
function crc32(data:Uint8Array){let crc=0xffffffff;for(const b of data)crc=crcTable[(crc^b)&255]^(crc>>>8);return(crc^0xffffffff)>>>0}
const u16=(n:number)=>[n&255,(n>>>8)&255],u32=(n:number)=>[n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];
function zip(files:{name:string,content:string}[]):Blob{
 const parts:BlobPart[]=[];const central:number[][]=[];let position=0;
 files.forEach(file=>{
  const name=encoder.encode(file.name),body=encoder.encode(file.content),crc=crc32(body);
  const local=[...u32(0x04034b50),...u16(20),...u16(0x800),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(body.length),...u32(body.length),...u16(name.length),...u16(0),...name];
  parts.push(new Uint8Array(local).buffer,new Uint8Array(body).buffer);
  central.push([...u32(0x02014b50),...u16(20),...u16(20),...u16(0x800),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(body.length),...u32(body.length),...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(position),...name]);
  position+=local.length+body.length;
 });
 const entries=central.flat();const dirSize=entries.length;
 parts.push(new Uint8Array(entries).buffer,new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(files.length),...u16(files.length),...u32(dirSize),...u32(position),...u16(0)]).buffer);
 return new Blob(parts,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
export function exportXlsx(filename:string,headers:string[],rows:Cell[][]){
 const files=[
 {name:'[Content_Types].xml',content:'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'},
 {name:'_rels/.rels',content:'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
 {name:'xl/workbook.xml',content:'<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="StandEL" sheetId="1" r:id="rId1"/></sheets></workbook>'},
 {name:'xl/_rels/workbook.xml.rels',content:'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'},
 {name:'xl/styles.xml',content:'<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf xfId="0" fontId="0" fillId="0" borderId="0"/><xf xfId="0" fontId="1" fillId="0" borderId="0" applyFont="1"/></cellXfs></styleSheet>'},
 {name:'xl/worksheets/sheet1.xml',content:sheet(headers,rows)}];
 const url=URL.createObjectURL(zip(files));const a=document.createElement('a');a.href=url;a.download=filename.replace(/[^a-zA-Z0-9_\-]/g,'_')+'.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
