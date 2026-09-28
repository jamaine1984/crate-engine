import qrcode from 'qrcode-generator';

/** Returns an SVG QR code for text as a single path. Dark modules on white with the standard 4-module quiet zone, so phone scanners read it on the dark site theme. */
export function qrSvg(text,{size=220,label='QR code'}={}){
 const qr=qrcode(0,'M');qr.addData(text);qr.make();
 const count=qr.getModuleCount(),quiet=4,total=count+quiet*2;let path='';
 for(let row=0;row<count;row++)for(let col=0;col<count;col++)if(qr.isDark(row,col))path+=`M${col+quiet} ${row+quiet}h1v1h-1z`;
 const title=String(label).replace(/[<>&"]/g,'');
 return `<svg class="qr-code" role="img" aria-label="${title}" width="${size}" height="${size}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><rect width="${total}" height="${total}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

/** Groups a base32 setup key into blocks of four so it is easier to type by hand. */
export const groupKey=key=>String(key).replace(/(.{4})(?=.)/g,'$1 ');
