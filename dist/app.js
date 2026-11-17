import { CompanionScene } from './scene.js';
import { CompanionInteraction } from './interaction.js';
import { LocalCompanionAI } from './local-ai.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
let scene;
let interaction;
let ai;
let actionTimer;
let toastTimer;
let bubbleTimer;
let arBusy = false;
let settings = {name:'MOMO',color:'#c7b4e7',accessory:'leaf',voice:true};
try { const saved=JSON.parse(localStorage.getItem('momo-appearance')||'null'); if(saved && typeof saved==='object') settings={...settings,...saved}; } catch {}
settings.name=String(settings.name||'MOMO').slice(0,12);
if(!/^#[a-f0-9]{6}$/i.test(settings.color))settings.color='#c7b4e7';
if(!['leaf','flower','none'].includes(settings.accessory))settings.accessory='leaf';
function persist(){try{localStorage.setItem('momo-appearance',JSON.stringify(settings));}catch{}}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4800);}
function showBubble(text){$('#speech-bubble').textContent=text;$('#speech-bubble').style.opacity='1';clearTimeout(bubbleTimer);bubbleTimer=setTimeout(()=>$('#speech-bubble').style.opacity='0',6500);$('#ar-caption').textContent=text;}
const actionNames={idle:'今天也想和你一起玩',wave:'嗨！送你一個小小的招呼',dance:'快樂搖擺中，跟我一起跳！',sing:'正在哼一首原創小曲 ♪',happy:'開心到小耳朵都晃起來了'};
function setAction(action){scene?.setAction(action);$('#activity-label').textContent=actionNames[action]||actionNames.idle;$$('[data-action]').forEach(el=>el.classList.toggle('active',el.dataset.action===action));}
function updateDraft(text){if(!text){$('#ai-draft')?.remove();return;}let draft=$('#ai-draft');if(!draft){draft=document.createElement('div');draft.id='ai-draft';draft.className='message assistant';const avatar=document.createElement('div');avatar.className='message-avatar';avatar.textContent='m';const bubble=document.createElement('div');bubble.className='bubble';draft.append(avatar,bubble);$('#messages').appendChild(draft);}draft.querySelector('.bubble').textContent=text||'正在想怎麼回答…';$('#messages').scrollTop=$('#messages').scrollHeight;}
function addMessage({role,text}){
 if(role==='assistant')$('#ai-draft')?.remove();
 const wrapper=document.createElement('div');wrapper.className='message '+(role==='user'?'user':'assistant');
 if(role!=='user'){const avatar=document.createElement('div');avatar.className='message-avatar';avatar.textContent='m';wrapper.appendChild(avatar);}
 const bubble=document.createElement('div');bubble.className='bubble';bubble.textContent=text;
 const time=document.createElement('span');time.className='bubble-time';time.textContent=new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'});bubble.appendChild(time);wrapper.appendChild(bubble);$('#messages').appendChild(wrapper);$('#messages').scrollTop=$('#messages').scrollHeight;
 if(role!=='user') showBubble(text);
}
function updateName(value,normalize=true){settings.name=value.trim().slice(0,12)||'MOMO';if(normalize)$('#character-name').value=settings.name;$('#profile-name').textContent=settings.name;$('#chat-name').textContent=settings.name;$('#chat-input').placeholder=`說點什麼給 ${settings.name} 聽…`;$$('.inline-name').forEach(el=>el.textContent=settings.name);interaction?.setName?.(settings.name);persist();}
function selectColor(value){settings.color=value;scene?.setColor(value);$$('.profile-art svg [data-tint]').forEach(el=>el.setAttribute('fill',value));$$('[data-color]').forEach(el=>{const selected=el.dataset.color===value;el.classList.toggle('selected',selected);el.setAttribute('aria-pressed',String(selected));el.innerHTML=selected?'<svg><use href="#i-check"/></svg>':'';if(selected)$('#color-name').textContent=el.dataset.label;});persist();}
function selectAccessory(value){settings.accessory=value;scene?.setAccessory(value==='leaf'?'sprout':value);$$('[data-accessory]').forEach(el=>{el.classList.toggle('selected',el.dataset.accessory===value);el.setAttribute('aria-pressed',String(el.dataset.accessory===value));});persist();}
function updateMode(mode){const isAR=mode==='ar';document.body.classList.toggle('ar-active',isAR);$('#ar-overlay').hidden=!isAR;$('#preview-tab').classList.toggle('selected',!isAR);$('#ar-tab').classList.toggle('selected',isAR);if(!isAR){$('#device-label').textContent=scene?.supportsAR?'WebAR 裝置可用':'3D 互動已就緒';}}
function syncTransform(value){if(Number.isFinite(value.scale)){const percent=Math.round(value.scale*100);$('#scale').value=String(percent);$('#scale-output').value=percent+'%';$('#ar-scale').value=String(percent);$('#ar-scale-output').value=percent+'%';}}
function handleStatus(status){if(status.transformOnly){syncTransform(status);return;}if(status.mode==='ar'){$('#ar-instruction').textContent=status.message.replaceAll('MOMO',settings.name);const btn=$('#ar-place');btn.disabled=!status.ready||status.placed;btn.hidden=!!status.placed;btn.textContent=status.ready?'放在這裡':'尋找地面中…';}else if(status.supported!==undefined){$('#device-label').textContent=status.renderer==='software'?'省電 3D 預覽':status.supported?'WebAR 裝置可用':'3D 互動已就緒';}}
function handleInteractionState(state){
 $('#mic').classList.toggle('listening',state.listening);$('#ar-mic').classList.toggle('listening',state.listening);$('#mic').setAttribute('aria-label',state.listening?'停止語音輸入':'開始語音輸入');
 $('#voice-toggle').setAttribute('aria-pressed',String(state.voiceEnabled));$('#voice-toggle').setAttribute('aria-label',state.voiceEnabled?'關閉語音朗讀':'開啟語音朗讀');$('#voice-toggle').style.opacity=state.voiceEnabled?'1':'.4';$('#voice-setting').checked=state.voiceEnabled;
 $('#chat-status').textContent=state.listening?'正在聽你說話…':state.singing?'正在哼原創小曲…':state.thinking?'正在想怎麼回答…':ai?.ready?'AI 已就緒，陪你聊聊':'請先啟用 AI 對話';
 $('#stop-ai').hidden=!state.thinking;if(!state.thinking)$('#ai-draft')?.remove();
 $('#input-hint').textContent=state.listening?'正在聽…':'按 Enter 送出';
 if(state.transcript){$('#chat-input').placeholder=state.transcript;$('#ar-caption').textContent='聽見：'+state.transcript;}
 if(state.notice)toast(state.notice);
}
try{
 scene=new CompanionScene({container:$('#stage'),onStatus:handleStatus,onModeChange:updateMode});
 $('#scene-loading').remove();
 selectColor(settings.color);selectAccessory(settings.accessory);
}catch(error){$('#scene-loading').classList.add('error');$('#scene-loading').textContent='這個瀏覽器暫時無法顯示 3D。請開啟硬體加速，或改用手機 Chrome 再試一次。';$('#enter-ar').disabled=true;toast('3D 載入失敗，仍可使用下方的文字對話。');console.error('3D initialization failed',error);}
ai=new LocalCompanionAI({name:settings.name,onProgress:progress=>{if(Number.isFinite(progress.progress))$('#ai-progress').value=progress.progress;$('#ai-progress-label').textContent=progress.message||'正在準備 AI…';}});
$('#enable-ai').addEventListener('click',async()=>{const button=$('#enable-ai');button.disabled=true;button.textContent='正在啟用…';$('#ai-loading').hidden=false;try{await ai.initialize();$('#ai-setup').classList.add('ready');$('#ai-setup-note').textContent='AI 已就緒！現在可以開始聊天；這是裝置上執行的輕量模型。';$('#ai-badge').textContent='AI 已就緒';button.hidden=true;$('#ai-loading').hidden=true;$('#chat-status').textContent='AI 已就緒，陪你聊聊';showBubble('我準備好了，想聊些什麼呢？');toast('AI 已啟用。試著先告訴我您的名字！');}catch(error){button.disabled=false;button.textContent='重新啟用 AI';$('#ai-progress-label').textContent=error.message;toast(error.message);}});
interaction=new CompanionInteraction({ai,onDraft:updateDraft,onMessage:addMessage,onAction:setAction,onSpeaking:(speaking)=>scene?.setSpeaking(speaking),onState:handleInteractionState});
interaction.setVoiceEnabled(settings.voice!==false);updateName(settings.name);
$('#character-name').addEventListener('input',event=>updateName(event.target.value,false));
$('#character-name').addEventListener('change',event=>updateName(event.target.value));
$('#character-name').addEventListener('keydown',event=>{if(event.key==='Enter'){event.target.blur();}});
$$('[data-color]').forEach(el=>el.addEventListener('click',()=>selectColor(el.dataset.color)));
$$('[data-accessory]').forEach(el=>el.addEventListener('click',()=>selectAccessory(el.dataset.accessory)));
$('#generate').addEventListener('click',()=>{const colors=$$('[data-color]');let choices=colors.filter(el=>el.dataset.color!==settings.color);const color=choices[Math.floor(Math.random()*choices.length)];const accessories=['leaf','flower','none'];selectColor(color.dataset.color);selectAccessory(accessories[Math.floor(Math.random()*3)]);const names=['MOMO','LULU','NINI','POPO','米米','朵朵','糯糯','小芽'];updateName(names[Math.floor(Math.random()*names.length)]);interaction.stop();setAction('happy');showBubble(`嗨，我是 ${settings.name}，請多多指教 ♡`);toast('新夥伴誕生了！試試和它打招呼。');clearTimeout(actionTimer);actionTimer=setTimeout(()=>setAction('idle'),4500);});
async function doAction(action){
 clearTimeout(actionTimer);interaction.unlockAudio();
 if(action==='sing') {await interaction.sing();return;}
 interaction.stop();setAction(action);
 if(action==='wave') showBubble('嗨！很高興遇見你 ♡');
 if(action==='dance') showBubble('一起搖搖擺擺！♫');
 actionTimer=setTimeout(()=>setAction('idle'),action==='dance'?18000:5000);
}
$$('[data-action]').forEach(el=>el.addEventListener('click',()=>doAction(el.dataset.action)));
async function sendText(text){clearTimeout(actionTimer);if(!text.trim())return;interaction.unlockAudio();await interaction.send(text);}
$('#chat-form').addEventListener('submit',event=>{event.preventDefault();const input=$('#chat-input');const text=input.value;input.value='';sendText(text);});
$('#ar-chat-form').addEventListener('submit',event=>{event.preventDefault();const input=$('#ar-chat-input');const text=input.value;input.value='';sendText(text);});
$$('[data-prompt]').forEach(el=>el.addEventListener('click',()=>sendText(el.dataset.prompt)));
$('#mic').addEventListener('click',()=>{clearTimeout(actionTimer);interaction.toggleListening();});
$('#ar-mic').addEventListener('click',()=>{clearTimeout(actionTimer);interaction.toggleListening();});
function setVoice(value){settings.voice=value;interaction.setVoiceEnabled(value);persist();toast(value?'已開啟語音朗讀':'已關閉語音朗讀與哼歌聲音');}
$('#voice-toggle').addEventListener('click',()=>setVoice(!interaction.voiceEnabled));$('#voice-setting').addEventListener('change',event=>setVoice(event.target.checked));
for(const id of ['#scale','#ar-scale'])$(id).addEventListener('input',event=>{const scale=Number(event.target.value)/100;scene?.setScale(scale);syncTransform({scale});});
$$('[data-rotate]').forEach(el=>el.addEventListener('click',()=>scene?.rotateCharacter(Number(el.dataset.rotate)*Math.PI/8)));
$('#skeleton').addEventListener('change',event=>scene?.toggleSkeleton(event.target.checked));
$('#reset').addEventListener('click',()=>{scene?.resetView();$('#scale').value='100';$('#scale-output').value='100%';scene?.setScale(1);scene?.setRotation(0);syncTransform({scale:1});toast('已回到最初的視角');});
$('#capture').addEventListener('click',()=>{if(!scene)return;try{const data=scene.capture();const link=document.createElement('a');link.download='MOMO-'+new Date().toISOString().slice(0,10)+'.png';link.href=data;link.click();toast('已拍下可愛的小夥伴');}catch(error){toast(error.message||'拍照暫時無法使用');}});
async function enterAR(){if(arBusy||!scene)return;arBusy=true;$('#enter-ar').disabled=true;try{interaction.unlockAudio();const result=await scene.enterAR();if(!result.supported){toast(result.reason||'此裝置暫不支援地面定位，您仍可以使用 3D 互動預覽。');}}catch(error){toast(error.message||'AR 暫時無法啟動，請確認相機權限。');}finally{arBusy=false;$('#enter-ar').disabled=false;}}
$('#enter-ar').addEventListener('click',enterAR);$('#ar-tab').addEventListener('click',enterAR);$('#preview-tab').addEventListener('click',()=>{if(scene?.mode==='ar')scene.exitAR();else scene?.resetView();});
$('#exit-ar').addEventListener('click',()=>{interaction.stop();scene?.exitAR();});$('#ar-reset').addEventListener('click',()=>scene?.resetView());$('#ar-place').addEventListener('click',()=>{if(scene?.placeAR())showBubble('找到你了！我們一起玩吧 ♡');});
$('#ar-overlay').addEventListener('beforexrselect',event=>{if(event.target.closest('button,input,form'))event.preventDefault();});
$$('[data-open]').forEach(el=>el.addEventListener('click',()=>$('#'+el.dataset.open).showModal()));$$('[data-close]').forEach(el=>el.addEventListener('click',()=>el.closest('dialog').close()));
$$('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();}}));
$('#stop-ai').addEventListener('click',()=>interaction.stop());
$('#clear-chat').addEventListener('click',()=>{interaction.stop();interaction.clearHistory();$('#messages').replaceChildren();addMessage({role:'assistant',text:`嗨，我是 ${settings.name}！新的小對話，從現在開始。`});$('#settings').close();toast('對話紀錄已清除');});
document.addEventListener('visibilitychange',()=>{if(document.hidden)interaction.stop();});
window.addEventListener('pagehide',()=>{interaction.destroy();ai?.dispose();scene?.dispose();});
