// ==UserScript==
// @name         Emoji.gg Upload Studio Worker
// @namespace    local.emoji.upload.queue
// @version      0.9.6
// @description  Connects Emoji.gg upload tabs to Emote Forge Upload Studio and submits prepared batches of ten.
// @license      MIT
// @homepageURL  https://emote-forge.itschase.workers.dev/
// @match        https://emoji.gg/submit*
// @match        https://emoji.gg/user/*
// @match        https://emote-forge.itschase.workers.dev/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_openInTab
// @grant        window.close
// @connect      127.0.0.1
// @updateURL    https://emote-forge.itschase.workers.dev/uploader.user.js
// @downloadURL  https://emote-forge.itschase.workers.dev/uploader.user.js
// @run-at       document-idle
// ==/UserScript==
(() => {
  'use strict';
  const base = 'http://127.0.0.1:43861';
  const productionStudioOrigin='https://emote-forge.itschase.workers.dev';
  function authorizedStudioOrigin(value){try{const url=new URL(value),origin=url.origin;return origin===productionStudioOrigin||(/^http:$/.test(url.protocol)&&['127.0.0.1','localhost'].includes(url.hostname))?origin:''}catch{return ''}}
  const validId=value=>/^[0-9a-f-]{36}$/i.test(String(value||''));
  if(location.hostname==='emote-forge.itschase.workers.dev'){
    document.documentElement.dataset.emoteForgeUserscriptVersion='0.9.6';
    const announce=()=>window.postMessage({type:'EMOTE_FORGE_BRIDGE_STATUS',source:'userscript',version:'0.9.6',active:true},location.origin);
    addEventListener('message',event=>{if(event.origin===location.origin&&event.data?.type==='EMOTE_FORGE_BRIDGE_PROBE')announce()});
    announce();return;
  }
  let token = GM_getValue('queueToken','');
  const initialParams=new URLSearchParams(location.search),probeSession=initialParams.get('browser_studio_probe')||'',probeOrigin=initialParams.get('browser_studio_origin')||'';
  if(probeSession&&probeOrigin){const trusted=authorizedStudioOrigin(probeOrigin);if(trusted&&validId(probeSession))window.opener?.postMessage({type:'EMOTE_FORGE_BRIDGE_STATUS',session:probeSession,version:'0.9.6',active:true},trusted);return;}
  if(location.pathname.startsWith('/user/')){
    const profileParams=new URLSearchParams(location.search),profileSession=profileParams.get('browser_studio_profile_session')||'',profileOrigin=profileParams.get('browser_studio_origin')||'';
    const trustedProfileOrigin=validId(profileSession)?authorizedStudioOrigin(profileOrigin):'';
    if(!token&&!trustedProfileOrigin)return;
    let timer=0,lastPayload='';
    const number=value=>Number(String(value||'').replace(/[^0-9]/g,''))||0;
    const report=()=>{clearTimeout(timer);timer=setTimeout(()=>{const username=decodeURIComponent(location.pathname.split('/').filter(Boolean).pop()||''),links=[...document.querySelectorAll('.nav-link')],counts={emojis:0,stickers:0,packs:0};for(const link of links){const text=link.textContent.toLowerCase(),count=number(link.querySelector('.badge')?.textContent);if(text.includes('emoji'))counts.emojis=count;if(text.includes('sticker'))counts.stickers=count;if(text.includes('pack'))counts.packs=count;}const stats=document.querySelector('.stats-rank')?.textContent||'',downloads=number(stats.match(/[\d,]+\s+Downloads/i)?.[0]),rank=(stats.match(/Ranked\s+#[\d,]+/i)||[])[0]||'',active=(links.find(link=>link.classList.contains('active'))?.textContent||'emojis').toLowerCase().replace(/[\d,]/g,'').trim(),payload={username,profileUrl:`${location.origin}${location.pathname}`,avatarUrl:document.querySelector('.profile-header img')?.src||'',rank,downloads,counts,observedAt:Date.now(),loaded:{kind:active,count:document.querySelectorAll('.asset-card').length,complete:!document.querySelector('a.btn-primary.btn-sm.w-50')&&!document.querySelector('[data-loading="true"]')}};const serialized=JSON.stringify(payload);if(serialized===lastPayload)return;lastPayload=serialized;if(trustedProfileOrigin)window.opener?.postMessage({type:'EMOTE_FORGE_PROFILE',session:profileSession,payload},trustedProfileOrigin);if(token)GM_xmlhttpRequest({method:'POST',url:`${base}/api/account-snapshot`,headers:{'X-Queue-Token':token,'Content-Type':'application/json'},data:serialized,timeout:10000});},700)};
    new MutationObserver(report).observe(document.body,{childList:true,subtree:true,characterData:true});report();return;
  }
  if(!['/submit','/submit/sticker'].includes(location.pathname))return;
  if(document.documentElement.dataset.emojiUploadStudioWorker)return;
  document.documentElement.dataset.emojiUploadStudioWorker='0.9.6';
  let installationId=GM_getValue('installationId','');if(!/^[0-9a-f-]{36}$/i.test(installationId)){installationId=crypto.randomUUID();GM_setValue('installationId',installationId);}
  const workerParams=new URLSearchParams(location.search);if(workerParams.has('upload_studio_worker')){sessionStorage.setItem('uploadStudioManaged','1');sessionStorage.setItem('uploadStudioClientId',workerParams.get('upload_studio_worker'));}const openedByStudio=sessionStorage.getItem('uploadStudioManaged')==='1';
  let clientId=workerParams.get('upload_studio_worker')||sessionStorage.getItem('uploadStudioClientId')||crypto.randomUUID();if(!/^[0-9a-f-]{36}$/i.test(clientId))clientId=crypto.randomUUID();if(openedByStudio)sessionStorage.setItem('uploadStudioClientId',clientId);
  const pageInstanceId=crypto.randomUUID();
  const journalKey=`workerJournal:${clientId}`;
  const workerUrl=pathname=>`${pathname}?upload_studio_worker=${encodeURIComponent(clientId)}`;
  let workerSession='';
  let workerStage='idle',progressAt=Date.now();
  function setStage(value){workerStage=value;progressAt=Date.now();say(value);}
  function readJournal(){const value=GM_getValue(journalKey,null);return value&&value.batchId?value:null;}
  function writeJournal(value){GM_setValue(journalKey,{...value,updatedAt:Date.now()});}
  function clearJournal(){GM_deleteValue(journalKey);}
  function closeWorkerTab(){window.close()}
  function observedAccount(){const profile=[...document.querySelectorAll('a[href*="/user/"]')].find(link=>/\/user\/[^/]+\/?$/.test(new URL(link.href,location.href).pathname));if(!profile)return null;const profileUrl=new URL(profile.href,location.href).href,username=decodeURIComponent(new URL(profileUrl).pathname.split('/').filter(Boolean).pop()||'').trim(),avatar=document.querySelector('img[src*="/avatars/"]');return username?{username,profileUrl,avatarUrl:avatar?.src||''}:null;}
  const badge = document.createElement('div');
  badge.style.cssText = 'position:fixed;z-index:2147483647;bottom:12px;left:12px;background:#111;color:#eee;border:1px solid #555;padding:7px 10px;border-radius:7px;font:12px system-ui;max-width:360px';
  const statusText=document.createElement('span');statusText.textContent='Local upload queue: checking';
  const studioLink=document.createElement('a');studioLink.textContent='Open Upload Studio ↗';studioLink.href=base;studioLink.target='_blank';studioLink.rel='noopener noreferrer';studioLink.style.cssText='display:inline-block;margin-left:9px;background:#333;color:#eee;border:1px solid #666;border-radius:5px;padding:3px 6px;text-decoration:none;white-space:nowrap';studioLink.title='Open the local Upload Studio dashboard in a new tab';
  const queueText=document.createElement('div');queueText.style.cssText='margin-top:5px;color:#bbb';
  const queueButton=document.createElement('button');queueButton.type='button';queueButton.style.cssText='display:none;margin-top:5px;background:#333;color:#eee;border:1px solid #666;border-radius:5px;padding:3px 6px;cursor:pointer';
  queueButton.addEventListener('click',async()=>{try{await request(queueButton.dataset.action,{});say(queueButton.dataset.action==='pause'?'pausing after this batch':'resuming queue');}catch(error){say(error.message);}});
  badge.append(statusText,studioLink,queueText,queueButton);document.body.append(badge);
  function say(message) { statusText.textContent = `Local upload queue: ${message}`; }
  function showQueue(status){queueText.textContent=`${status.activeWorkers}/${status.workers} tabs · ${status.done} submitted · ${status.queued} queued${status.leased?` · ${status.leased} processing`:''} · ${status.unresolved??status.failed} unresolved`;queueButton.dataset.action=status.paused?'resume':'pause';queueButton.textContent=status.paused?'Resume queue':'Pause after batch';queueButton.style.display=status.running||status.paused&&status.queued?'inline-block':'none';}
  function pair() { return new Promise((resolve,reject)=>GM_xmlhttpRequest({method:'GET',url:`${base}/api/pair`,responseType:'json',headers:{'X-Queue-Pair':'local-userscript'},timeout:10000,onload:r=>r.status===200&&r.response?.token?resolve(r.response.token):reject(new Error(r.status===404?'Older Upload Studio server active':'Waiting for local worker pairing')),onerror:()=>reject(new Error('Local studio unavailable')),ontimeout:()=>reject(new Error('Pairing timed out'))})); }
  function legacyWorker(){return [...document.querySelectorAll('div')].find(el=>el!==badge&&el.childNodes.length===1&&el.firstChild?.nodeType===Node.TEXT_NODE&&el.textContent?.startsWith('Local upload queue:'));}
  function request(route, data, responseType = 'json', timeout = 15000) {
    return new Promise((resolve, reject) => GM_xmlhttpRequest({
      method: data === undefined ? 'GET' : 'POST', url: `${base}/api/${route}`, responseType,
      headers: { 'X-Queue-Token': token, ...(workerSession ? {'X-Worker-Session':workerSession} : {}), ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) },
      data: data === undefined ? undefined : JSON.stringify(data), timeout,
      onload: r => r.status >= 200 && r.status < 300 ? resolve(r.response) : reject(new Error(`${route}: ${r.status} ${typeof r.response === 'string' ? r.response.slice(0,120) : ''}`)),
      onerror: () => reject(new Error(`${route}: local server unavailable`)), ontimeout: () => reject(new Error(`${route}: timed out`))
    }));
  }
  function wait(check, timeout = 30000) { return new Promise((resolve, reject) => { const end = Date.now() + timeout; const timer = setInterval(() => { const value = check(); if (value) { clearInterval(timer); resolve(value); } else if (Date.now() > end) { clearInterval(timer); reject(new Error('Site did not advance in time')); } }, 150); }); }
  function setValue(el, value) { const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }
  async function digest(blob) { const bytes = await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()); return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join(''); }
  async function visualDigest(blob) {
    const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
    const context=canvas.getContext('2d',{willReadFrequently:true});context.clearRect(0,0,64,64);context.drawImage(bitmap,0,0,64,64);bitmap.close?.();
    const bytes=context.getImageData(0,0,64,64).data;return digest(new Blob([bytes.buffer]));
  }
  function uniqueRetryTitle(item) {
    if(!/duplicate|already exists|already been submitted/i.test(item.note||''))return item.title;
    const identity=(item.filename.match(/^\d+/)||[])[0]||item.filename.replace(/\.[^.]+$/,'').replace(/[^a-z0-9]+/gi,' ').trim().split(/\s+/).slice(-2).join(' ');
    const suffix=identity?` ${identity}`:' Alternate';return `${item.title}${suffix}`.slice(0,100);
  }
  async function addTags(form, tags) {
    const input = form.querySelector('.tag-input'); if(!input) throw new Error('Tag field missing');
    const accepted=[];
    const candidates=[...new Set([...tags.split(';').map(x=>x.trim()).filter(Boolean),'emoji','cute','reaction','fun','discord'])];
    for(const tag of candidates) {
      if(accepted.length>=10)break;
      const before=form.querySelectorAll('.tag-container .tag').length;
      setValue(input,tag); input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}));
      input.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}));
      const after=form.querySelectorAll('.tag-container .tag').length;
      if(after>before)accepted.push(tag);
    }
    if(accepted.length<3)throw new Error(`Only ${accepted.length} accepted tags for ${form.querySelector('input[name="names[]"]')?.value||'item'}`);
    console.info('[Emoji queue] accepted tags:',accepted);
    return accepted;
  }
  async function upload(batch,suppliedFiles=[]) {
    setStage(`loading ${batch.items.length} files`);
    const files=[];const byHash=new Map(),byVisualHash=new Map();
    const remember=(map,key,item)=>map.set(key,[...(map.get(key)||[]),item]);
    for(let i=0;i<batch.items.length;i++) { const item=batch.items[i],blob=suppliedFiles[i]||await request(`file?batch=${encodeURIComponent(batch.id)}&index=${i}` ,undefined,'blob'); const file=blob instanceof File?blob:new File([blob],item.filename,{type:/\.gif$/i.test(item.filename)?'image/gif':'image/png'}); files.push(file);remember(byHash,await digest(file),item);try{remember(byVisualHash,await visualDigest(file),item)}catch(error){console.warn('[Emoji queue] visual fingerprint unavailable',item.filename,error)} }
    setStage('loading upload form');const input=await wait(()=>document.querySelector('#media-upload'));
    const transfer=new DataTransfer(); files.forEach(file=>transfer.items.add(file)); input.files=transfer.files; input.dispatchEvent(new Event('change',{bubbles:true}));
    setStage('waiting for previews');await wait(()=>document.querySelectorAll('.emojis-form').length===files.length && [...document.querySelectorAll('.emojis-form img[src^="blob:"]')].length===files.length,30000);
    const forms=[...document.querySelectorAll('.emojis-form')];
    const ordered=[],used=new Set();
    for(const form of forms){
      const src=form.querySelector('img[src^="blob:"]')?.src;if(!src)throw new Error('Missing preview image');const preview=await fetch(src).then(r=>r.blob());
      let candidates=(byHash.get(await digest(preview))||[]).filter(candidate=>!used.has(candidate)),item;
      if(candidates.length>1)throw new Error('Ambiguous exact preview match; metadata was not assigned');
      if(candidates.length===1)item=candidates[0];
      if(!item){try{candidates=(byVisualHash.get(await visualDigest(preview))||[]).filter(candidate=>!used.has(candidate));if(candidates.length>1)throw new Error('Ambiguous visual preview match; metadata was not assigned');if(candidates.length===1)item=candidates[0]}catch(error){if(/Ambiguous/.test(error.message))throw error;console.warn('[Emoji queue] preview fingerprint unavailable',error)}}
      if(!item)throw new Error('Preview could not be matched safely to a local image');used.add(item);ordered.push(item);
    }
    if(new Set(ordered).size!==files.length)throw new Error('Duplicate preview mapping');
    for(let i=0;i<forms.length;i++){
      const form=forms[i],item=ordered[i];
      setStage(`filling item ${i+1}/${forms.length}`);
      setValue(form.querySelector('input[name="names[]"]'),uniqueRetryTitle(item));
      form.querySelector('select[name="categories[]"]').value=item.category_value;form.querySelector('select[name="categories[]"]').dispatchEvent(new Event('change',{bubbles:true}));
      const license=form.querySelector('select[name="licenses[]"]'),normalized=String(item.license||'').toLowerCase().replace(/[^a-z0-9]+/g,' ' ).trim(),option=[...license.options].find(candidate=>candidate.textContent.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()===normalized);if(!option)throw new Error(`Unsupported license: ${item.license}`);license.value=option.value;license.dispatchEvent(new Event('change',{bubbles:true}));
      setValue(form.querySelector('textarea[name="descriptions[]"]'),item.description);
      const accepted=await addTags(form,item.tags||'');
      say(`item ${i+1}/${forms.length}: ${accepted.length} accepted tags`);
      if(i<forms.length-1){const next=[...form.querySelectorAll('button')].find(x=>x.textContent.trim()==='Next');if(!next)throw new Error(`Next button missing at item ${i+1}`);next.click();}
    }
    setStage('finishing metadata');const finish=document.querySelector('.finish-forms');if(!finish)throw new Error('Finish button missing');finish.click();
    await wait(()=>{const x=document.querySelector('#final-submit');return x&&x.offsetParent!==null&&x},15000);
    setStage('submitting batch');
    writeJournal({batchId:batch.id,itemCount:batch.items.length,phase:'submitting'});
    document.querySelector('#final-submit').click();
    batch.submittedToSite = true;
    setStage('waiting for submission results');
    await wait(()=>document.querySelectorAll('.list-group-item strong').length===files.length || document.querySelector('.upload-error:not([style*="display: none"])'),120000);
    const results=[...document.querySelectorAll('.list-group-item')].filter(e=>e.querySelector('strong'));
    if(results.length!==files.length)throw new Error(`Submission outcome uncertain: ${results.length}/${files.length} rows`);
    // Result order follows the site's displayed form order, which was mapped by preview hash.
    const resultByItem=new Map(results.map((el,i)=>{const note=el.innerText.slice(-300),duplicate=/duplicate|already exists|already been submitted/i.test(note),item=ordered[i];return [item.id,{assetId:item.id,status:el.querySelector('.badge.bg-success')?'submitted':duplicate?'uncertain':'retry',note:duplicate?`Emoji.gg reported a possible duplicate. Review before retrying. ${note}`:note}]}));
    const outcomes=batch.items.map(item=>resultByItem.get(item.id)||{assetId:item.id,status:'uncertain',note:'No result returned for this asset'});
    writeJournal({batchId:batch.id,itemCount:batch.items.length,phase:'outcomes',outcomes});
    return outcomes;
  }
  async function reportResult(id,outcomes){let lastError;for(let attempt=0;attempt<3;attempt++){try{return await request('result',{id,outcomes},'json',60000)}catch(error){lastError=error;if(attempt<2)await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)))}}throw lastError;}
  const browserSession=workerParams.get('browser_studio_session')||sessionStorage.getItem('browserStudioSession')||'',browserWorker=workerParams.get('browser_studio_worker')||sessionStorage.getItem('browserStudioWorker')||'',browserOrigin=workerParams.get('browser_studio_origin')||sessionStorage.getItem('browserStudioOrigin')||'';
  if(browserSession&&browserWorker&&browserOrigin){sessionStorage.setItem('browserStudioSession',browserSession);sessionStorage.setItem('browserStudioWorker',browserWorker);sessionStorage.setItem('browserStudioOrigin',browserOrigin);runBrowserWorker().catch(error=>setStage(error.message));return;}
  async function runBrowserWorker(){
    const origin=authorizedStudioOrigin(browserOrigin);
    if(!origin)throw new Error('Untrusted Studio origin');
    if(!validId(browserSession)||!validId(browserWorker))throw new Error('Invalid Studio worker session');
    const params=new URLSearchParams({browser_studio_session:browserSession,browser_studio_worker:browserWorker,browser_studio_origin:origin}),url=path=>`${path}?${params}`;
    if(location.pathname==='/submit/sticker'){setStage('refreshing Emoji.gg upload form');setTimeout(()=>location.replace(url('/submit')),350);return;}
    if(location.pathname!=='/submit')throw new Error('Open the Emoji.gg emoji submit page');
    studioLink.href=origin;studioLink.textContent='Open Upload Studio ↗';statusText.textContent='Emoji.gg bridge: ready';queueText.textContent=`Upload tab ${browserWorker.slice(0,8)} · waiting for a batch`;
    let active=false;
    const send=(type,data={})=>window.opener?.postMessage({type,session:browserSession,workerId:browserWorker,...data},origin);
    window.addEventListener('message',async event=>{
      if(event.source!==window.opener||event.origin!==origin||event.data?.type!=='EMOTE_FORGE_BATCH'||event.data?.session!==browserSession||event.data?.workerId!==browserWorker||active)return;
      const batch=event.data.batch,files=event.data.files||[],items=batch?.items;
      if(!validId(batch?.id)||!Array.isArray(items)||items.length<1||items.length>10||files.length!==items.length||new Set(items.map(item=>item?.id)).size!==items.length||items.some(item=>!item||typeof item.id!=='string'||typeof item.filename!=='string'||typeof item.title!=='string')){setStage('rejected malformed batch');return;}
      active=true;
      try{setStage(`uploading ${batch.items.length} items`);const outcomes=await upload(batch,files);send('EMOTE_FORGE_RESULT',{batchId:batch.id,outcomes});setStage(`${outcomes.filter(item=>item.status==='submitted').length}/${outcomes.length} submitted`);setTimeout(()=>location.replace(url('/submit/sticker')),500);}
      catch(error){const status=batch?.submittedToSite?'uncertain':'retry',outcomes=(batch?.items||[]).map(item=>({assetId:item.id,status,note:String(error.message||error).slice(0,300)}));send('EMOTE_FORGE_RESULT',{batchId:batch?.id||'',outcomes,error:String(error.message||error)});setStage(`batch ${status}: ${error.message}`);active=false;setTimeout(()=>location.replace(url('/submit/sticker')),500);}
    });
    send('EMOTE_FORGE_READY');setInterval(()=>send('EMOTE_FORGE_HEARTBEAT',{stage:workerStage,active}),5000);
  }
  let busy=false,legacyMode=false,duplicateMode=false,helloPromise=null;
  async function announce(){
    if(helloPromise)return helloPromise;
    helloPromise=(async()=>{
      const hello=await request('hello',{version:'0.4.0',scriptVersion:'0.9.6',heartbeat:true,clientId,installationId,pageInstanceId,pageStartedAt:performance.timeOrigin,stage:workerStage,progressAt,account:observedAccount()});
      if(hello.reloadRequired){const key=`uploadStudioReloaded:${hello.minimumVersion}`;if(!sessionStorage.getItem(key)){sessionStorage.setItem(key,'1');setStage(`updating userscript to ${hello.minimumVersion}`);location.reload();await new Promise(()=>{});}throw new Error(`Userscript ${hello.minimumVersion} must match Upload Studio; update it in Tampermonkey and reload`);}
      if(hello.retire||hello.duplicate){duplicateMode=true;workerSession='';setStage(hello.retire?'surplus worker closing':hello.activeLease?'waiting for active page instance':'duplicate worker closing');if(hello.closeAllowed&&openedByStudio)setTimeout(closeWorkerTab,300);return hello;}
      duplicateMode=false;
      workerSession=hello.session;
      for(const id of hello.spawnIds||[])GM_openInTab(`https://emoji.gg/submit?upload_studio_worker=${encodeURIComponent(id)}`,{active:false,insert:true});
      return hello;
    })();
    try{return await helloPromise}finally{helloPromise=null}
  }
  async function tick() {
    if(busy||legacyMode)return;busy=true;
    try{
      if(!token){token=await pair();GM_setValue('queueToken',token);say('paired with local studio');}
      await announce();
      if(duplicateMode)return;
      const status=await request('status');showQueue(status);if(!status.running||status.paused&&!status.leased){say(status.paused?'paused':'idle');if(openedByStudio&&!status.running&&!status.queued&&!status.leased)setTimeout(closeWorkerTab,500);return;}
      if(location.pathname==='/submit/sticker'){location.href=workerUrl('/submit');return;}
      if(location.pathname!=='/submit')return;
      const next=await request('next');if(next.blocked){const journal=readJournal();if(journal?.batchId===next.blocked.id&&journal.phase==='outcomes'&&Array.isArray(journal.outcomes)){setStage('restoring saved submission results');await reportResult(journal.batchId,journal.outcomes);clearJournal();location.href=workerUrl('/submit/sticker');return;}if(journal?.batchId===next.blocked.id&&journal.phase==='leased'){setStage('returning interrupted pre-submit batch');await reportResult(journal.batchId,Array.from({length:next.blocked.itemCount},()=>({status:'retry',note:'Worker reloaded before site submission'})));clearJournal();location.href=workerUrl('/submit/sticker');return;}setStage('holding unowned batch for review');await reportResult(next.blocked.id,Array.from({length:next.blocked.itemCount},()=>({status:'uncertain',note:'Replacement page had no matching durable submission journal; manual reconciliation required'})));clearJournal();return;}const {batch}=next;if(!batch){setStage('ready for next batch');return;}
      writeJournal({batchId:batch.id,itemCount:batch.items.length,phase:'leased'});
      setStage(`uploading ${batch.items.length}; ${status.queued} queued`);
      try{const outcomes=await upload(batch);await reportResult(batch.id,outcomes);clearJournal();setStage(`${outcomes.filter(x=>x.status==='submitted').length}/${outcomes.length} submitted`);location.href=workerUrl('/submit/sticker');}
      catch(error){
        const saved=readJournal();if(saved?.batchId===batch.id&&saved.phase==='outcomes'&&Array.isArray(saved.outcomes)){setStage(`result acknowledgement pending: ${error.message}`);console.error('[Emoji queue]',error);return;}
        const status=batch.submittedToSite?'uncertain':'retry';
        setStage(`batch ${status}: ${error.message}`);
        const outcomes=batch.items.map(()=>({status,note:error.message}));writeJournal({batchId:batch.id,itemCount:batch.items.length,phase:'outcomes',outcomes});await reportResult(batch.id,outcomes);clearJournal();
        console.error('[Emoji queue]',error);
        location.href=workerUrl('/submit/sticker');
      }
    }catch(error){const old=legacyWorker();if(old){old.append(studioLink);legacyMode=true;badge.remove();setInterval(()=>{const current=legacyWorker();if(current)current.append(studioLink);},1000);return;}if(/Invalid queue token/.test(error.message)){token='';GM_setValue('queueToken','');workerSession='';}queueText.textContent='';queueButton.style.display='none';say(error.message);}finally{busy=false;}
  }
  setInterval(()=>{if(token&&!legacyMode&&(busy||duplicateMode))announce().catch(()=>{});},5000);
  setInterval(tick,2500);tick();
})();
