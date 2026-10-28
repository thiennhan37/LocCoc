import fs from 'node:fs/promises';
import { FileBlob, PresentationFile } from '@oai/artifact-tool';
const src='D:/PTPM_HDV/LocCoc/.codex-output/Edge_Feature_Phat_Hien_Loi_Ngoai_Quan_draft.pptx';
const out='D:/PTPM_HDV/LocCoc/.codex-output/rendered';
await fs.mkdir(out,{recursive:true});
const pres=await PresentationFile.importPptx(await FileBlob.load(src));
for (const [i,slide] of pres.slides.items.entries()) {
  const png=await pres.export({slide,format:'png',scale:1});
  await fs.writeFile(`${out}/slide-${String(i+1).padStart(2,'0')}.png`,new Uint8Array(await png.arrayBuffer()));
}
const montage=await pres.export({format:'webp',montage:true});
await fs.writeFile(`${out}/montage.webp`,new Uint8Array(await montage.arrayBuffer()));
console.log(out);
