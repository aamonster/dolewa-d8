"use strict";
const editor=document.getElementById("editor");
const dithering=document.getElementById("dithering");
const darkness=document.getElementById("darkness");
const darknessValue=document.getElementById("darknessValue");
const contrast=document.getElementById("contrast");
const contrastValue=document.getElementById("contrastValue");
const density=document.getElementById("density");
const densityValue=document.getElementById("densityValue");
const renderTarget=document.getElementById("renderTarget");
const previewCanvas=document.getElementById("previewCanvas");
const info=document.getElementById("info");
const status=document.getElementById("status");
const renderBtn=document.getElementById("renderBtn");
const connectBtn=document.getElementById("connectBtn");
const printBtn=document.getElementById("printBtn");
const clearBtn=document.getElementById("clearBtn");
const PRINT_WIDTH=384;
const BLOCK_SIZE=96;
let textRenderTimer=null;
let renderGeneration=0;
function setStatus(message) {
  status.textContent=message;
  console.log(message);
}
function encodeBase64UTF8(str) {
  const bytes=new TextEncoder().encode(str);
  let binary="";
  for (const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary);
}
function decodeBase64UTF8(base64) {
  const binary=atob(base64);
  const bytes=new Uint8Array(binary.length);
  for (let i=0;
  i<binary.length;
  i++)bytes[i]=binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
function updateHtmlHash() {
  const encoded=encodeBase64UTF8(editor.value);
  const params=new URLSearchParams();
  params.set("html",encoded);
  if (dithering.checked)params.set("dithering","1");
  params.set("darkness",darkness.value);
  params.set("contrast",contrast.value);
  params.set("density",density.value);
  history.replaceState(null,"","#"+params.toString());
}
function loadHtmlFromHash() {
  const hash=location.hash;
  if (!hash.startsWith("#html="))return false;
  try {
    const params=new URLSearchParams(hash.substring(1));
    const encoded=params.get("html");
    if (encoded!==null)editor.value=decodeBase64UTF8(encoded);
    dithering.checked=params.get("dithering")==="1";
    const savedDarkness=params.get("darkness");
    if (savedDarkness!==null) {
      const value=Number(savedDarkness);
      if (Number.isFinite(value)&&value>=0&&value<=255)darkness.value=Math.round(value);
    }
    const savedContrast=params.get("contrast");
    if (savedContrast!==null) {
      const value=Number(savedContrast);
      if (Number.isFinite(value)&&value>=0&&value<=255)contrast.value=Math.round(value);
    }
    const savedDensity=params.get("density");
    if (savedDensity!==null) {
      const value=Number(savedDensity);
      if (Number.isFinite(value)&&value>=0&&value<=7)density.value=Math.round(value);
    }
    updateDarknessLabel();
    updateContrastLabel();
    updateDensityLabel();
    updateContrastState();
    return true;
  }
  catch (e) {
    console.error(e);
    setStatus("Ошибка чтения параметров из URL: "+e);
    return false;
  }
}
function updateDarknessLabel() {
  darknessValue.textContent=darkness.value;
}
function updateContrastLabel() {
  contrastValue.textContent=contrast.value;
}
function updateDensityLabel() {
  densityValue.textContent=density.value;
}
function updateContrastState() {
  contrast.disabled=!dithering.checked;
}
async function renderDOM() {
  renderTarget.innerHTML=editor.value;
  const images=[...renderTarget.querySelectorAll("img")];
  await Promise.all(images.map(img=> {
    if (img.complete)return Promise.resolve();
    return new Promise(resolve=> {
      img.onload=resolve;
      img.onerror=resolve;
    });
  }));
  await new Promise(resolve=>requestAnimationFrame(resolve));
  return renderTarget;
}
async function renderPreview() {
  const generation=++renderGeneration;
  try {
    setStatus("Rendering...");
    updateHtmlHash();
    await renderDOM();
    if (generation!==renderGeneration)return null;
    const canvas=await html2canvas(renderTarget, {
      backgroundColor:"#ffffff",width:PRINT_WIDTH,scale:1,useCORS:true,allowTaint:false,logging:false
    });
    if (generation!==renderGeneration)return null;
    const raster=rasterize(canvas);
    showPreview(raster);
    setStatus("Rendered: "+raster.width+" × "+raster.height+" px");
    return raster;
  }
  catch (e) {
    console.error(e);
    setStatus("Render error: "+e);
    throw e;
  }
}
function scheduleTextRender() {
  updateHtmlHash();
  if (textRenderTimer!==null)clearTimeout(textRenderTimer);
  textRenderTimer=setTimeout(async()=> {
    textRenderTimer=null;
    try {
      await renderPreview();
    }
    catch (e) {
      console.error(e);
    }
  },300);
}
const DITHER_4x4=[[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];
function rasterize(canvas) {
  const width=PRINT_WIDTH;
  const height=canvas.height;
  const ctx=canvas.getContext("2d", {
    willReadFrequently:true
  });
  const actualWidth=Math.min(width,canvas.width);
  const imageData=ctx.getImageData(0,0,actualWidth,height);
  const bytesPerRow=Math.ceil(actualWidth/8);
  const data=new Uint8Array(bytesPerRow*height);
  const baseThreshold=Number(darkness.value);
  const useDithering=dithering.checked;
  const contrastAmount=Number(contrast.value)/255;
  for (let y=0;
  y<height;
  y++) {
    for (let x=0;
    x<actualWidth;
    x++) {
      const p=(y*actualWidth+x)*4;
      const r=imageData.data[p],g=imageData.data[p+1],b=imageData.data[p+2],a=imageData.data[p+3];
      let gray;
      if (a===0)gray=255;
      else gray=0.299*r+0.587*g+0.114*b;
      let threshold=baseThreshold;
      if (useDithering) {
        const dither=(DITHER_4x4[y&3][x&3]-7.5)*8;
        threshold+=dither;
        if (contrastAmount>=1) {
          gray=gray<128?0:255;
        }
        else if (contrastAmount>0) {
          const factor=1/(1-contrastAmount);
          gray=128+(gray-128)*factor;
          gray=Math.max(0,Math.min(255,gray));
        }
      }
      if (gray<threshold) {
        const byteIndex=y*bytesPerRow+(x>>3);
        const bit=7-(x&7);
        data[byteIndex]|=(1<<bit);
      }
    }
  }
  return  {
    width:actualWidth,height,bytesPerRow,data
  };
}
function showPreview(raster) {
  previewCanvas.width=raster.width;
  previewCanvas.height=raster.height;
  previewCanvas.style.width=raster.width+"px";
  previewCanvas.style.height=raster.height+"px";
  const ctx=previewCanvas.getContext("2d");
  ctx.fillStyle="#fff";
  ctx.fillRect(0,0,raster.width,raster.height);
  const imageData=ctx.createImageData(raster.width,raster.height);
  for (let y=0;
  y<raster.height;
  y++) {
    for (let x=0;
    x<raster.width;
    x++) {
      const byteIndex=y*raster.bytesPerRow+(x>>3);
      const bit=7-(x&7);
      const black=(raster.data[byteIndex]&(1<<bit))!==0;
      const p=(y*raster.width+x)*4;
      const value=black?0:255;
      imageData.data[p]=value;
      imageData.data[p+1]=value;
      imageData.data[p+2]=value;
      imageData.data[p+3]=255;
    }
  }
  ctx.putImageData(imageData,0,0);
  info.textContent=raster.width+" × "+raster.height+" px, "+(raster.width/8).toFixed(1)+" × "+(raster.height/8).toFixed(1)+" mm, "+raster.data.length+" bytes";
}
const SERVICE_UUID="0000ffe6-0000-1000-8000-00805f9b34fb";
const WRITE_UUID="0000ffe1-0000-1000-8000-00805f9b34fb";
const NOTIFY_UUID="0000ffe2-0000-1000-8000-00805f9b34fb";
let bluetoothDevice=null;
let writeCharacteristic=null;
let notifyCharacteristic=null;
let rxQueue=[];
let rxWaiters=[];
function bytesToHex(bytes) {
  return[...bytes].map(x=>x.toString(16).padStart(2,"0")).join(" ");
}
function arraysEqual(a,b) {
  if (a.length!==b.length)return false;
  for (let i=0;
  i<a.length;
  i++)if (a[i]!==b[i])return false;
  return true;
}
function onNotification(event) {
  const bytes=new Uint8Array(event.target.value.buffer);
  console.log("RX:",bytesToHex(bytes));
  if (bytes[0]===0x5a&&bytes[1]===0x02)return;
  if (bytes[0]===0x5a&&(bytes[1]===0x05||bytes[1]===0x07))return;
  const waiter=rxWaiters.shift();
  if (waiter)waiter(bytes);
  else rxQueue.push(bytes);
}
function waitForPacket(timeout=5000) {
  return new Promise((resolve,reject)=> {
    if (rxQueue.length) {
      resolve(rxQueue.shift());
      return;
    }
    let handler;
    const timer=setTimeout(()=> {
      const index=rxWaiters.indexOf(handler);
      if (index>=0)rxWaiters.splice(index,1);
      reject(new Error("BLE packet timeout"));
    },timeout);
    handler=packet=> {
      clearTimeout(timer);
      resolve(packet);
    };
    rxWaiters.push(handler);
  });
}
async function writeBytes(bytes) {
  console.log("TX:",bytesToHex(bytes));
  await writeCharacteristic.writeValue(new Uint8Array(bytes));
}
function crc16Xmodem(data) {
  let crc=0x0000;
  for (const byte of data) {
    crc^=byte<<8;
    for (let i=0;
    i<8;
    i++) {
      if (crc&0x8000)crc=((crc<<1)^0x1021)&0xffff;
      else crc=(crc<<1)&0xffff;
    }
  }
  return crc;
}
async function connectPrinter() {
  if (!navigator.bluetooth)throw new Error("Web Bluetooth is not supported by this browser");
  setStatus("Scanning for LX-D08...");
  bluetoothDevice=await navigator.bluetooth.requestDevice( {
    filters:[ {
      name:"LX-D08"
    }],optionalServices:[SERVICE_UUID]
  });
  bluetoothDevice.addEventListener("gattserverdisconnected",()=> {
    setStatus("Printer disconnected");
  });
  setStatus("Connecting to "+(bluetoothDevice.name||"printer")+"...");
  const server=await bluetoothDevice.gatt.connect();
  const service=await server.getPrimaryService(SERVICE_UUID);
  writeCharacteristic=await service.getCharacteristic(WRITE_UUID);
  notifyCharacteristic=await service.getCharacteristic(NOTIFY_UUID);
  rxQueue=[];
  rxWaiters=[];
  notifyCharacteristic.addEventListener("characteristicvaluechanged",onNotification);
  await notifyCharacteristic.startNotifications();
  setStatus("Connected. Handshaking...");
  await handshake();
  setStatus("Printer ready");
}
async function handshake() {
  await writeBytes([0x5a,0x01,0x00]);
  const statusPacket=await waitForPacket(5000);
  if (statusPacket[0]!==0x5a||statusPacket[1]!==0x01)throw new Error("Unexpected status response: "+bytesToHex(statusPacket));
  const mac=statusPacket.slice(4,10);
  console.log("MAC:",bytesToHex(mac));
  const random=new Uint8Array(10);
  for (let i=0;
  i<random.length;
  i++) {
    let value;
    do {
      value=Math.floor(Math.random()*254)+1;
    }
    while (value===0x00||value===0xff);
    random[i]=value;
  }
  await writeBytes([0x5a,0x0a,...random]);
  const lowResponse=await waitForPacket(5000);
  if (lowResponse[0]!==0x5a||lowResponse[1]!==0x0a)throw new Error("Unexpected 0A response: "+bytesToHex(lowResponse));
  const low=[],high=[];
  for (const value of random) {
    const crc=crc16Xmodem([value,...mac]);
    low.push(crc&0xff);
    high.push((crc>>8)&0xff);
  }
  console.log("CRC low expected:",bytesToHex(low));
  console.log("CRC low received:",bytesToHex(lowResponse.slice(2)));
  await writeBytes([0x5a,0x0b,...high]);
  const finalResponse=await waitForPacket(5000);
  if (finalResponse[0]!==0x5a||finalResponse[1]!==0x0b||finalResponse[2]!==0x01)throw new Error("Handshake failed: "+bytesToHex(finalResponse));
  await writeBytes([0x5a,0x0c,0x03]);
  await waitForPacket(5000);
}
async function printRaster(raster) {
  if (!bluetoothDevice||!bluetoothDevice.gatt||!bluetoothDevice.gatt.connected)throw new Error("Printer is not connected");
  await writeBytes([0x5a,0x0c,Number(density.value)]);
  await new Promise(resolve=>setTimeout(resolve,300));
  const totalBytes=raster.data.length;
  const totalBlocks=Math.ceil(totalBytes/BLOCK_SIZE);
  setStatus("Sending "+totalBlocks+" blocks...");
  await writeBytes([0x5a,0x04,(totalBlocks>>8)&0xff,totalBlocks&0xff,0x00,0x00]);
  for (let index=0;
  index<totalBlocks;
  index++) {
    const packet=new Uint8Array(100);
    packet[0]=0x55;
    packet[1]=(index>>8)&0xff;
    packet[2]=index&0xff;
    const start=index*BLOCK_SIZE;
    const end=Math.min(start+BLOCK_SIZE,totalBytes);
    packet.set(raster.data.slice(start,end),3);
    await new Promise(resolve=>setTimeout(resolve,20));
    await writeBytes(packet);
    setStatus("Sending block "+(index+1)+" / "+totalBlocks);
  }
  setStatus("Waiting for image ACK...");
  while (true) {
    const packet=await waitForPacket(10000);
    if (packet[0]===0x5a&&packet[1]===0x06)break;
    console.log("Ignoring packet while waiting for 5A 06:",bytesToHex(packet));
  }
  await writeBytes([0x5a,0x04,(totalBlocks>>8)&0xff,totalBlocks&0xff,0x01]);
  setStatus("Print sent");
}
connectBtn.addEventListener("click",async()=> {
  try {
    await connectPrinter();
  }
  catch (e) {
    console.error(e);
    setStatus("Connection error: "+e.message);
  }
});
printBtn.addEventListener("click",async()=> {
  try {
    setStatus("Rendering for print...");
    await renderDOM();
    const canvas=await html2canvas(renderTarget, {
      backgroundColor:"#ffffff",width:PRINT_WIDTH,scale:1,useCORS:true,allowTaint:false,logging:false
    });
    const raster=rasterize(canvas);
    showPreview(raster);
    await printRaster(raster);
  }
  catch (e) {
    console.error(e);
    setStatus("Print error: "+e.message);
  }
});
clearBtn.addEventListener("click",async()=> {
  editor.value="";
  await renderPreview();
});
editor.addEventListener("input",scheduleTextRender);
dithering.addEventListener("change",async()=> {
  updateContrastState();
  await renderPreview();
});
darkness.addEventListener("input",async()=> {
  updateDarknessLabel();
  await renderPreview();
});
contrast.addEventListener("input",async()=> {
  updateContrastLabel();
  await renderPreview();
});
density.addEventListener("input",()=> {
  updateDensityLabel();
  updateHtmlHash();
});
(async function init() {
  updateDarknessLabel();
  updateContrastLabel();
  updateDensityLabel();
  const loaded=loadHtmlFromHash();
  updateDarknessLabel();
  updateContrastLabel();
  updateContrastState();
  if (loaded)await renderPreview();
})();
