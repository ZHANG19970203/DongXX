import * as T from 'three';

export async function loadFootAtlas(signal){
  const assets=new URL('./assets/',import.meta.url);
  async function read(name,format){
    const response=await fetch(new URL(name,assets),{signal});
    if(!response.ok)throw Error('足骨模型未能载入');
    return response[format]();
  }
  const [metadata,buffer]=await Promise.all([read('ankle-study.json','json'),read('ankle-study.bin','arrayBuffer')]);
  signal.throwIfAborted();
  return {parts:metadata.parts,buffer};
}

export function atlasGeometry(part,buffer){
  const size=part.v*3,geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(buffer,part.offset,size),3));
  geometry.setAttribute('normal',new T.BufferAttribute(new Float32Array(buffer,part.offset+size*4,size),3));
  geometry.setIndex(new T.BufferAttribute(new Uint32Array(buffer,part.offset+size*8,part.i),1));
  return geometry;
}