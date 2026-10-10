const graphemes=new Intl.Segmenter("zh",{granularity:"grapheme"});
export const visibleCharacters=(text:string)=>Array.from(graphemes.segment(text.trim()),part=>part.segment);
export const shortEnough=(text:string)=>visibleCharacters(text).length<=30;
// Shared compact layout for spoken lines and thoughts (14px body, 12px heading).
export function bubbleSize(text:string,label:string){
  const lines=bubbleText(text).split('\n');
  const width=(s:string,size:number)=>visibleCharacters(s).reduce((n,c)=>n+(/^[\x00-\x7f]$/.test(c)?size*.6:size),0);
  const boxWidth=Math.min(244,Math.max(132,width(label,12)+46,...lines.map(s=>width(s,14)+20)));
  const rows=lines.reduce((n,line)=>n+Math.max(1,Math.ceil(width(line,14)/(boxWidth-20))),0);
  return {width:boxWidth,height:56+(rows-1)*20};
}
// Preview only; persisted originals remain in history. Prefer a sentence boundary.
export function bubbleText(text:string):string {
  const chars=visibleCharacters(text);
  if(chars.length>30){const head=chars.slice(0,29).join("");const punctuation=Math.max(head.lastIndexOf("。"),head.lastIndexOf("！"),head.lastIndexOf("？"));return (punctuation>=12?head.slice(0,punctuation+1):head)+"…";}
  if(chars.length<=16)return chars.join("");
  let split=Math.ceil(chars.length/2);
  for(let i=9;i<Math.min(16,chars.length-4);i++)if(/[，。！？；、]/u.test(chars[i])){split=i+1;break;}
  return chars.slice(0,split).join("")+"\n"+chars.slice(split).join("");
}
