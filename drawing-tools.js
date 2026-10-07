(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const activeShape = () => { const o = canvas.getActiveObject(); return o?.role === 'drawingShape' ? o : null; };
  function commit() { canvas.requestRenderAll(); saveCurrentSide(); }
  function add(kind) {
    const base = {left:W/2,top:H/2,originX:'center',originY:'center',role:'drawingShape',stroke:'#cba64a',strokeWidth:3,strokeUniform:true,fill:'transparent'};
    const o = kind==='line' ? new fabric.Line([-150,0,150,0],base)
      : kind==='circle' ? new fabric.Circle({...base,radius:70})
      : new fabric.Rect({...base,width:220,height:kind==='frame'?300:120,rx:kind==='frame'?20:0,ry:kind==='frame'?20:0});
    canvas.add(o).setActiveObject(o); sync(); commit();
  }
  function sync() {
    const o=activeShape(); const panel=el('drawingProperties'); panel.hidden=!o;
    if(!o) return;
    el('shapeStroke').value=toHex(o.stroke||'#cba64a');
    el('shapeStrokeWidth').value=o.strokeWidth||0;
    el('shapeNoFill').checked=!o.fill||o.fill==='transparent';
    el('shapeFill').value=toHex(o.fill==='transparent'?'#ffffff':o.fill);
    el('shapeFill').disabled=o.type==='line'||el('shapeNoFill').checked;
    el('shapeNoFill').disabled=o.type==='line';
    el('shapeRadius').disabled=o.type!=='rect'; el('shapeRadius').value=o.rx||0;
    el('shapeAngle').value=o.angle||0;
  }
  function update() {
    const o=activeShape(); if(!o) return;
    o.set({stroke:el('shapeStroke').value,strokeWidth:Math.max(0,Math.min(50,Number(el('shapeStrokeWidth').value)||0)),
      fill:o.type==='line'||el('shapeNoFill').checked?'transparent':el('shapeFill').value,
      angle:Math.max(-180,Math.min(180,Number(el('shapeAngle').value)||0))});
    if(o.type==='rect') { const r=Math.max(0,Math.min(100,Number(el('shapeRadius').value)||0)); o.set({rx:r,ry:r}); }
    o.setCoords(); sync(); commit();
  }
  ['line','rect','frame','circle'].forEach(kind=>el('draw-'+kind).onclick=()=>add(kind));
  ['shapeStroke','shapeStrokeWidth','shapeFill','shapeNoFill','shapeRadius','shapeAngle'].forEach(id=>el(id).addEventListener('input',update));
  el('shapeForward').onclick=()=>{const o=activeShape();if(o){canvas.bringForward(o);commit();}};
  el('shapeBackward').onclick=()=>{const o=activeShape();if(o){canvas.sendBackwards(o);commit();}};
  canvas.on('selection:created',sync); canvas.on('selection:updated',sync);canvas.on('selection:cleared',sync);
  canvas.on('object:modified',()=>{sync();if(activeShape())commit();});
})();
