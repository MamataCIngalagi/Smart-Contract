import assert from 'node:assert/strict';
function luminance(hex) {
  const values = hex.replace('#', '').match(/../g).map(part => parseInt(part,16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
  return values[0]*.2126 + values[1]*.7152 + values[2]*.0722;
}
for (const [label, foreground, background] of [
  ['body on ivory','#20352D','#F5F2E9'], ['body on paper','#20352D','#FCFAF4'],
  ['secondary on paper','#566158','#FCFAF4'], ['secondary on ivory','#566158','#F5F2E9'],
  ['white on pine','#FFFFFF','#173F35'], ['ready marker','#173F35','#D5EB68'],
  ['error on paper','#b30000','#FCFAF4'], ['locked marker','#173F35','#e8ebe3'],
  ['disabled label','#566158','#e5e6dc'],
]) {
  const a = luminance(foreground); const b = luminance(background);
  const ratio = (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  assert.ok(ratio >= 4.5, `${label}: ${ratio}`);
  console.log(`${label}: ${ratio.toFixed(2)}:1`);
}
